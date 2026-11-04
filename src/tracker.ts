import { webTransport } from "./transports";
import type {
  FlushOptions,
  SendResult,
  StorageLike,
  Tracker,
  TrackerOptions,
} from "./types";

// Mirrors the service's rules (server/internal/usage).
const FEATURE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;
const MAX_NAME_LENGTH = 64;
const MAX_BATCH = 50;
const MAX_CATALOGUE = 500;
// The service counts events older than this as today; drop them instead.
const MAX_AGE_DAYS = 7;
// Bounds storage when the service is unreachable for a long time.
const MAX_QUEUE = 500;
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const DAY_MS = 86_400_000;

type QueuedEvent = { feature: string; day: string };

export const isValidFeature = (feature: string) =>
  feature.length <= MAX_NAME_LENGTH && FEATURE_PATTERN.test(feature);

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

// Short, stable fingerprint of a catalogue; only compared, never sent.
const fingerprint = (features: readonly string[]) => {
  let hash = 5381;
  for (const char of [...features].sort().join(",")) {
    hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
  }
  return `${features.length}-${(hash >>> 0).toString(36)}`;
};

const disabledTracker: Tracker<never> = {
  enabled: false,
  track: () => undefined,
  flush: () => Promise.resolve(),
  registerCatalogue: () => Promise.resolve(),
  stop: () => undefined,
};

/** A tracker that does nothing: for tests, previews and apps without an endpoint. */
export const noopTracker = <F extends string = string>(): Tracker<F> =>
  disabledTracker as Tracker<F>;

/**
 * Creates a tracker for one app. Events are queued in memory (and storage)
 * and sent in batches; nothing personal is sent: only the feature name and
 * the UTC day.
 */
export function createTracker<const F extends string>(options: TrackerOptions<F>): Tracker<F> {
  const endpoint = options.endpoint?.trim().replace(/\/+$/, "");
  if (!endpoint) return noopTracker<F>();

  const {
    app,
    key,
    features,
    transport = webTransport(),
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    autoFlush = true,
    onError,
    now = () => new Date(),
  } = options;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const queueKey = `sito-feature-usage:${app}:queue`;
  const catalogueKey = `sito-feature-usage:${app}:catalogue`;

  const report = (message: string) => {
    try {
      onError?.(new Error(`[feature-usage] ${message}`));
    } catch {
      // never let a reporting callback break the app
    }
  };

  const read = (storageKey: string) => {
    try {
      return storage?.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  };
  const write = (storageKey: string, value: string | null) => {
    try {
      if (value === null) storage?.removeItem(storageKey);
      else storage?.setItem(storageKey, value);
    } catch {
      // storage full or blocked: keep working in memory
    }
  };

  const isFresh = (event: QueuedEvent) =>
    Date.parse(`${event.day}T00:00:00Z`) >= Date.parse(`${utcDay(now())}T00:00:00Z`) - MAX_AGE_DAYS * DAY_MS;

  const load = (): QueuedEvent[] => {
    try {
      const stored: unknown = JSON.parse(read(queueKey) ?? "[]");
      if (!Array.isArray(stored)) return [];
      return stored
        .filter(
          (e): e is QueuedEvent =>
            typeof e?.feature === "string" &&
            typeof e?.day === "string" &&
            isValidFeature(e.feature) &&
            /^\d{4}-\d{2}-\d{2}$/.test(e.day),
        )
        .filter(isFresh)
        .slice(-MAX_QUEUE);
    } catch {
      return [];
    }
  };

  let queue = load();
  let inFlight: Promise<void> | null = null;

  const persist = () => write(queueKey, queue.length ? JSON.stringify(queue) : null);

  const url = (path: string) => `${endpoint}/v1/${path}`;

  // Removes exactly the events of the batch (by identity): a flush on unload
  // may run next to one in flight, and must never drop events it did not send.
  const settle = (result: SendResult, batch: QueuedEvent[]) => {
    if (result === "retry") return false;
    if (result === "rejected") report(`the service refused ${batch.length} event(s) of "${app}"`);
    const sent = new Set(batch);
    queue = queue.filter((event) => !sent.has(event));
    persist();
    return true;
  };

  const sendAll = async (unloading: boolean) => {
    queue = queue.filter(isFresh);
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_BATCH);
      const body = JSON.stringify({ app, key, events: batch });
      let result: SendResult;
      try {
        const sent = transport.send(url("events"), body, { unloading });
        // Synchronous results (sendBeacon) settle before the page goes away.
        result = typeof sent === "string" ? sent : await sent;
      } catch {
        result = "retry";
      }
      if (!settle(result, batch)) return;
    }
  };

  const flush = (flushOptions: FlushOptions = {}): Promise<void> => {
    const unloading = flushOptions.unloading ?? false;
    // While unloading there is no time to wait for a request in flight.
    if (inFlight && !unloading) return inFlight;
    const run = sendAll(unloading).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run;
  };

  const track = (feature: F) => {
    if (typeof feature !== "string" || !isValidFeature(feature)) {
      report(`"${String(feature)}" is not a dotted slug; not counted`);
      return;
    }
    queue.push({ feature, day: utcDay(now()) });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    persist();
    if (queue.length >= MAX_BATCH) void flush();
  };

  let catalogueInFlight: Promise<void> | null = null;

  // Concurrent calls (the one on start and a manual one) share one request.
  const registerCatalogue = (): Promise<void> => {
    catalogueInFlight ??= sendCatalogue().finally(() => {
      catalogueInFlight = null;
    });
    return catalogueInFlight;
  };

  const sendCatalogue = async () => {
    const valid = [...new Set(features)].filter((f) => {
      if (isValidFeature(f)) return true;
      report(`catalogue feature "${f}" is not a dotted slug; left out`);
      return false;
    });
    if (valid.length === 0) return;
    if (valid.length > MAX_CATALOGUE) {
      report(`a catalogue lists at most ${MAX_CATALOGUE} features; ${valid.length} given`);
      return;
    }
    const marker = `${utcDay(now())}:${fingerprint(valid)}`;
    if (read(catalogueKey) === marker) return;
    let result: SendResult;
    try {
      result = await transport.send(url("features"), JSON.stringify({ app, key, features: valid }), {
        unloading: false,
      });
    } catch {
      result = "retry";
    }
    if (result === "sent") write(catalogueKey, marker);
    if (result === "rejected") report(`the service refused the catalogue of "${app}"`);
  };

  const cleanups: Array<() => void> = [];
  if (autoFlush) {
    const timer = setInterval(() => void flush(), flushIntervalMs);
    cleanups.push(() => clearInterval(timer));
    if (typeof document !== "undefined" && typeof window !== "undefined") {
      const onHidden = () => {
        if (document.visibilityState === "hidden") void flush({ unloading: true });
      };
      const onPageHide = () => void flush({ unloading: true });
      const onOnline = () => void flush();
      document.addEventListener("visibilitychange", onHidden);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("online", onOnline);
      cleanups.push(() => {
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("online", onOnline);
      });
    }
  }

  if (options.registerCatalogue ?? true) void registerCatalogue();
  // Events left from a previous session go out soon after start.
  if (queue.length > 0) void flush();

  return {
    enabled: true,
    track,
    flush,
    registerCatalogue,
    stop: () => {
      while (cleanups.length) cleanups.pop()?.();
    },
  };
}
