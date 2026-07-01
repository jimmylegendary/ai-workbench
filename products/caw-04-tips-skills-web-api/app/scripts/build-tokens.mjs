// Minimal DTCG -> Tailwind v4 @theme pipeline.
// Reads design-tokens/caw04.tokens.json and emits src/styles/theme.css.
// (Swap for Style Dictionary / Terrazzo later if the token set grows.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tokens = JSON.parse(
  readFileSync(resolve(root, 'design-tokens/caw04.tokens.json'), 'utf8'),
)

const emitGroup = (group, prefix) =>
  Object.entries(tokens[group] || {})
    .filter(([, v]) => v && typeof v === 'object' && '$value' in v)
    .map(([key, v]) => `  --${prefix}-${key}: ${v.$value};`)
    .join('\n')

const theme = [
  emitGroup('color', 'color'),
  emitGroup('radius', 'radius'),
  emitGroup('spacing', 'spacing'),
  emitGroup('font', 'font'),
]
  .filter(Boolean)
  .join('\n')

const dark = Object.entries(tokens.colorDark || {})
  .map(([key, v]) => `  --color-${key}: ${v.$value};`)
  .join('\n')

const css = `/* AUTO-GENERATED from design-tokens/caw04.tokens.json — run \`pnpm build:tokens\`. Do not edit by hand. */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
${theme}
}

.dark {
${dark}
}
`

const out = resolve(root, 'src/styles/theme.css')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, css)
console.log(`build-tokens: wrote ${out}`)
