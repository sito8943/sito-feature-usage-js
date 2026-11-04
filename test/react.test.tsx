// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { Tracker } from "../src";
import { FeatureUsageProvider, useTrack, useTrackPage } from "../src/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const spyTracker = () => {
  const tracked: string[] = [];
  const tracker: Tracker<string> = {
    enabled: true,
    track: (f) => void tracked.push(f),
    flush: vi.fn(async () => undefined),
    registerCatalogue: vi.fn(async () => undefined),
    stop: vi.fn(),
    clear: vi.fn(),
  };
  return { tracker, tracked };
};

const render = (ui: React.ReactNode) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
};

describe("react bindings", () => {
  it("counts a page once under StrictMode, again when it changes", () => {
    const { tracker, tracked } = spyTracker();
    let go!: (page: string) => void;
    function Page() {
      const [page, setPage] = useState("page.home");
      go = setPage;
      useTrackPage(page);
      return null;
    }
    render(
      <StrictMode>
        <FeatureUsageProvider tracker={tracker}>
          <Page />
        </FeatureUsageProvider>
      </StrictMode>,
    );
    expect(tracked).toEqual(["page.home"]);
    act(() => go("page.reports"));
    act(() => go("page.home"));
    expect(tracked).toEqual(["page.home", "page.reports", "page.home"]);
  });

  it("useTrack tracks actions and is a no-op without a provider", () => {
    const { tracker, tracked } = spyTracker();
    let trackFn!: (f: string) => void;
    function Button() {
      trackFn = useTrack();
      return null;
    }
    render(
      <FeatureUsageProvider tracker={tracker}>
        <Button />
      </FeatureUsageProvider>,
    );
    trackFn("transactions.create");
    expect(tracked).toEqual(["transactions.create"]);

    render(<Button />);
    expect(() => trackFn("transactions.create")).not.toThrow();
    expect(tracked).toHaveLength(1);
  });
});
