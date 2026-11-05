import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

import { noopTracker } from "../tracker.js";
import type { Tracker } from "../types.js";

const FeatureUsageContext = createContext<Tracker<string> | null>(null);

export type FeatureUsageProviderProps<F extends string> = {
  tracker: Tracker<F>;
  children?: ReactNode;
};

/** Makes a tracker available to `useTrack` and `useTrackPage`. Create it once, outside render. */
export function FeatureUsageProvider<F extends string>({
  tracker,
  children,
}: FeatureUsageProviderProps<F>) {
  return (
    <FeatureUsageContext.Provider value={tracker as Tracker<string>}>
      {children}
    </FeatureUsageContext.Provider>
  );
}

/** The tracker in context, or a no-op one: tracking never breaks a screen. */
export function useFeatureUsage<F extends string = string>(): Tracker<F> {
  return (useContext(FeatureUsageContext) as Tracker<F> | null) ?? noopTracker<F>();
}

/** `const track = useTrack<AppFeature>(); track("transactions.create")`. */
export function useTrack<F extends string = string>(): (feature: F) => void {
  return useFeatureUsage<F>().track;
}

/**
 * Counts one use of `feature` when it becomes the current one (a page view).
 * React StrictMode's double effect run counts once. `null` skips.
 */
export function useTrackPage<F extends string = string>(feature: F | null | undefined): void {
  const tracker = useFeatureUsage<F>();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!feature || last.current === feature) return;
    last.current = feature;
    tracker.track(feature);
  }, [feature, tracker]);
}
