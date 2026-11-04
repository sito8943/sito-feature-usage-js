import type { Tracker, TrackerOptions } from "./types";
export declare const isValidFeature: (feature: string) => boolean;
/** A tracker that does nothing: for tests, previews and apps without an endpoint. */
export declare const noopTracker: <F extends string = string>() => Tracker<F>;
/**
 * Creates a tracker for one app. Events are queued in memory (and storage)
 * and sent in batches; nothing personal is sent: only the feature name and
 * the UTC day.
 */
export declare function createTracker<const F extends string>(options: TrackerOptions<F>): Tracker<F>;
