# Portfolio screenshots

These images show the actual local production UI with the project's original fictional artwork and seeded demo state. Session creation and Designer/Client view responses are intercepted in Chrome; no backend writes or real customer data are involved. The approved Journal design is part of the existing seed, not a claim of customer sign-off. These are presentation assets, not evidence of an authenticated production journey.

| Image                                                    | Caption                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| [01-landing.webp](01-landing.webp)                       | A focused entry into visual review, with original sample designs. |
| [02-pinned-feedback.webp](02-pinned-feedback.webp)       | A conversation stays attached to a specific image detail.         |
| [03-version-comparison.webp](03-version-comparison.webp) | Two immutable sample revisions shown side by side.                |
| [04-client-review.webp](04-client-review.webp)           | The sample Journal design's version-specific client decision.     |
| [05-mobile-feedback.webp](05-mobile-feedback.webp)       | The image and its feedback adapt to a narrow screen.              |

To regenerate, start a production build locally in one terminal:

```sh
pnpm build
pnpm exec next start -p 3001
```

In another terminal run `pnpm portfolio:capture`. It accepts an optional loopback HTTP origin, requires Chrome (default macOS path; override with `CHROME_BIN`), and overwrites only these named assets and `capture.json`. The script blocks external resources and backend requests, allowing only public page/assets and intercepted demo responses. It creates and removes its own temporary browser profile and does not stop your app server. No browser is needed during normal deployment.
