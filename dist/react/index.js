import { jsx } from 'react/jsx-runtime';
import { createContext, useContext, useRef, useEffect } from 'react';
import { noopTracker } from '../index.js';

const FeatureUsageContext = createContext(null);
/** Makes a tracker available to `useTrack` and `useTrackPage`. Create it once, outside render. */
function FeatureUsageProvider({ tracker, children, }) {
    return (jsx(FeatureUsageContext.Provider, { value: tracker, children: children }));
}
/** The tracker in context, or a no-op one: tracking never breaks a screen. */
function useFeatureUsage() {
    return useContext(FeatureUsageContext) ?? noopTracker();
}
/** `const track = useTrack<AppFeature>(); track("transactions.create")`. */
function useTrack() {
    return useFeatureUsage().track;
}
/**
 * Counts one use of `feature` when it becomes the current one (a page view).
 * React StrictMode's double effect run counts once. `null` skips.
 */
function useTrackPage(feature) {
    const tracker = useFeatureUsage();
    const last = useRef(null);
    useEffect(() => {
        if (!feature || last.current === feature)
            return;
        last.current = feature;
        tracker.track(feature);
    }, [feature, tracker]);
}

export { FeatureUsageProvider, useFeatureUsage, useTrack, useTrackPage };
