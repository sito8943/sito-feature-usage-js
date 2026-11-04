import { type ReactNode } from "react";
import type { Tracker } from "../types";
export type FeatureUsageProviderProps<F extends string> = {
    tracker: Tracker<F>;
    children?: ReactNode;
};
/** Makes a tracker available to `useTrack` and `useTrackPage`. Create it once, outside render. */
export declare function FeatureUsageProvider<F extends string>({ tracker, children, }: FeatureUsageProviderProps<F>): import("react").JSX.Element;
/** The tracker in context, or a no-op one: tracking never breaks a screen. */
export declare function useFeatureUsage<F extends string = string>(): Tracker<F>;
/** `const track = useTrack<AppFeature>(); track("transactions.create")`. */
export declare function useTrack<F extends string = string>(): (feature: F) => void;
/**
 * Counts one use of `feature` when it becomes the current one (a page view).
 * React StrictMode's double effect run counts once. `null` skips.
 */
export declare function useTrackPage<F extends string = string>(feature: F | null | undefined): void;
