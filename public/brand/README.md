# Review Room identity

The original mark combines an image frame with a feedback pin. The lowercase Manrope wordmark and green full stop share the application's calm sage/cream palette. Use the complete lockup on page headers and the mark alone for browser/device icons.

| Element                | Value                           |
| ---------------------- | ------------------------------- |
| Sage                   | `#59734d`                       |
| Ink                    | `#25342d`                       |
| Mark detail            | `#f7f5ec`                       |
| Page background        | `#fafbf9`                       |
| Social-card background | `#f7f6ef`                       |
| Wordmark               | Self-hosted Manrope, weight 800 |

`src/components/brand.tsx` and `brand.css` are the shared source. Keep the mark square and preserve its internal spacing. The rendered wordmark remains readable text; decorative marks are hidden from assistive technology. Standalone SVG exports include a title.

Generated assets:

- `mark.svg` and `src/app/icon.svg`: scalable mark.
- `src/app/favicon.ico`: 16, 32, 48 and 64px entries.
- `src/app/apple-icon.png`: opaque 180px Apple icon.
- `icon-64.png`, `icon-192.png`, `icon-512.png`: opaque PNG exports.
- `social-preview.png`: 1200 × 630px Open Graph/Twitter card using the original fictional Forma sample artwork from `public/demo/identity-v2.svg`.

Run `pnpm brand:generate` from the repository root after editing the source. This optional command needs local Chrome (default macOS path; override with `CHROME_BIN`) and existing project dependencies. It renders only local artwork/fonts in a temporary browser profile, closes that browser and removes its temporary files. It does not read application credentials or contact a database. Generated images are checked in; build/runtime do not need Chrome, font downloads or image generation.

`public/site.webmanifest` supplies browser/home-screen identity with `display: browser`. It adds no service worker or offline support. Existing font licenses remain in `public/fonts`.
