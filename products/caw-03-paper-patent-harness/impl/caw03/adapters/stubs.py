"""Documented stubs for future connectors (ADR-0005 §6).

A stub is REGISTERED and discoverable (it appears in `registry.list()` and the
adapters view) but `maturity="stub"`, so the preflight refuses to run it while it is
marked active — with a message pointing at the file to implement. Wiring a real
connector later = filling in the method bodies of that one class, not editing the core.

Also holds the v1-slice PatentEngine and Novelty placeholders so their ports exist
and are visible, without any patent/novelty logic being built in this slice.
"""
from __future__ import annotations

from ..core.registry import register
from ..ports import AdapterCapabilities, HealthStatus, Maturity


def _stub(port: str, id: str, provides=(), features=(), requires_config=()):
    return AdapterCapabilities(
        port=port, id=id, version="0.0.0",
        provides=tuple(provides), features=frozenset(features),
        requires_config=tuple(requires_config), maturity=Maturity.STUB,
    )


# ---- Source stubs ----------------------------------------------------------

@register(port="source", id="internal-wiki")
class InternalWikiSourceAdapter:
    """STUB — internal company wiki source. Implement when the connector is approved.

    Contract: SourceAdapter. Must return a provenance-tagged bundle with the SAME
    evidence shape as caw02-bundle (typed, resolvable refs; generated text is not
    evidence) and respect confidentiality (internal-review-required by default).
    Config example:
        [adapters.source.internal-wiki]
        base_url = "https://wiki.internal/..."
        auth = "env:WIKI_TOKEN"
    """

    capabilities = _stub("source", "internal-wiki",
                         provides=("claim", "evidence"),
                         features=("internal-confidential",),
                         requires_config=("base_url", "auth"))

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def import_bundle(self, ref: str):
        raise NotImplementedError("internal-wiki source not yet wired (PRODUCT-BRIEF §9)")

    def health(self) -> HealthStatus:
        return HealthStatus.not_implemented("stub: internal-wiki source")


@register(port="source", id="experiment-server")
class ExperimentServerSourceAdapter:
    """STUB — internal experiment-server source (results/logs → governed bundle)."""

    capabilities = _stub("source", "experiment-server",
                         provides=("claim", "evidence", "result"),
                         features=("internal-confidential",),
                         requires_config=("base_url", "auth"))

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def import_bundle(self, ref: str):
        raise NotImplementedError("experiment-server source not yet wired")

    def health(self) -> HealthStatus:
        return HealthStatus.not_implemented("stub: experiment-server source")


# ---- Sink stubs ------------------------------------------------------------

@register(port="sink", id="venue-submission")
class VenueSubmissionSinkAdapter:
    """STUB — venue/conference submission sink."""

    capabilities = _stub("sink", "venue-submission", requires_config=("venue", "auth"))

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def publish(self, artifact_id: str, output_paths: list[str], dest_dir: str) -> str:
        raise NotImplementedError("venue-submission sink not yet wired")

    def health(self) -> HealthStatus:
        return HealthStatus.not_implemented("stub: venue-submission sink")


@register(port="sink", id="patent-filing")
class PatentFilingSinkAdapter:
    """STUB — patent-filing system sink (counsel-gated)."""

    capabilities = _stub("sink", "patent-filing", requires_config=("system", "auth"))

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def publish(self, artifact_id: str, output_paths: list[str], dest_dir: str) -> str:
        raise NotImplementedError("patent-filing sink not yet wired")

    def health(self) -> HealthStatus:
        return HealthStatus.not_implemented("stub: patent-filing sink")


# ---- PatentEngine + Novelty placeholders (ports exist; no logic in the slice) --

@register(port="patent_engine", id="patent-baseline-stub")
class PatentBaselineStubAdapter:
    """STUB — v1 baseline patent drafter + patent-first interlock (not built in the slice).

    The patent-first interlock is enforced at the GATE in the slice (P3 default-deny);
    real patentability screening + claim drafting land here in a later runbook.
    """

    capabilities = _stub("patent_engine", "patent-baseline-stub",
                         provides=("patent_draft", "patentability"))

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def screen(self, claim_ids: list[str]) -> dict:
        raise NotImplementedError("patent screening not built in the v1 slice")

    def draft_patent(self, workspace: str):
        raise NotImplementedError("patent drafting not built in the v1 slice")

    def health(self) -> HealthStatus:
        return HealthStatus.not_implemented("stub: patent-baseline")


@register(port="novelty", id="novelty-stub")
class NoveltyStubAdapter:
    """STUB — Novelty/Radar (related-work + threat signals). Not built in the slice.

    Real adapter consumes PaperOrchestra `citation_pool.json` + a CAW-05 radar import.
    """

    capabilities = _stub("novelty", "novelty-stub", provides=("novelty_finding",))

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def check(self, claim_ids: list[str]) -> list[dict]:
        raise NotImplementedError("novelty check not built in the v1 slice")

    def health(self) -> HealthStatus:
        return HealthStatus.not_implemented("stub: novelty")
