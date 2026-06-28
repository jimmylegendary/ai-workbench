# Prototype brief — Login

Use the **active CAW-01 design system** (instrument blue, zinc neutrals, compact, light+dark). Build **one
screen**: the sign-in page for an internal hardware-simulation control plane. Calm and quiet — this is a utility
gate, not a marketing page.

**Layout:** full-height, centered single card on the app background (`#FAFAFA` / dark `#0B0D10`). Top-left: a
small wordmark "CAW-01 · Simulation Control Plane" in textMuted. No nav bar (unauthenticated).

**Card (`LoginCard`):**
- Title (h2): "Sign in". One line of subtext: "Team-internal access. We'll email you a sign-in link."
- Email input (label "Work email", mono-free, focus-visible ring in primary).
- Primary button: "Send sign-in link" (full width).
- States to show as small variants stacked or via a state toggle: **idle**, **sending** (button shows spinner +
  disabled), **sent** ("Check your email — link sent to you@team.com · Resend"), **error** (inline danger text
  "Couldn't send link. Try again.").
- Footer microcopy: "Magic-link / OTP via Supabase Auth. No passwords."

**Tone:** precise, technical, trustworthy. No illustrations, no gradients. Show **both light and dark**.
Provide the result as a single responsive HTML (or JSX) file using the design-system tokens.
