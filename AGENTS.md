# Sito Feature Usage (JS client) — Agent Instructions

- Start with `git status --short` and ask before touching existing changes.
- Anonymous by design: send only feature names and UTC days. Never add user ids, sessions, URLs,
  free text, cookies (`credentials: "omit"`) or device fingerprints.
- Keep the validation rules in sync with the service (`sito-feature-usage/server/internal/usage`):
  dotted-slug features ≤ 64 chars, ≤ 50 events per batch, ≤ 500 catalogue features, 7-day backfill.
- Tracking must never throw into the app; report through `onError`.
- Keep the core React-free; React bindings live under `src/react`.
- Distribution is git tags with committed `dist/`: run `pnpm build` and commit `dist/` with every
  source change. `pnpm test` and `pnpm typecheck` must pass.
