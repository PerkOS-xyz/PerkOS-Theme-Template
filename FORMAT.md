# PerkOS theme file, version 2

File extension: `.perkos-theme.json`. Version 1 files (palettes) still import.

| Field | Value |
| --- | --- |
| `version`, `name`, `scheme` | `2`, a trimmed name of 1 to 80 characters, and `dark` or `light` |
| `releaseVersion` | Optional release number in `X.Y.Z` form. Required by the template's release script. |
| `colors` | Required `background`, `surface`, `text`, `primary`, `secondary`, `success`, `warning`, `danger`; optional `bar` and `gradient` (two or three stops) |
| `logo`, `sparky` | Optional images: the in-content brand mark and Sparky's chat avatar |
| `networkHeader` | Optional `{ name, logo, notices, source, terms, reviewedAt }`. Leave it out to hide the header. |
| Image | `{ mime, base64 }` holding one complete asset |

## Derivation

Colors are uppercase six-digit hex. Mixing is linear per sRGB channel with integer rounding. Relative luminance linearizes sRGB at the 0.04045 breakpoint with weights 0.2126, 0.7152 and 0.0722; contrast is (lighter + 0.05) / (darker + 0.05) on the actual composited background.

| Role | Rule |
| --- | --- |
| Hover | Surface mixed 8% toward text, reduced until text still passes |
| Borders | Surface mixed 25% and 40% toward text |
| Muted text | Text mixed 25% toward surface, walked back toward text until it passes |
| Text on primary | Black or white, whichever contrasts more |
| Bar | Defaults to surface |
| Gradient | `linear-gradient(90deg, …)` with two or three stops, default primary twice |

## Checks

- Text needs 4.5:1 on background, surface, hover, bar, buttons, chat bubbles, popovers and code panels. An accent or status color used as text moves toward the text color in 1% steps until it passes; the original stays for fills and decoration.
- Essential borders and focus need 3:1.
- Images: PNG, JPEG, WebP or SVG; at most 128 KiB decoded and 1024 × 1024 pixels; no animation.
- SVG: a bounded, finite viewBox and only static drawing elements and attributes. No scripts, events, links (fragment references included), external resources, CSS, foreign objects, entities or doctypes.
- A whole file is at most 544 KiB.

## Network marks

Keep each mark's proportions, colors and clear space, choose the variant that fits the bar color, show it apart from the app logo and project title, and never imply affiliation or endorsement. Carry each brand's required notices in `networkHeader.notices` and `NOTICE.md`.
