/**
 * What a transport did with a request:
 * - `sent`: delivered (or handed to the browser to deliver, for sendBeacon).
 * - `retry`: offline, server error or rate limit; keep the events and try later.
 * - `rejected`: the service refused it (bad key, invalid name); retrying will not help.
 */
export type SendResult = "sent" | "retry" | "rejected";

export type SendOptions = {
  /** The page is being hidden or closed: the request must survive it. */
  unloading: boolean;
};

export type Transport = {
  send(url: string, body: string, options: SendOptions): SendResult | Promise<SendResult>;
};

/** The part of `localStorage` the tracker uses; any compatible store works. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type TrackerOptions<F extends string> = {
  /** App id, as configured in the service's `APPS` (e.g. `wallet`). */
  app: string;
  /** The app's public key, as configured in the service's `APPS`. */
  key: string;
  /** Service base URL (e.g. `https://api.usage.sito8943.com`). Empty disables tracking. */
  endpoint?: string | null;
  /** Every feature the app has, so unused ones show up. Dotted slugs. */
  features: readonly F[];
  /** Defaults to `webTransport()`: fetch, and sendBeacon while the page unloads. */
  transport?: Transport;
  /** Keeps unsent events across reloads. Defaults to `localStorage` when available; `null` disables it. */
  storage?: StorageLike | null;
  /** How often queued events are sent. Default 30 s. */
  flushIntervalMs?: number;
  /** Flush on an interval, when the page is hidden and when it comes back online. Default true. */
  autoFlush?: boolean;
  /** Send the catalogue on start, at most once a day per list. Default true. */
  registerCatalogue?: boolean;
  /** Called with dropped events or refused requests; tracking never throws. */
  onError?: (error: Error) => void;
  /** Clock, for tests. */
  now?: () => Date;
};

export type FlushOptions = Partial<SendOptions>;

export type Tracker<F extends string = string> = {
  /** False when there is no endpoint: every method is a no-op. */
  readonly enabled: boolean;
  /** Counts one use of a feature. Cheap: it only queues. */
  track(feature: F): void;
  /** Sends queued events now. */
  flush(options?: FlushOptions): Promise<void>;
  /** Sends the catalogue unless this list was already sent today. */
  registerCatalogue(): Promise<void>;
  /** Stops timers and listeners. Queued events stay in storage for the next start. */
  stop(): void;
};

/** Feature union of a catalogue: `FeatureOf<typeof FEATURES>`. */
export type FeatureOf<T extends readonly string[]> = T[number];
