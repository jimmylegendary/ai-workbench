# RB-042: Build the optional read-only knowledge viewer

- Status: ready
- Phase: phase-4-interfaces
- Depends on: [RB-040 (read API: search/get/verify_audit), RB-031 (trust/boundary labels), RB phase-3 retrieval (hydrated chain, pre-rank filters)]
- Implements design:
  - [../../06-interfaces/knowledge-viewer.md](../../06-interfaces/knowledge-viewer.md)
  - [../../06-interfaces/api-and-mcp.md](../../06-interfaces/api-and-mcp.md) (read path, scopes)
  - [../../01-decisions/ADR-0001-product-surface-and-skill-interface.md](../../01-decisions/ADR-0001-product-surface-and-skill-interface.md)
  - [../../09-roadmap/milestones-and-phases.md](../../09-roadmap/milestones-and-phases.md) (P7 read-only viewer; built here as the last interface surface)
- Produces: a minimal, **read-only** web viewer that browses Source/Claim/Evidence/Note and their provenance edges with trust/boundary/visibility badges, backed **only** by `kr.search`/`kr.get`/`kr.verify_audit` via the API. Explicitly **no write path** and **no direct store access**. Deletable without affecting the product.

## Objective
"Done" = an optional minimal viewer through which Jimmy and the team can search and browse entities, follow the `Source→Claim→Evidence→Note` provenance chain, and read trust + boundary + visibility badges — all served by the boundary-filtered read API only. The viewer holds no business logic, issues no SQL, reads no markdown/SQLite/`_events/` directly, and has no create/edit/delete/approve/import/export controls. Because it reuses the same actor-scoped, boundary-filtered read path as every other reader, it structurally cannot surface a confidential or out-of-clearance item, and it never badges a generated Note as Evidence. The viewer is deletable with zero effect on the core.

## Preconditions
- [ ] RB-040 landed: `GET /v1/search`, `GET /v1/entities/{id}`, `GET /v1/audit/verify` exist, are `readOnlyHint:true`, apply boundary/visibility filters **before** ranking, and return the hydrated provenance chain + trust/boundary/visibility labels.
- [ ] RB-031 landed: trust ladder (T0–T3 + contested), AI-authored T2 cap, and `boundary`/`visibility` labels are returned on read ops.
- [ ] An actor credential with `kr:read` is available for the viewer to carry (no special viewer privilege).
- [ ] Tree is green.

## Steps

1. **Scaffold a minimal read-only app with no store of its own.**
   - Do: Create a small web app (deliberately minimal — TODO(open-question: SSR over the read API vs a tiny SPA, per [knowledge-viewer.md §6](../../06-interfaces/knowledge-viewer.md))). It has no database, no auth system of its own beyond carrying the viewing actor's `kr:read` API credential, and no state. Confirm it lives in its own deletable module/package.
   - Verify: Deleting the viewer module and rebuilding leaves the core, CLI, API, MCP, and tests fully green (proves it is genuinely optional).

2. **Restrict the data source to the filtered read path.**
   - Do: Implement a thin client that calls **only** `GET /v1/search`, `GET /v1/entities/{id}`, and `GET /v1/audit/verify`. Forbid (by construction + a lint/test) any direct access to markdown files, the SQLite index, or `knowledge/_events/`, and any call to write/import/export ops.
   - Verify: A grep/static check finds no filesystem or SQLite access in the viewer and no reference to write/import/export ops; all network calls target the three read routes only.

3. **Build the Search view.**
   - Do: Render a query box plus first-class filters (`type`, `boundary`, `visibility`, `trust`, `concept`) wired to `kr.search` params. Result rows show id, title/summary, and trust + boundary badges. Filters are passed to the core (applied pre-ranking there) — the viewer does not re-filter or re-rank locally.
   - Verify: Searching with `--`equivalent filters returns the same hit set as `kr query` for the same actor; a filtered-out `private`/`confidential` item never appears in results.

4. **Build the Entity detail + Provenance chain views.**
   - Do: For a focused entity, render its frontmatter fields + markdown body + typed edges via `kr.get`. Add the provenance-chain view rendering the `Source→Claim→Evidence→Note` graph with typed edges: a Claim shows its attached Evidence (with the concrete artifact ref), and a Note shows the Claims it cites, **clearly marked as generated and not evidence**. Support deep-linking by entity id.
   - Verify: Opening a Claim shows its Evidence with the real artifact ref; opening a Note shows cited Claims and a "Generated note (not evidence)" marker; a deep link to an id renders that entity.

5. **Render badges exactly from core fields (no compute, no override).**
   - Do: Render the badge set from [knowledge-viewer.md §4](../../06-interfaces/knowledge-viewer.md): Trust (T0–T3 / contested, color ladder, contested visually distinct), Boundary (public/internal/confidential, confidential strongest marker), Visibility (team/private, private distinct), Authoring (human/agent, agent shows the T2-cap note), Evidence flag ("Evidence" vs "Generated note (not evidence)"). The viewer renders only the fields the core returns — it never computes or overrides trust/boundary.
   - Verify: An AI-authored node displays the T2-cap note and never a higher tier; a `contested` item is visually distinct; a Note never receives an "Evidence" badge.

6. **Audit view (read-only).**
   - Do: Show an entity's append-only history + `supersedes` lineage and a "chain ok / tampered" indicator sourced from `kr.verify_audit`. No remediation controls.
   - Verify: The audit view reports "chain ok" for an untampered entity; it presents the verification result without offering any write/fix action.

7. **Negative / leak tests.**
   - Do: Add tests that (a) an under-cleared actor's viewer session cannot surface a confidential item (it uses the same boundary-filtered read path), and (b) a Note is never displayed as Evidence. Add a test asserting the viewer exposes no write/import/export affordance.
   - Verify: Both leak tests pass; the affordance test confirms no create/edit/delete/approve/import/export controls exist in the rendered UI.

## Acceptance criteria
- [ ] Viewer is read-only: no create/edit/delete/approve/import/export controls or routes.
- [ ] Viewer reads **only** via `kr.search`/`kr.get`/`kr.verify_audit`; no direct markdown/SQLite/`_events/` access (enforced by test/lint).
- [ ] Search, Entity detail, Provenance chain, and Audit views render correctly; provenance chain makes the Claim→Evidence invariant visible.
- [ ] Trust/boundary/visibility/authoring/evidence badges render only from core-returned fields; no client-side compute or override; a Note is never badged Evidence.
- [ ] An under-cleared actor cannot surface a confidential/private item through the viewer (leak test passes).
- [ ] The viewer module is deletable with the rest of the tree staying green (it is genuinely optional).
- [ ] Tree is green at this checkpoint.

## Rollback / safety
- The viewer is a separate, optional, stateless module with no store of its own; deleting it cannot corrupt or alter the knowledge store, the index, or the audit log. Rollback = remove the module and rebuild.
- Because it is read-only and uses the boundary-filtered read path, there is no write or leak path to undo on failure; a viewer crash affects only browsing, never data integrity.

## Hand-off
- This completes the P4 interface surfaces (API + MCP + CLI + optional viewer). Phase-5 import/export runbooks can assume all read/write surfaces route through the single core and that the viewer never participates in boundary crossings (imports/exports happen only through the core's gated ops).
- Any future "propose" path for humans (TODO(open-question, ADR-0001) — brief §9 says read-only for v1) must go through the core write ops, not the viewer.
