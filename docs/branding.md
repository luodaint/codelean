# Codelean brand assets

The mark combines an angular C/code bracket with a mint check on a navy tile. It is used in the login page, app sidebar, repository README, GitHub App avatar, browser favicon, and Apple touch icon.

| Asset                                 | Location                           |
| ------------------------------------- | ---------------------------------- |
| Original generated artwork with alpha | `public/brand/codelean-source.png` |
| App and README mark, 512 px           | `public/brand/codelean-mark.png`   |
| GitHub App upload, 200 px             | `public/brand/github-avatar.png`   |
| Browser favicon, 16/32/48 px          | `src/app/favicon.ico`              |
| App icon, 192 px                      | `src/app/icon.png`                 |
| Apple touch icon, 180 px              | `src/app/apple-icon.png`           |

Next.js emits the icon metadata automatically. The Docker web image includes `public/` so the logo also works in Dokploy. GitHub App avatars are uploaded separately under the App's General settings → Display information. The repository README references the checked-in asset.

Generated with Codex's built-in image generation tool. PNG/ICO size variants are resized exports of the original artwork. The wordmark remains live text for clarity and accessibility.

## Generation prompt

Use case: logo-brand. Create one polished, distinctive logo symbol for Codelean, an AI-assisted GitHub pull-request code review application. Asset type: production app icon, GitHub App avatar, favicon. A single clever geometric capital C made from two clean angular code-bracket strokes, integrated with one crisp check mark that completes the open right side. Confident, precise, modern developer-tool identity with a little forward motion. Bold optically balanced silhouette, very few shapes, readable at 16 pixels. Flat vector-like graphic, not a mockup. Use a deep midnight navy rounded-square tile, an ivory C and one electric mint/teal check accent; subtle cobalt detail only if essential. The tile fills almost the entire square canvas, consistent modest corner radius, logo fills about 70 percent of the tile with even safe padding. True transparent pixels outside the rounded corners. Centered front-on, perfectly crisp edges and solid colors. No text or wordmark, no tagline, no gradients, no shadows, no 3D, no textures, no shields, no robot, no rabbit, no watermark. Output a single square high-resolution icon, not a presentation sheet or multiple options.
