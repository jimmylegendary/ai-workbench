# 04 — AI Tips / Skills Website and REST API

## Goal

Create a website and REST API that shares AI-use tips, useful skills, workflows, and reusable operating patterns.

This should publish validated practice, not random prompt snippets.

Updated priority: this is the final publishing/read layer. It should not become a separate product before the internal substrate produces validated workflows.

## Initial Entities

- `Tip`
- `Skill`
- `Workflow`
- `Playbook`
- `Example`
- `Source`
- `SafetyBoundary`
- `Version`

## Design Questions

- What is internal-only vs public-safe?
- Should the API serve markdown, JSON, or both?
- What metadata makes a skill reusable and auditable?
- How do we avoid publishing unverified or company-confidential know-how?

## Next Actions

- Define a minimal public/private publishing policy.
- Define first API resources.
- Identify 3-5 internally validated AI workflows worth eventually publishing.
- Defer implementation until internal workflow/skill registry has real validated entries.
