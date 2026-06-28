# Prototype brief — Settings

Use the **active CAW-01 design system** (compact, light+dark). Build **one screen**: workspace settings for the
control plane. A sectioned form, dense and utilitarian.

**Top nav bar:** `Simulation` · `Module Design` · `User` · `Setting` (active).

**Layout:** a left section nav (anchor list) + a right form. Sections:

1. **Engine** — engine base URL, default backend (analytical / ns3 / sst), run callback URL (read-only),
   "Test connection" button with a status chip.
2. **Defaults** — default representation (torch / syntorch), default IR fill level (L0/L1/L2), default data
   boundary (public/internal/confidential).
3. **Appearance** — theme (light / dark / system), density (compact / comfortable), accent preview. These map to
   the design-system CSS variables.
4. **Account & data** — link to `/user`, Supabase project (read-only), "metadata-only" note explaining heavy IR
   stays in the engine store (pointer boundary).

Each section: tight rows, inline help, a single "Save changes" affordance (dirty-aware). Show a saved toast and a
validation-error state. Output a single high-fidelity HTML or JSX file using the tokens (light + dark).
