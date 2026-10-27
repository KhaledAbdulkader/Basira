# Basira branding

**Product name:** Basira (approved by the project owner before Phase 1)  
**Tagline:** Business insight, made clear.

Basira is the short name used in the application, navigation, sign-in screens, and demonstration materials. The academic project title remains **Intelligent Decision Support System with Predictive Analytics for Small Businesses** and should appear in the graduation report, academic cover pages, and project overview. The product name does not change the project's scope or imply professional financial advice.

## Logo

The symbol combines an open eye with three rising bars to express understandable business insight and analysis. The bars are a visual identity element, not a claim that a business will grow or that forecasts are guaranteed.

- `public/brand/basira-mark.svg`: standalone 64 × 64 symbol for compact navigation and application identity.
- `public/brand/basira-logo.svg`: 268 × 72 horizontal symbol and wordmark for headers and sign-in screens.

Both assets have transparent backgrounds and scale without losing sharpness. The wordmark uses a system sans-serif stack with Inter preferred when available; its exact appearance can vary with installed fonts. No remote fonts or external image resources are required. For consistent printed artwork, convert the wordmark to outlines using the chosen, properly licensed font during final report preparation.

## Palette

| Role             | Color     | Use                                                                  |
| ---------------- | --------- | -------------------------------------------------------------------- |
| Brand teal       | `#087F8C` | Approved brand mark                                                  |
| Interaction teal | `#077984` | Light-theme actions and small links, including on off-white surfaces |
| Deep navy        | `#142D3B` | Wordmark, headings, primary text                                     |
| White            | `#FFFFFF` | Light surface and text on teal actions                               |
| Soft teal        | `#E8F4F3` | Optional subtle surface tint                                         |

The teal and navy each exceed WCAG AA's 4.5:1 contrast threshold against white for normal text. Teal against navy does not meet that threshold; do not use that pair for body text or essential interface details. Recheck contrast for disabled, hover, focus, and dark-theme states when implementing the UI.

## Accessible use

- Preserve proportions and leave clear space of at least one bar width around the symbol. Use the standalone symbol at 24 CSS pixels or larger and the full logo at 134 CSS pixels or larger.
- On dark surfaces, place the supplied artwork on a white or sufficiently light surface so its navy elements remain visible. The supplied files are the light-surface artwork.
- For a standalone image use `alt="Basira"`. For a logo that links to the home page, provide a link name such as `aria-label="Basira home"` and use an empty image alt to avoid repeating the name.
- When nearby text already supplies the brand name, treat a redundant symbol as decorative with an empty alt; for inline decorative SVG also use `aria-hidden="true"`.
- Each SVG includes a title and description for standalone or inline meaningful use. When embedding multiple inline copies, make title and description IDs unique or supply an accessible name at the embedding element.
- Keep the tagline as real text when it is displayed. Do not rely on the mark or color alone to convey an action, status, forecast, or alert.

This is the approved identity for the graduation project. No trademark search, registration, domain availability check, or claim of name uniqueness has been made.
