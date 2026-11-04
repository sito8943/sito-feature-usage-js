import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTracker,
  noopTracker,
  resultOfStatus,
  webTransport,
  type SendResult,
  type StorageLike,
  type TrackerOptions,
} from "../src";

type Sent = { url: string; body: any; unloading: boolean };

const memoryStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const fakeTransport = (results: SendResult[] = []) => {
  const sent: Sent[] = [];
  return {
    sent,
    events: () => sent.filter((s) => s.url.endsWith("/v1/events")),
    catalogues: () => sent.filter((s) => s.url.endsWith("/v1/features")),
    send(url: string, body: string, { unloading }: { unloading: boolean }) {
      sent.push({ url, body: JSON.parse(body), unloading });
      return Promise.resolve(results.shift() ?? "sent");
    },
  };
};

let clock = new Date("2026-11-04T15:00:00Z");
const FEATURES = ["page.home", "transactions.create", "budgets.edit"] as const;

const make = (overrides: Partial<TrackerOptions<(typeof FEATURES)[number]>> = {}) => {
  const transport = overrides.transport ?? fakeTransport();
  const storage = overrides.storage === undefined ? memoryStorage() : overrides.storage;
  const onError = vi.fn();
  const tracker = createTracker({
    app: "wallet",
    key: "wallet-key-0123456789",
    endpoint: "https://api.usage.test/",
    features: FEATURES,
    autoFlush: false,
    registerCatalogue: false,
    now: () => clock,
    onError,
    ...overrides,
    transport,
    storage,
  });
  return { tracker, transport: transport as ReturnType<typeof fakeTransport>, storage, onError };
};

afterEach(() => {
  clock = new Date("2026-11-04T15:00:00Z");
  vi.useRealTimers();
});

describe("createTracker", () => {
  it("queues uses and sends them with the UTC day", async () => {
    const { tracker, transport } = make();
    tracker.track("page.home");
    tracker.track("page.home");
    tracker.track("transactions.create");
    expect(transport.sent).toHaveLength(0);

    await tracker.flush();
    expect(transport.events()).toEqual([
      {
        url: "https://api.usage.test/v1/events",
        unloading: false,
        body: {
          app: "wallet",
          key: "wallet-key-0123456789",
          events: [
            { feature: "page.home", day: "2026-11-04" },
            { feature: "page.home", day: "2026-11-04" },
            { feature: "transactions.create", day: "2026-11-04" },
          ],
        },
      },
    ]);
    await tracker.flush();
    expect(transport.events()).toHaveLength(1);
  });

  it("is a no-op without an endpoint", async () => {
    const transport = fakeTransport();
    const tracker = createTracker({ app: "wallet", key: "k", endpoint: "", features: FEATURES, transport });
    expect(tracker.enabled).toBe(false);
    tracker.track("page.home");
    await tracker.flush();
    await tracker.registerCatalogue();
    expect(transport.sent).toHaveLength(0);
    expect(noopTracker().enabled).toBe(false);
  });

  it("drops names that are not dotted slugs and reports them", async () => {
    const { tracker, transport, onError } = make();
    tracker.track("Me@Example.com" as never);
    await tracker.flush();
    expect(transport.sent).toHaveLength(0);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("splits into batches of 50 and flushes by itself at 50", async () => {
    const { tracker, transport } = make();
    for (let i = 0; i < 49; i++) tracker.track("page.home");
    expect(transport.sent).toHaveLength(0);
    tracker.track("page.home");
    await tracker.flush();
    expect(transport.events()).toHaveLength(1);
    expect(transport.events()[0].body.events).toHaveLength(50);

    for (let i = 0; i < 120; i++) tracker.track("budgets.edit");
    await tracker.flush();
    const sizes = transport.events().map((s) => s.body.events.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(170);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(50);
  });

  it("keeps events to retry and drops refused ones", async () => {
    const transport = fakeTransport(["retry", "rejected"]);
    const { tracker, onError } = make({ transport });
    tracker.track("page.home");
    await tracker.flush(); // retry: kept
    await tracker.flush(); // rejected: dropped
    await tracker.flush(); // nothing left
    expect(transport.events()).toHaveLength(2);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("never loses events tracked while a request is in flight", async () => {
    let release!: (r: SendResult) => void;
    const sent: string[][] = [];
    const transport = {
      send: (_url: string, body: string) => {
        sent.push(JSON.parse(body).events.map((e: { feature: string }) => e.feature));
        return sent.length === 1 ? new Promise<SendResult>((r) => (release = r)) : "sent";
      },
    };
    const { tracker } = make({ transport: transport as never });
    tracker.track("page.home");
    const first = tracker.flush();
    tracker.track("budgets.edit");
    // The page hides while the first request is still open.
    await tracker.flush({ unloading: true });
    release("sent");
    await first;
    await tracker.flush();
    expect(sent.flat().filter((f) => f === "budgets.edit")).toHaveLength(1);
  });

  it("keeps unsent events across restarts and drops week-old ones", async () => {
    const storage = memoryStorage();
    const first = make({ storage, transport: fakeTransport(["retry"]) });
    first.tracker.track("page.home");
    await first.tracker.flush();

    clock = new Date("2026-11-06T09:00:00Z");
    const second = make({ storage });
    await second.tracker.flush();
    expect(second.transport.events()[0].body.events).toEqual([{ feature: "page.home", day: "2026-11-04" }]);

    const third = make({ storage, transport: fakeTransport(["retry"]) });
    third.tracker.track("budgets.edit");
    await third.tracker.flush();
    clock = new Date("2026-11-14T09:00:00Z");
    const fourth = make({ storage });
    await fourth.tracker.flush();
    expect(fourth.transport.sent).toHaveLength(0);
  });

  it("ignores a corrupt stored queue", async () => {
    const storage = memoryStorage();
    storage.setItem("sito-feature-usage:wallet:queue", "{not json");
    const { tracker, transport } = make({ storage });
    tracker.track("page.home");
    await tracker.flush();
    expect(transport.events()[0].body.events).toHaveLength(1);
  });

  it("caps the queue while the service is unreachable", async () => {
    const transport = fakeTransport(Array(100).fill("retry"));
    const { tracker, storage } = make({ transport });
    for (let i = 0; i < 700; i++) tracker.track("page.home");
    const stored = JSON.parse(storage!.getItem("sito-feature-usage:wallet:queue")!);
    expect(stored).toHaveLength(500);
  });

  it("works without storage", async () => {
    const { tracker, transport } = make({ storage: null });
    tracker.track("page.home");
    await tracker.flush();
    expect(transport.events()).toHaveLength(1);
  });

  it("sends the catalogue once a day per list", async () => {
    const storage = memoryStorage();
    const transport = fakeTransport();
    const a = make({ storage, transport, registerCatalogue: true });
    await a.tracker.registerCatalogue();
    await Promise.resolve();
    expect(transport.catalogues()).toHaveLength(1);
    expect(transport.catalogues()[0].body).toEqual({
      app: "wallet",
      key: "wallet-key-0123456789",
      features: [...FEATURES],
    });

    make({ storage, transport, registerCatalogue: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.catalogues()).toHaveLength(1);

    clock = new Date("2026-11-05T08:00:00Z");
    await make({ storage, transport }).tracker.registerCatalogue();
    expect(transport.catalogues()).toHaveLength(2);

    await make({ storage, transport, features: ["page.home"] as never }).tracker.registerCatalogue();
    expect(transport.catalogues()).toHaveLength(3);
  });

  it("retries the catalogue when it was not delivered", async () => {
    const storage = memoryStorage();
    const transport = fakeTransport(["retry"]);
    const { tracker } = make({ storage, transport });
    await tracker.registerCatalogue();
    await tracker.registerCatalogue();
    expect(transport.catalogues()).toHaveLength(2);
    await tracker.registerCatalogue();
    expect(transport.catalogues()).toHaveLength(2);
  });

  it("flushes on its interval until stopped", async () => {
    vi.useFakeTimers();
    const { tracker, transport } = make({ autoFlush: true, flushIntervalMs: 1000 });
    tracker.track("page.home");
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport.events()).toHaveLength(1);
    tracker.stop();
    tracker.track("page.home");
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.events()).toHaveLength(1);
  });

  it("swallows transport and callback errors", async () => {
    const transport = { send: () => { throw new Error("boom"); } };
    const tracker = createTracker({
      app: "wallet",
      key: "k",
      endpoint: "https://x",
      features: FEATURES,
      transport,
      storage: null,
      autoFlush: false,
      registerCatalogue: false,
      onError: () => { throw new Error("callback"); },
    });
    tracker.track("nope nope" as never);
    tracker.track("page.home");
    await expect(tracker.flush()).resolves.toBeUndefined();
    await expect(tracker.registerCatalogue()).resolves.toBeUndefined();
  });
});

describe("transports", () => {
  it("maps statuses", () => {
    expect([204, 200, 429, 408, 500, 503, 401, 422, 400].map(resultOfStatus)).toEqual([
      "sent", "sent", "retry", "retry", "retry", "retry", "rejected", "rejected", "rejected",
    ]);
  });

  it("uses fetch with text/plain and no credentials, and sendBeacon on unload", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const transport = webTransport(fetchImpl as never);

    expect(await transport.send("https://x/v1/events", "{}", { unloading: false })).toBe("sent");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ "Content-Type": "text/plain;charset=UTF-8" });
    expect(init.credentials).toBe("omit");

    expect(transport.send("https://x/v1/events", "{}", { unloading: true })).toBe("sent");
    expect(beacon).toHaveBeenCalledOnce();

    beacon.mockReturnValueOnce(false);
    expect(await transport.send("https://x/v1/events", "{}", { unloading: true })).toBe("sent");
    expect((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].keepalive).toBe(true);

    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    expect(await transport.send("https://x/v1/events", "{}", { unloading: false })).toBe("retry");
    vi.unstubAllGlobals();
  });
});
