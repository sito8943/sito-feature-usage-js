# `@sito/feature-usage`

> **Alpha.** API may change between `0.1.0-alpha.*` tags. Install from git by tag:
> `"@sito/feature-usage": "github:sito8943/sito-feature-usage-js#v0.1.0-alpha.4"`. With npm, use the tarball
> `https://codeload.github.com/sito8943/sito-feature-usage-js/tar.gz/refs/tags/v0.1.0-alpha.4` (npm cannot prepare
> this git dependency).
> `dist/` is committed so consumers need no build step; run `pnpm build` and commit `dist/` with
> every change.

Anonymous feature usage for Sito apps: which features get used, and which never. Client for the
[`sito-feature-usage`](https://github.com/sito8943/sito-feature-usage) service.

It sends only the feature name and the UTC day. No user, session, URL or content, and requests carry
no cookies.

## Use

```ts
// src/lib/featureUsage.ts
import { createTracker, type FeatureOf } from "@sito/feature-usage";

// Every feature of the app, so the ones nobody uses show up. Dotted slugs.
export const FEATURES = [
  "page.home",
  "page.transactions",
  "transactions.create",
  "transactions.import",
] as const;
export type AppFeature = FeatureOf<typeof FEATURES>;

export const tracker = createTracker({
  app: "wallet", // id in the service's APPS
  key: import.meta.env.VITE_USAGE_KEY, // public app key
  endpoint: import.meta.env.VITE_USAGE_URL, // empty: tracking off (dev, tests)
  features: FEATURES,
});

tracker.track("transactions.create"); // typed: only catalogue names compile
```

React (`@sito/feature-usage/react`):

```tsx
import { FeatureUsageProvider, useTrack, useTrackPage } from "@sito/feature-usage/react";

<FeatureUsageProvider tracker={tracker}>
  <App />
</FeatureUsageProvider>;

function Transactions() {
  useTrackPage<AppFeature>("page.transactions"); // once per view, StrictMode-safe
  const track = useTrack<AppFeature>();
  return <button onClick={() => track("transactions.create")}>New</button>;
}
```

Without a provider, the hooks do nothing.

## Behaviour

| | |
|---|---|
| Sending | Queued; sent every 30 s, at 50 events, when the page is hidden (sendBeacon) and when it comes back online. |
| Offline | The queue is kept in `localStorage` (up to 500 events, 7 days) and sent on the next start. |
| Catalogue | Sent on start, at most once a day per list. |
| Errors | Never thrown. Invalid names and refused requests go to `onError` and are dropped; network and 5xx/429 errors are retried. |
| CORS | `text/plain` POSTs, so no preflight (also from Tauri webviews). Add the app's origin to the service's `ALLOWED_ORIGINS`. |

## Options

| Option | Default | |
|---|---|---|
| `app`, `key`, `features` | — | required |
| `endpoint` | — | empty or missing: no-op tracker |
| `transport` | `webTransport()` | `fetchTransport()` for non-browser runtimes (React Native) or your own |
| `storage` | `localStorage` if available | any `getItem/setItem/removeItem`; `null` to keep the queue in memory |
| `flushIntervalMs` | `30000` | |
| `autoFlush` | `true` | interval and page lifecycle listeners |
| `registerCatalogue` | `true` | |
| `onError` | — | |

`tracker.flush()`, `tracker.registerCatalogue()`, `tracker.stop()` and `tracker.clear()` (forget queued
events and stored state, e.g. when consent is withdrawn) are also available.

## Scripts

`pnpm test`, `pnpm typecheck`, `pnpm build`.
