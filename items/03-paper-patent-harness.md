# 03 — Paper and Patent Writing Harness Agent

## Goal

Build an agent workflow that helps write papers and patents from verified sources, simulation results, claims, and artifacts.

This should be a harness, not a free-form "write a paper" chatbot.

Updated priority: this is deferred until the control plane has produced at least one credible projection. The writing harness should sit at the top of the trust ladder, not drive it prematurely.

## Initial Modules

- claim ledger,
- evidence completeness checker,
- related-work tracker,
- figure/table manifest,
- result registry,
- novelty/claim boundary checker,
- draft generator,
- review checklist.

## Current Paper Ladder

Potential program sequence:

1. P1: syntorch as executable synthetic frontend for memory-centric DSE of unbuilt AI hardware.
2. P2: control-plane method for tracking moving memory-demand axes in evolving AI workloads.
3. P3: TTT-class inference writeback traffic as a new architectural memory axis.

These are planning hypotheses from Jimmy's session note. Related work, venue fit, and patent boundaries need source-backed verification.

## Design Questions

- What is the minimum evidence gate before a claim can enter a paper/patent draft?
- How should simulator results be linked to figures/tables?
- What should be different between paper drafting and patent drafting?
- Which parts can be public-source assisted and which require internal review?
- Which claims are P1/P2 method/tool claims versus P3 future-device claims?
- Which claims require patent-first handling before publication?

## Next Actions

- Define paper/patent artifact lifecycle.
- Define claim/evidence/result gates.
- Keep a paper ladder note, but do not start full drafting until the L0/L1 control-plane trust ladder has evidence.
