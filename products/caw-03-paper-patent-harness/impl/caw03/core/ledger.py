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
    Claim,
    ClaimType,
    Evidence,
    EvidenceKind,
    GateStatus,
    Lifecycle,
    RawBundle,
    ResultRef,
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
    gate_status TEXT NOT NULL DEFAULT 'pending'
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
    confidentiality_track TEXT NOT NULL DEFAULT 'public_safe',
    engine_run_id TEXT,
    review_id TEXT,
    output_ref TEXT,
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
                "(claim_id, bundle_id, type, statement, result_refs, gate_status) "
                "VALUES (?,?,?,?,?,?)",
                (c.claim_id, bundle.bundle_id, c.type.value, c.statement,
                 json.dumps(c.result_refs), c.gate_status.value),
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
                        confidentiality_track: str = "public_safe") -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO artifact "
            "(id, type, state, gated_set_id, confidentiality_track, engine_run_id, "
            " review_id, output_ref, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (artifact_id, type, state.value, gated_set_id, confidentiality_track,
             engine_run_id, review_id, output_ref, now),
        )
        self.conn.commit()

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
