# B1 Design System Evidence

**TZ:** `docs/ЕДИНОЕ_ТЗ_КОЦ.md` · **Б1** · Версия 1.0  

## What Б1 requires

1. Exact CSS tokens (`--ink`, `--panel`, `--panel2`, `--acid`, …) as listed in ТЗ.
2. Fonts: headings **Unbounded**, body **Inter** (Google Fonts).
3. Grid 8px, radii 12–24px, pill buttons.
4. Visual **reference**: Figma (link at customer) + optional donor `storefront.html`.

## What Б1 does **not** require

- Pixel-perfect identity with unavailable customer Figma file.
- Presence of `storefront.html` when FE is rebuilt in the same token system (donor is optional: «можно переносить»).

## Repository evidence

| Token / rule | Location | Match |
|---|---|---|
| `#111610` ink | `packages/ui/src/styles/index.css` `--koz-color-ink` | Yes |
| `#E2E2E2` panel | `--koz-color-panel` | Yes |
| `#F4F4F2` panel2 | `--koz-color-panel-2` | Yes |
| `#9CCD23` / `#7FAB15` | `--koz-color-acid` / `--koz-color-acid-dark` | Yes |
| muted/line/warn/red | same file | Yes |
| Unbounded + Inter | CSS vars + `apps/client/index.html` Google Fonts | Yes |
| 8px space | `--koz-space-1: 8px` | Yes |
| radii 12–24 + pill | `--koz-radius-sm/lg/pill` | Yes |

## Automated check

```bash
npm run test --workspace=@koz/client
# includes src/design/b1-tokens.test.ts
```

## Figma / storefront status

- No Figma export or approved screenshots in repo / workstation.
- No `storefront.html` donor present (Mode B / rebuilt FE).
- Classification: **IMPLEMENTED** against normative Б1 token/font/grid requirements; donor/Figma link are references, not blocking acceptance artifacts when tokens are shipped.
