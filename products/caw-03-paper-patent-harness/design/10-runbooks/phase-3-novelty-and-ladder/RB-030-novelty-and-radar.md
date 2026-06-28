# RB-030: Novelty + radar import

- Status: ready
- Phase: phase-3-novelty-and-ladder
- Depends on: [RB-020, RB-010]
- Implements design: [../../05-harness-core/paper-ladder-and-novelty.md](../../05-harness-core/paper-ladder-and-novelty.md), [../../01-decisions/ADR-0006-paper-ladder-and-novelty.md](../../01-decisions/ADR-0006-paper-ladder-and-novelty.md)
- Produces: `Novelty/RadarAdapter` (CAW-05 import) + `run_novelty` (citation_pool reuse) + claim flagging

## Objective

Flag claims novel / threatened / patent-sensitive using PaperOrchestra's `citation_pool` (reused, not re-queried)
+ imported CAW-05 radar signals via the Novelty/Radar port. The harness decides; sources only supply.

## Preconditions
- [ ] RB-020 (citation_pool available from a draft run), RB-010 (import). Resolve OQ-17/18/19.

## Steps
1. **Do:** Implement `adapters/novelty/v1/caw05-radar` behind the port; import radar signals (map keys to ledger — OQ-18).
   **Verify:** `test:` radar signals import + map to ClaimRefs.
2. **Do:** Implement `run_novelty(ledgerId)`: combine citation_pool + radar; flag each claim novel/threatened/patent-sensitive.
   **Verify:** `test:` known overlap → threatened; clean → novel.
3. **Do:** Patent-sensitive flag sets the interlock (`held`) via RB-023.
   **Verify:** `test:` a patent-sensitive flag holds the interlock.
4. **Do:** Restrict any external prior-art query to public-boundary claim text + redact the query (OQ-19); add the stub `adapters/novelty/stubs/live-prior-art`.
   **Verify:** `test:` query carries only public text; stub is selectable/flagged.

## Acceptance criteria
- [ ] Novelty flags computed from citation_pool + CAW-05; patent-sensitive sets interlock.
- [ ] Prior-art queries public-only; live-search stub present.

## Rollback / safety
Adapter + op; revert to roll back. Default to "threatened/patent-sensitive" on uncertainty (fail safe).

## Hand-off
RB-031 places flagged claims on the P1/P2/P3 ladder.
