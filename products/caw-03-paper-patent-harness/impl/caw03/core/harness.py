"""The harness core — the single place governance lives (ADR-0001).

Exposes the vetted, typed operations of the op-manifest. Each op enforces its
invariant in the core; a surface (CLI/API/MCP) can only *request* a transition.
The vertical slice implements: import_bundle → run_gate → assemble_inputs → draft →
run_review, plus get_lifecycle / list_adapters / preflight.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from ..config import HarnessConfig, load_gate_profile
from . import assemble as assemble_mod
from . import confidentiality as conf_mod
from . import gate as gate_mod
from . import registry
from .ledger import Ledger
from .models import (
    Audience,
    Boundary,
    BlockedReason,
    ConfidentialityTrack,
    GateReport,
    GateStatus,
    InterlockStatus,
    Lifecycle,
    Visibility,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _extract_pdf_text(path) -> str | None:
    """Best-effort PDF text extraction for the egress re-sweep: pdftotext CLI, then
    pypdf/PyPDF2 if importable. Returns None when no extractor is available — the
    caller then fail-closes rather than publishing an unswept deliverable."""
    import shutil
    import subprocess

    p = str(path)
    if shutil.which("pdftotext"):
        try:
            r = subprocess.run(["pdftotext", p, "-"], capture_output=True, text=True, timeout=60)
            if r.returncode == 0:
                return r.stdout
        except (OSError, subprocess.SubprocessError):
            pass
    for mod in ("pypdf", "PyPDF2"):
        try:
            m = __import__(mod)
            reader = m.PdfReader(p)
            return "\n".join((pg.extract_text() or "") for pg in reader.pages)
        except Exception:
            continue
    return None


def _sink_audience(sink) -> Audience:
    """The audience tier a Sink adapter exports to (default: internal)."""
    aud = getattr(sink, "audience", None)
    if isinstance(aud, Audience):
        return aud
    try:
        return Audience(aud) if aud else Audience.INTERNAL
    except ValueError:
        return Audience.INTERNAL


class Harness:
    REQUIRED_PORTS_FOR_DRAFT = ["source", "writing_engine", "sink"]

    def __init__(self, config: HarnessConfig | None = None):
        # ensure adapters are registered (import side effects)
        from .. import adapters  # noqa: F401

        self.config = config or HarnessConfig()
        self.data_dir = Path(self.config.data_dir)
        self.ledger = Ledger(str(self.data_dir / "ledger.db"))

    def close(self) -> None:
        self.ledger.close()

    # -- registry / preflight ------------------------------------------------
    def list_adapters(self) -> list[dict]:
        out = []
        for caps in registry.list_adapters():
            spec = self.config.adapters.get(caps.port, {})
            out.append({
                "port": caps.port,
                "id": caps.id,
                "version": caps.version,
                "maturity": caps.maturity.value,
                "selected": spec.get("id") == caps.id,
                "enabled": bool(spec.get("enabled", False)) and spec.get("id") == caps.id,
                "requires_config": list(caps.requires_config),
            })
        return out

    def preflight(self, ports: list[str] | None = None) -> registry.PreflightReport:
        return registry.preflight(ports or self.REQUIRED_PORTS_FOR_DRAFT, self.config.adapters)

    def _adapter(self, port: str):
        return registry.instantiate(port, self.config.adapter_id(port),
                                    self.config.adapter_config(port))

    # -- op: import_bundle ---------------------------------------------------
    def import_bundle(self, ref: str) -> dict:
        source = self._adapter("source")
        bundle = source.import_bundle(ref)
        digest_ok, computed = self.ledger.import_bundle_projection(bundle, _now())
        return {
            "bundle_id": bundle.bundle_id,
            "claims": len(bundle.claims),
            "results": len(bundle.results),
            "digest_ok": digest_ok,
            "computed_digest": computed,
        }

    # -- op: run_gate --------------------------------------------------------
    def run_gate(self, bundle_id: str) -> GateReport:
        claims = self.ledger.get_claims(bundle_id)
        if not claims:
            raise ValueError(f"no claims for bundle {bundle_id!r} (import it first)")
        profile = load_gate_profile(self.config.gate_profile)
        # Patent-first interlock (L3a): a patent-sensitive claim gets a HELD interlock
        # at gate time; the gate then reads the current status (HELD → default-deny).
        for c in claims:
            if c.type.value in profile.patent_sensitive_types:
                self.ledger.ensure_interlock(c.claim_id, _now())
            c.interlock_status = self.ledger.get_interlock_status(c.claim_id)
        report = gate_mod.run_gate(claims, profile, bundle_id)

        for r in report.results:
            self.ledger.set_gate_status(r.claim_id, r.status)

        # Optional defense-in-depth: CUE vet (non-authoritative).
        report_cue_ok, report_cue_detail = gate_mod.cue_vet_snapshot(claims)
        self._last_cue = (report_cue_ok, report_cue_detail)

        # Record the shared gated front (passed claims) + ingest confidentiality
        # classification (lattice-max over passed claims → track). Ingest ROUTES;
        # the load-bearing block is at egress (publish).
        if report.passed_claim_ids:
            self.ledger.create_gated_set(
                self._gated_set_id(bundle_id), bundle_id, profile.name,
                report.passed_claim_ids, _now())
            passed = [self.ledger.get_claim(cid) for cid in report.passed_claim_ids]
            labels = conf_mod.classify([c for c in passed if c])
            art_id = self._artifact_id(bundle_id)
            self.ledger.upsert_artifact(
                art_id, type="paper", state=Lifecycle.GATED,
                gated_set_id=self._gated_set_id(bundle_id), now=_now(),
                confidentiality_track=labels.track.value,
                boundary=labels.boundary.value, visibility=labels.visibility.value)
            self.ledger.append_lifecycle_event(
                art_id, None, Lifecycle.GATED.value, actor="system", now=_now(),
                detail={"track": labels.track.value, "boundary": labels.boundary.value,
                        "visibility": labels.visibility.value,
                        "blocked_claims": report.blocked_claim_ids})
        return report

    # -- op: assemble_inputs -------------------------------------------------
    def assemble_inputs(self, bundle_id: str, template_path: str, guidelines_path: str,
                        title: str = "CAW-03 Draft", target_audience: str = "public") -> dict:
        gated = self.ledger.get_gated_set(self._gated_set_id(bundle_id))
        if not gated or not gated["claim_ids"]:
            raise RuntimeError(
                f"no gated claim set for bundle {bundle_id!r} — run_gate must pass ≥1 claim first")
        audience = Audience(target_audience)
        art_id = self._artifact_id(bundle_id)
        all_claims = [self.ledger.get_claim(cid) for cid in gated["claim_ids"]]
        all_claims = [c for c in all_claims if c is not None]

        # confidentiality-before-assemble (ADR-0002 §5 / ADR-0007): internal-review-
        # required spans must be absent from a public-target assembly BEFORE the engine
        # sees them. A claim not allowed for this audience is dropped from inputs.
        kept, excluded = [], []
        for c in all_claims:
            if conf_mod.decide(c.boundary, c.visibility, audience).allow:
                kept.append(c)
            else:
                excluded.append(c.claim_id)
        if not kept:
            self._block(art_id, Lifecycle.GATED.value, BlockedReason.BOUNDARY,
                        {"excluded": excluded, "target_audience": audience.value})
            raise RuntimeError(
                f"confidentiality: all claims excluded from a {audience.value} assembly "
                f"(BOUNDARY): {excluded}")

        results = self.ledger.get_results(bundle_id)
        template_tex = (Path(template_path).read_text(encoding="utf-8")
                        if template_path and Path(template_path).exists() else "")
        guidelines = (Path(guidelines_path).read_text(encoding="utf-8")
                      if guidelines_path and Path(guidelines_path).exists() else "# Guidelines\n")

        workspace = self._workspace(bundle_id)
        manifest = assemble_mod.assemble_inputs(
            str(workspace), kept, results, template_tex, guidelines, title=title)

        # Re-gate: recompute the effective labels over the claims ACTUALLY assembled.
        labels = conf_mod.classify(kept)
        self.ledger.upsert_artifact(
            art_id, type="paper", state=Lifecycle.DRAFTING, gated_set_id=gated["id"],
            now=_now(), confidentiality_track=labels.track.value,
            boundary=labels.boundary.value, visibility=labels.visibility.value)
        self.ledger.append_lifecycle_event(
            art_id, Lifecycle.GATED.value, Lifecycle.DRAFTING.value, actor="system",
            now=_now(), detail={"kept": [c.claim_id for c in kept], "excluded": excluded,
                                "target_audience": audience.value})
        manifest["artifact_id"] = art_id
        manifest["excluded_claims"] = excluded
        manifest["target_audience"] = audience.value
        return manifest

    def _block(self, artifact_id: str, from_state: str, reason: BlockedReason,
               detail: dict) -> None:
        self.ledger.upsert_artifact(
            artifact_id, type="paper", state=Lifecycle.BLOCKED,
            gated_set_id=self._gated_set_id_from_artifact(artifact_id), now=_now())
        self.ledger.append_lifecycle_event(
            artifact_id, from_state, Lifecycle.BLOCKED.value, actor="system",
            now=_now(), reason=reason.value, detail=detail)

    def _gated_set_id_from_artifact(self, artifact_id: str) -> str:
        art = self.ledger.get_artifact(artifact_id)
        return art["gated_set_id"] if art else artifact_id

    # -- op: draft -----------------------------------------------------------
    def draft(self, bundle_id: str) -> dict:
        pf = self.preflight(self.REQUIRED_PORTS_FOR_DRAFT)
        if not pf.ok:
            raise RuntimeError(
                "preflight failed: " + "; ".join(f"{i.port}/{i.adapter_id}: {i.detail}"
                                                 for i in pf.failures()))
        workspace = self._workspace(bundle_id)
        if not (workspace / "inputs" / "idea.md").exists():
            raise RuntimeError(f"no assembled inputs for {bundle_id!r} — run assemble_inputs first")

        engine = self._adapter("writing_engine")
        out = engine.draft(str(workspace))

        run_id = f"run-{bundle_id}"
        self.ledger.record_engine_run(
            run_id, out.engine_adapter, out.workspace_path,
            outputs={"paper_tex": out.paper_tex_path, "paper_pdf": out.paper_pdf_path,
                     "scores": out.scores},
            provenance=out.provenance, now=_now())

        # Publish outputs via the sink into artifacts/.
        art_id = self._artifact_id(bundle_id)
        sink = self._adapter("sink")
        output_paths = [p for p in (out.paper_pdf_path, out.paper_tex_path) if p]
        dest = sink.publish(art_id, output_paths, str(self.data_dir / "artifacts"))

        self.ledger.upsert_artifact(
            art_id, type="paper", state=Lifecycle.DRAFTED,
            gated_set_id=self._gated_set_id(bundle_id), now=_now(),
            engine_run_id=run_id, output_ref=dest)
        self.ledger.append_lifecycle_event(
            art_id, Lifecycle.DRAFTING.value, Lifecycle.DRAFTED.value, actor="system",
            now=_now(), detail={"engine": out.engine_adapter,
                                "renderer": out.scores.get("renderer")})

        return {
            "artifact_id": art_id,
            "engine": out.engine_adapter,
            "renderer": out.scores.get("renderer"),
            "paper_pdf": out.paper_pdf_path,
            "paper_tex": out.paper_tex_path,
            "staged_to": dest,
        }

    # -- op: publish (the load-bearing egress gate) --------------------------
    def publish(self, bundle_id: str, target_audience: str | None = None) -> dict:
        """Egress gate: decide(artifact, audience) + redaction re-sweep over emitted
        text. Fail-closed: a deny OR any redaction hit aborts and blocks the artifact.
        On pass, records approved → published_paper (a human-attributed transition;
        the CLI operator is the human)."""
        art_id = self._artifact_id(bundle_id)
        art = self.ledger.get_artifact(art_id)
        if not art:
            raise RuntimeError(f"no artifact for {bundle_id!r} — draft it first")
        if art["state"] not in (Lifecycle.DRAFTED.value, Lifecycle.IN_REVIEW.value,
                                Lifecycle.APPROVED.value):
            raise RuntimeError(f"artifact {art_id} is {art['state']}, not drafted — cannot publish")

        sink = self._adapter("sink")
        audience = Audience(target_audience) if target_audience else _sink_audience(sink)
        boundary = Boundary(art["boundary"])
        visibility = Visibility(art["visibility"])

        # 1. Allow-list decision (routes on the effective labels).
        decision = conf_mod.decide(boundary, visibility, audience)

        # 2. Redaction re-sweep over every string the engine emitted AND the actual
        #    to-be-published deliverables (defense in depth: the engine can synthesize a
        #    codename the source bundle never contained). FAIL-CLOSED: if there is
        #    nothing to sweep, or a deliverable (e.g. a PDF) cannot be read, block —
        #    the sweep must never be vacuously skipped.
        ruleset = conf_mod.Ruleset.load(
            self.config.adapters.get("sink", {}).get("config", {}).get("redaction"))
        strings, unscannable = self._gather_scannable(bundle_id, art)
        hits = conf_mod.scan_strings(strings, ruleset)
        fail_closed = (not strings) or bool(unscannable)

        if not decision.allow or hits or fail_closed:
            detail = {"audience": audience.value, "decision": decision.reason,
                      "redaction_hits": hits, "ruleset_version": ruleset.version,
                      "unscannable": unscannable, "nothing_to_sweep": not strings}
            self._block(art_id, art["state"], BlockedReason.BOUNDARY, detail)
            return {"artifact_id": art_id, "published": False, "reason": BlockedReason.BOUNDARY.value,
                    "audience": audience.value, "decision": decision.reason,
                    "redaction_hits": hits, "ruleset_version": ruleset.version,
                    "unscannable": unscannable, "nothing_to_sweep": not strings}

        # egress pre-check pass → approved (human-owned in the real UI; CLI = human)
        self.ledger.upsert_artifact(art_id, type="paper", state=Lifecycle.APPROVED,
                                    gated_set_id=art["gated_set_id"], now=_now())
        self.ledger.append_lifecycle_event(
            art_id, art["state"], Lifecycle.APPROVED.value, actor="system",
            now=_now(), detail={"audience": audience.value, "decision": decision.reason,
                                "ruleset_version": ruleset.version})

        # human-attributed terminal publish
        published_paths = list(Path(art["output_ref"]).glob("*")) if art.get("output_ref") else []
        dest = str(self.data_dir / "published" / audience.value)
        final = sink.publish(art_id, [str(p) for p in published_paths], dest)
        self.ledger.upsert_artifact(art_id, type="paper", state=Lifecycle.PUBLISHED_PAPER,
                                    gated_set_id=art["gated_set_id"], now=_now(),
                                    output_ref=final)
        self.ledger.append_lifecycle_event(
            art_id, Lifecycle.APPROVED.value, Lifecycle.PUBLISHED_PAPER.value,
            actor="human:cli", now=_now(),
            detail={"audience": audience.value, "dest": final})
        return {"artifact_id": art_id, "published": True, "audience": audience.value,
                "dest": final, "ruleset_version": ruleset.version}

    _TEXT_SUFFIXES = (".tex", ".bbl", ".txt", ".md", ".json")

    def _gather_scannable(self, bundle_id: str, art: dict) -> tuple[list[str], list[str]]:
        """Collect every scannable string tied to this artifact, and the list of
        deliverable files that could NOT be scanned (drives fail-closed at egress)."""
        strings: list[str] = []
        ws = self._workspace(bundle_id)

        # 1. source inputs the engine consumed
        for name in ("idea.md", "experimental_log.md"):
            p = ws / "inputs" / name
            if p.exists():
                strings.append(p.read_text(encoding="utf-8", errors="replace"))
        # 2. engine-emitted text artifacts (tex/bbl/captions/citation_pool/drafts)
        final = ws / "final"
        if final.exists():
            for p in final.iterdir():
                if p.is_file() and p.suffix.lower() in self._TEXT_SUFFIXES:
                    strings.append(p.read_text(encoding="utf-8", errors="replace"))

        # 3. the ACTUAL to-be-published deliverables — each must be scannable.
        unscannable: list[str] = []
        out = Path(art["output_ref"]) if art.get("output_ref") else None
        if out and out.exists():
            tex_stems = {p.stem for p in out.glob("*.tex")}
            for p in sorted(out.iterdir()):
                if not p.is_file():
                    continue
                suf = p.suffix.lower()
                if suf in self._TEXT_SUFFIXES:
                    strings.append(p.read_text(encoding="utf-8", errors="replace"))
                elif suf == ".pdf":
                    txt = _extract_pdf_text(p)
                    if txt is not None:
                        strings.append(txt)
                    elif p.stem not in tex_stems:
                        # a deliverable PDF we cannot read and whose text source (.tex)
                        # is not present — refuse to publish it unswept.
                        unscannable.append(str(p))
        return strings, unscannable

    # -- op: run_review ------------------------------------------------------
    def run_review(self, bundle_id: str) -> dict:
        art_id = self._artifact_id(bundle_id)
        arts = {a["id"]: a for a in self.ledger.list_artifacts()}
        art = arts.get(art_id)
        if not art:
            raise RuntimeError(f"no artifact for {bundle_id!r} — draft it first")

        pdf_ok = bool(art.get("output_ref")) and any(
            Path(art["output_ref"]).glob("*.pdf"))
        gated = self.ledger.get_gated_set(self._gated_set_id(bundle_id))
        checklist = [
            {"item": "all drafted claims passed the evidence gate", "ok": bool(gated and gated["claim_ids"])},
            {"item": "a PDF artifact exists", "ok": pdf_ok},
            {"item": f"confidentiality track = {art.get('confidentiality_track')} "
                     f"(boundary={art.get('boundary')}, visibility={art.get('visibility')})",
             "ok": True},
            {"item": "bundle digest verified", "ok": self.ledger.bundle_digest_ok(bundle_id)},
        ]
        hard = [c for c in checklist if c["item"] not in (
            "bundle digest verified",) and not c["item"].startswith("confidentiality track")]
        verdict = "ready_for_human_review" if all(c["ok"] for c in hard) else "blocked"
        if art["state"] == Lifecycle.DRAFTED.value:
            self.ledger.set_artifact_state(art_id, Lifecycle.IN_REVIEW, _now())
            self.ledger.append_lifecycle_event(
                art_id, Lifecycle.DRAFTED.value, Lifecycle.IN_REVIEW.value,
                actor="system", now=_now(), detail={"verdict": verdict})
        return {"artifact_id": art_id, "checklist": checklist, "verdict": verdict,
                "note": "publish/file is a human-owned transition; run `publish` to run the "
                        "egress gate (confidentiality decide() + redaction re-sweep)"}

    # -- op: release_interlock / list_interlocks (L3a) -----------------------
    def release_interlock(self, claim_id: str, actor: str = "human:cli",
                          reason: str | None = None) -> dict:
        """Human-attributed release of a patent-first interlock (the patent has been
        filed/cleared). The claim can then pass the gate into a paper on the next
        run_gate. Recorded in the hash-chained audit log."""
        il = self.ledger.get_interlock(claim_id)
        if not il:
            raise RuntimeError(
                f"no interlock for claim {claim_id!r} — it is not patent-sensitive, "
                f"or the bundle has not been gated yet")
        prev = il["status"]
        self.ledger.set_interlock_status(
            claim_id, InterlockStatus.RELEASED, actor, reason, _now())
        self.ledger.append_lifecycle_event(
            f"interlock:{claim_id}", prev, InterlockStatus.RELEASED.value,
            actor=actor, now=_now(), reason=reason, detail={"claim_id": claim_id})
        return {"claim_id": claim_id, "status": InterlockStatus.RELEASED.value,
                "previous": prev, "actor": actor}

    def list_interlocks(self, bundle_id: str | None = None) -> list[dict]:
        return self.ledger.list_interlocks(bundle_id)

    # -- op: get_lifecycle ---------------------------------------------------
    def get_lifecycle(self) -> list[dict]:
        return self.ledger.list_artifacts()

    def blocked_backlog(self, bundle_id: str) -> list[dict]:
        out = []
        for c in self.ledger.get_claims(bundle_id):
            if c.gate_status is GateStatus.BLOCKED:
                out.append({"claim_id": c.claim_id, "type": c.type.value})
        return out

    # -- helpers -------------------------------------------------------------
    def _workspace(self, bundle_id: str) -> Path:
        return self.data_dir / "workspace" / bundle_id

    def _gated_set_id(self, bundle_id: str) -> str:
        return f"gs-{bundle_id}"

    def _artifact_id(self, bundle_id: str) -> str:
        return f"art-{bundle_id}"
