"""Claim ledger — a SQLite projection over an imported CAW-02 signed bundle.

CAW-03 does NOT re-own the knowledge repo (ADR-0003 option C): it verifies the
bundle digest, references claims/evidence by id/URI, and stores only typing + gate
status + draft routing + its own artifacts. The provenance chain
`Artifact → GatedClaimSet → ClaimRef → evidence_refs → result_id` is reconstructable.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path

from .models import (
    Boundary,
    Claim,
    ClaimType,
    Evidence,
    EvidenceKind,
    GateStatus,
    InterlockStatus,
    Lifecycle,
    RawBundle,
    ResultRef,
    Visibility,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS bundle (
    bundle_id TEXT PRIMARY KEY,
    source_adapter TEXT NOT NULL,
    boundary TEXT NOT NULL,
    digest TEXT,
    digest_ok INTEGER NOT NULL DEFAULT 0,
    signature TEXT,
    provenance_manifest TEXT,
    imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS claim (
    claim_id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL REFERENCES bundle(bundle_id),
    type TEXT NOT NULL,
    statement TEXT NOT NULL,
    result_refs TEXT NOT NULL DEFAULT '[]',
    gate_status TEXT NOT NULL DEFAULT 'pending',
    boundary TEXT NOT NULL DEFAULT 'confidential',
    visibility TEXT NOT NULL DEFAULT 'private'
);
CREATE TABLE IF NOT EXISTS evidence (
    id TEXT NOT NULL,
    claim_id TEXT NOT NULL REFERENCES claim(claim_id),
    kind TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    trust REAL,
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (claim_id, id)
);
CREATE TABLE IF NOT EXISTS result_ref (
    result_id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL REFERENCES bundle(bundle_id),
    description TEXT NOT NULL DEFAULT '',
    metrics TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS gated_set (
    id TEXT PRIMARY KEY,
    bundle_id TEXT NOT NULL,
    profile TEXT NOT NULL,
    claim_ids TEXT NOT NULL,
    gated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    state TEXT NOT NULL,
    gated_set_id TEXT NOT NULL,
    confidentiality_track TEXT NOT NULL DEFAULT 'internal-review-required',
    boundary TEXT NOT NULL DEFAULT 'confidential',
    visibility TEXT NOT NULL DEFAULT 'private',
    engine_run_id TEXT,
    review_id TEXT,
    output_ref TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lifecycle_event (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    artifact_id TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT NOT NULL,
    reason TEXT,
    actor TEXT NOT NULL,
    detail TEXT,
    prev_hash TEXT,
    hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS interlock (
    claim_id TEXT PRIMARY KEY,
    patent_first INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'held',
    reason TEXT,
    actor TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS engine_run (
    id TEXT PRIMARY KEY,
    engine_adapter TEXT NOT NULL,
    workspace_path TEXT NOT NULL,
    outputs TEXT NOT NULL DEFAULT '{}',
    provenance TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
"""


def canonical_digest(bundle: RawBundle) -> str:
    """Deterministic sha256 over the claims+evidence+results (bundle integrity)."""
    payload = {
        "bundle_id": bundle.bundle_id,
        "claims": [
            {
                "claim_id": c.claim_id,
                "type": c.type.value,
                "statement": c.statement,
                # The confidentiality labels are load-bearing and never re-derived, so
                # they MUST be covered by the integrity digest — otherwise a flipped
                # boundary/visibility (confidential→public) would import as digest_ok.
                "boundary": c.boundary.value,
                "visibility": c.visibility.value,
                "evidence": [
                    {"id": e.id, "kind": e.kind.value, "ref": e.ref} for e in c.evidence
                ],
                "result_refs": list(c.result_refs),
            }
            for c in bundle.claims
        ],
        "results": [
            {"result_id": r.result_id, "metrics": r.metrics} for r in bundle.results
        ],
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


class Ledger:
    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # ---- import projection -------------------------------------------------
    def import_bundle_projection(self, bundle: RawBundle, now: str) -> tuple[bool, str]:
        """Store the projection. Returns (digest_ok, computed_digest).

        If the bundle declares a digest, it must match; a mismatch is a hard error
        (the bundle was tampered or mis-exported). A missing digest is allowed but
        recorded as unverified (v1 CAW-02 export may not yet sign).
        """
        computed = canonical_digest(bundle)
        digest_ok = True
        if bundle.digest is not None and bundle.digest != computed:
            raise ValueError(
                f"bundle {bundle.bundle_id!r} digest mismatch: "
                f"declared {bundle.digest} != computed {computed}"
            )
        if bundle.digest is None:
            digest_ok = False  # unverified, but importable in v1

        cur = self.conn
        # Clear any prior projection of this bundle in child → parent order so the
        # re-insert never trips a foreign-key constraint (re-import is idempotent).
        cur.execute(
            "DELETE FROM evidence WHERE claim_id IN "
            "(SELECT claim_id FROM claim WHERE bundle_id=?)", (bundle.bundle_id,))
        cur.execute("DELETE FROM claim WHERE bundle_id=?", (bundle.bundle_id,))
        cur.execute("DELETE FROM result_ref WHERE bundle_id=?", (bundle.bundle_id,))
        cur.execute("DELETE FROM bundle WHERE bundle_id=?", (bundle.bundle_id,))

        cur.execute(
            "INSERT INTO bundle "
            "(bundle_id, source_adapter, boundary, digest, digest_ok, signature, "
            " provenance_manifest, imported_at) VALUES (?,?,?,?,?,?,?,?)",
            (bundle.bundle_id, bundle.source_adapter, bundle.boundary, computed,
             int(digest_ok), bundle.signature,
             json.dumps(bundle.provenance_manifest), now),
        )
        for c in bundle.claims:
            cur.execute(
                "INSERT INTO claim "
                "(claim_id, bundle_id, type, statement, result_refs, gate_status, "
                " boundary, visibility) VALUES (?,?,?,?,?,?,?,?)",
                (c.claim_id, bundle.bundle_id, c.type.value, c.statement,
                 json.dumps(c.result_refs), c.gate_status.value,
                 c.boundary.value, c.visibility.value),
            )
            for e in c.evidence:
                cur.execute(
                    "INSERT INTO evidence (id, claim_id, kind, ref, trust, note) "
                    "VALUES (?,?,?,?,?,?)",
                    (e.id, c.claim_id, e.kind.value, e.ref, e.trust, e.note),
                )
        for r in bundle.results:
            cur.execute(
                "INSERT INTO result_ref "
                "(result_id, bundle_id, description, metrics) VALUES (?,?,?,?)",
                (r.result_id, bundle.bundle_id, r.description, json.dumps(r.metrics)),
            )
        self.conn.commit()
        return digest_ok, computed

    # ---- reads -------------------------------------------------------------
    def get_claims(self, bundle_id: str) -> list[Claim]:
        rows = self.conn.execute(
            "SELECT * FROM claim WHERE bundle_id=? ORDER BY claim_id", (bundle_id,)
        ).fetchall()
        return [self._row_to_claim(r) for r in rows]

    def get_claim(self, claim_id: str) -> Claim | None:
        row = self.conn.execute(
            "SELECT * FROM claim WHERE claim_id=?", (claim_id,)
        ).fetchone()
        return self._row_to_claim(row) if row else None

    def _row_to_claim(self, row: sqlite3.Row) -> Claim:
        ev_rows = self.conn.execute(
            "SELECT * FROM evidence WHERE claim_id=? ORDER BY id", (row["claim_id"],)
        ).fetchall()
        evidence = [
            Evidence(
                id=e["id"],
                kind=EvidenceKind(e["kind"]),
                ref=e["ref"],
                trust=e["trust"],
                note=e["note"],
            )
            for e in ev_rows
        ]
        return Claim(
            claim_id=row["claim_id"],
            type=ClaimType(row["type"]),
            statement=row["statement"],
            evidence=evidence,
            result_refs=json.loads(row["result_refs"]),
            gate_status=GateStatus(row["gate_status"]),
            boundary=Boundary(row["boundary"]),
            visibility=Visibility(row["visibility"]),
        )

    def get_results(self, bundle_id: str) -> list[ResultRef]:
        rows = self.conn.execute(
            "SELECT * FROM result_ref WHERE bundle_id=? ORDER BY result_id", (bundle_id,)
        ).fetchall()
        return [
            ResultRef(result_id=r["result_id"], description=r["description"],
                      metrics=json.loads(r["metrics"]))
            for r in rows
        ]

    def get_result(self, result_id: str) -> ResultRef | None:
        r = self.conn.execute(
            "SELECT * FROM result_ref WHERE result_id=?", (result_id,)
        ).fetchone()
        return ResultRef(result_id=r["result_id"], description=r["description"],
                         metrics=json.loads(r["metrics"])) if r else None

    def bundle_digest_ok(self, bundle_id: str) -> bool:
        r = self.conn.execute(
            "SELECT digest_ok FROM bundle WHERE bundle_id=?", (bundle_id,)
        ).fetchone()
        return bool(r and r["digest_ok"])

    # ---- writes ------------------------------------------------------------
    def set_gate_status(self, claim_id: str, status: GateStatus) -> None:
        self.conn.execute(
            "UPDATE claim SET gate_status=? WHERE claim_id=?", (status.value, claim_id)
        )
        self.conn.commit()

    def create_gated_set(self, set_id: str, bundle_id: str, profile: str,
                         claim_ids: list[str], now: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO gated_set (id, bundle_id, profile, claim_ids, gated_at) "
            "VALUES (?,?,?,?,?)",
            (set_id, bundle_id, profile, json.dumps(claim_ids), now),
        )
        self.conn.commit()

    def get_gated_set(self, set_id: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM gated_set WHERE id=?", (set_id,)).fetchone()
        if not r:
            return None
        return {"id": r["id"], "bundle_id": r["bundle_id"], "profile": r["profile"],
                "claim_ids": json.loads(r["claim_ids"]), "gated_at": r["gated_at"]}

    def record_engine_run(self, run_id: str, engine_adapter: str, workspace_path: str,
                          outputs: dict, provenance: dict, now: str) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO engine_run "
            "(id, engine_adapter, workspace_path, outputs, provenance, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (run_id, engine_adapter, workspace_path, json.dumps(outputs),
             json.dumps(provenance), now),
        )
        self.conn.commit()

    def upsert_artifact(self, artifact_id: str, type: str, state: Lifecycle,
                        gated_set_id: str, now: str, engine_run_id: str | None = None,
                        review_id: str | None = None, output_ref: str | None = None,
                        confidentiality_track: str | None = None,
                        boundary: str | None = None,
                        visibility: str | None = None) -> None:
        # On a state-only advance, callers omit labels/refs; preserve the prior values
        # so a later transition never silently downgrades the classification or loses
        # the engine output. Fail-closed defaults only when there is no prior row.
        prev = self.get_artifact(artifact_id) or {}

        def _keep(new, key, closed):
            return new if new is not None else prev.get(key, closed)

        self.conn.execute(
            "INSERT OR REPLACE INTO artifact "
            "(id, type, state, gated_set_id, confidentiality_track, boundary, visibility, "
            " engine_run_id, review_id, output_ref, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (artifact_id, type, state.value, gated_set_id,
             _keep(confidentiality_track, "confidentiality_track", "internal-review-required"),
             _keep(boundary, "boundary", "confidential"),
             _keep(visibility, "visibility", "private"),
             _keep(engine_run_id, "engine_run_id", None),
             _keep(review_id, "review_id", None),
             _keep(output_ref, "output_ref", None), now),
        )
        self.conn.commit()

    def get_artifact(self, artifact_id: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM artifact WHERE id=?", (artifact_id,)).fetchone()
        return dict(r) if r else None

    def set_artifact_state(self, artifact_id: str, state: Lifecycle, now: str) -> None:
        self.conn.execute(
            "UPDATE artifact SET state=?, updated_at=? WHERE id=?",
            (state.value, now, artifact_id),
        )
        self.conn.commit()

    def list_artifacts(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM artifact ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    # ---- hash-chained lifecycle event log ----------------------------------
    def append_lifecycle_event(self, artifact_id: str, from_state: str | None,
                               to_state: str, actor: str, now: str,
                               reason: str | None = None, detail: dict | None = None) -> str:
        row = self.conn.execute(
            "SELECT hash FROM lifecycle_event ORDER BY seq DESC LIMIT 1"
        ).fetchone()
        prev_hash = row["hash"] if row else ""
        detail_json = json.dumps(detail or {}, sort_keys=True)
        payload = f"{prev_hash}|{artifact_id}|{from_state}|{to_state}|{reason}|{actor}|{detail_json}|{now}"
        h = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        self.conn.execute(
            "INSERT INTO lifecycle_event "
            "(artifact_id, from_state, to_state, reason, actor, detail, prev_hash, hash, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (artifact_id, from_state, to_state, reason, actor, detail_json, prev_hash, h, now),
        )
        self.conn.commit()
        return h

    def get_lifecycle_events(self, artifact_id: str | None = None) -> list[dict]:
        if artifact_id:
            rows = self.conn.execute(
                "SELECT * FROM lifecycle_event WHERE artifact_id=? ORDER BY seq",
                (artifact_id,)).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM lifecycle_event ORDER BY seq").fetchall()
        return [dict(r) for r in rows]

    def verify_lifecycle(self) -> bool:
        """Recompute the hash chain across all events; True iff intact."""
        prev_hash = ""
        for r in self.conn.execute("SELECT * FROM lifecycle_event ORDER BY seq").fetchall():
            payload = (f"{prev_hash}|{r['artifact_id']}|{r['from_state']}|{r['to_state']}|"
                       f"{r['reason']}|{r['actor']}|{r['detail']}|{r['created_at']}")
            if hashlib.sha256(payload.encode("utf-8")).hexdigest() != r["hash"]:
                return False
            prev_hash = r["hash"]
        return True

    # ---- patent-first interlock (L3a) --------------------------------------
    def ensure_interlock(self, claim_id: str, now: str, patent_first: bool = True) -> None:
        exists = self.conn.execute(
            "SELECT 1 FROM interlock WHERE claim_id=?", (claim_id,)).fetchone()
        if not exists:
            self.conn.execute(
                "INSERT INTO interlock (claim_id, patent_first, status, updated_at) "
                "VALUES (?,?,?,?)",
                (claim_id, int(patent_first), InterlockStatus.HELD.value, now))
            self.conn.commit()

    def get_interlock_status(self, claim_id: str) -> InterlockStatus:
        r = self.conn.execute(
            "SELECT status FROM interlock WHERE claim_id=?", (claim_id,)).fetchone()
        return InterlockStatus(r["status"]) if r else InterlockStatus.NONE

    def get_interlock(self, claim_id: str) -> dict | None:
        r = self.conn.execute(
            "SELECT * FROM interlock WHERE claim_id=?", (claim_id,)).fetchone()
        return dict(r) if r else None

    def set_interlock_status(self, claim_id: str, status: InterlockStatus,
                             actor: str, reason: str | None, now: str) -> None:
        self.conn.execute(
            "UPDATE interlock SET status=?, actor=?, reason=?, updated_at=? WHERE claim_id=?",
            (status.value, actor, reason, now, claim_id))
        self.conn.commit()

    def list_interlocks(self, bundle_id: str | None = None) -> list[dict]:
        if bundle_id:
            rows = self.conn.execute(
                "SELECT i.* FROM interlock i JOIN claim c ON c.claim_id=i.claim_id "
                "WHERE c.bundle_id=? ORDER BY i.claim_id", (bundle_id,)).fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM interlock ORDER BY claim_id").fetchall()
        return [dict(r) for r in rows]
