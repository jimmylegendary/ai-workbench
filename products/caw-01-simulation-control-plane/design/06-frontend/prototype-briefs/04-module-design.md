# Prototype brief — Module Design

Use the **active CAW-01 design system** (compact, mono readouts, light+dark). Build **one screen**: a library +
editor for **reusable modules** — parameterized fragments that drop into the Simulation canvases (workload
fragments, serving configs, hardware subtrees).

**Top nav bar:** `Simulation` · `Module Design` (active) · `User` · `Setting`.

**Layout:** left a **module list** with kind filter (Workload / Serving / Hardware), middle/main an **editor**,
right a **preview**.

- **`ModuleList`:** rows with a kind badge, name (mono id), version, last-edited. A "+ New module" action.
- **`ModuleEditor`:** name, kind, a parameter table (param / type / default / description) and a JSON/spec body
  in a mono code block. Compact form, dirty-aware save ("Save" / "Save as version").
- **`ModulePreview`:** a small canvas-style preview of the module (e.g. a workload fragment shown as
  OpNode→TensorPort, or a HW subtree chip→die). "Insert into experiment" primary action.
- **States:** empty list ("No modules yet"), unsaved-changes indicator, validation error on a bad param.

Dense, technical, mono ids. Output a single high-fidelity HTML or JSX file using the tokens (light + dark).
