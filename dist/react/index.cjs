'use strict';

var jsxRuntime = require('react/jsx-runtime');
var react = require('react');
var index = require('../index.cjs');

const FeatureUsageContext = react.createContext(null);
/** Makes a tracker available to `useTrack` and `useTrackPage`. Create it once, outside render. */
function FeatureUsageProvider({ tracker, children, }) {
    return (jsxRuntime.jsx(FeatureUsageContext.Provider, { value: tracker, children: children }));
}
/** The tracker in context, or a no-op one: tracking never breaks a screen. */
function useFeatureUsage() {
    return react.useContext(FeatureUsageContext) ?? index.noopTracker();
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
    const last = react.useRef(null);
    react.useEffect(() => {
        if (!feature || last.current === feature)
            return;
        last.current = feature;
        tracker.track(feature);
    }, [feature, tracker]);
}

exports.FeatureUsageProvider = FeatureUsageProvider;
exports.useFeatureUsage = useFeatureUsage;
exports.useTrack = useTrack;
exports.useTrackPage = useTrackPage;
