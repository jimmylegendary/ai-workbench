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
from . import gate as gate_mod
from . import registry
from .ledger import Ledger
from .models import GateReport, GateStatus, Lifecycle


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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
        report = gate_mod.run_gate(claims, profile, bundle_id)

        for r in report.results:
            self.ledger.set_gate_status(r.claim_id, r.status)

        # Optional defense-in-depth: CUE vet (non-authoritative).
        report_cue_ok, report_cue_detail = gate_mod.cue_vet_snapshot(claims)
        self._last_cue = (report_cue_ok, report_cue_detail)

        # Record the shared gated front (passed claims).
        if report.passed_claim_ids:
            self.ledger.create_gated_set(
                self._gated_set_id(bundle_id), bundle_id, profile.name,
                report.passed_claim_ids, _now())
        return report

    # -- op: assemble_inputs -------------------------------------------------
    def assemble_inputs(self, bundle_id: str, template_path: str, guidelines_path: str,
                        title: str = "CAW-03 Draft") -> dict:
        gated = self.ledger.get_gated_set(self._gated_set_id(bundle_id))
        if not gated or not gated["claim_ids"]:
            raise RuntimeError(
                f"no gated claim set for bundle {bundle_id!r} — run_gate must pass ≥1 claim first")
        claims = [self.ledger.get_claim(cid) for cid in gated["claim_ids"]]
        claims = [c for c in claims if c is not None]
        results = self.ledger.get_results(bundle_id)

        template_tex = Path(template_path).read_text(encoding="utf-8") if template_path and Path(template_path).exists() else ""
        guidelines = Path(guidelines_path).read_text(encoding="utf-8") if guidelines_path and Path(guidelines_path).exists() else "# Guidelines\n"

        workspace = self._workspace(bundle_id)
        manifest = assemble_mod.assemble_inputs(
            str(workspace), claims, results, template_tex, guidelines, title=title)

        # Create/advance the artifact for this paper.
        art_id = self._artifact_id(bundle_id)
        self.ledger.upsert_artifact(
            art_id, type="paper", state=Lifecycle.DRAFTING,
            gated_set_id=gated["id"], now=_now())
        manifest["artifact_id"] = art_id
        return manifest

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

        return {
            "artifact_id": art_id,
            "engine": out.engine_adapter,
            "renderer": out.scores.get("renderer"),
            "paper_pdf": out.paper_pdf_path,
            "paper_tex": out.paper_tex_path,
            "published_to": dest,
        }

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
            {"item": "bundle digest verified", "ok": self.ledger.bundle_digest_ok(bundle_id)},
        ]
        verdict = "ready_for_human_review" if all(c["ok"] for c in checklist if c["item"] != "bundle digest verified") else "blocked"
        self.ledger.set_artifact_state(art_id, Lifecycle.IN_REVIEW, _now())
        return {"artifact_id": art_id, "checklist": checklist, "verdict": verdict,
                "note": "publish/file is a human-only transition (not automated)"}

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
