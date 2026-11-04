import type { SendResult, Transport } from "../types";

// text/plain keeps the request "simple": no CORS preflight, also from Tauri webviews.
const CONTENT_TYPE = "text/plain;charset=UTF-8";

export const resultOfStatus = (status: number): SendResult => {
  if (status >= 200 && status < 300) return "sent";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "rejected";
};

/** POSTs with fetch. Works in browsers, Tauri webviews and React Native. */
export function fetchTransport(fetchImpl: typeof fetch = globalThis.fetch): Transport {
  return {
    async send(url, body, { unloading }) {
      try {
        const response = await fetchImpl(url, {
          method: "POST",
          body,
          headers: { "Content-Type": CONTENT_TYPE },
          credentials: "omit",
          keepalive: unloading,
        });
        return resultOfStatus(response.status);
      } catch {
        return "retry";
      }
    },
  };
}

/**
 * fetch while the page is open (so failures are retried), sendBeacon while it
 * unloads (so the last events are not lost). Falls back to fetch keepalive.
 */
export function webTransport(fetchImpl?: typeof fetch): Transport {
  const viaFetch = fetchTransport(fetchImpl);
  return {
    send(url, body, options) {
      if (
        options.unloading &&
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function"
      ) {
        try {
          if (navigator.sendBeacon(url, new Blob([body], { type: CONTENT_TYPE }))) return "sent";
        } catch {
          // fall through to fetch
        }
      }
      return viaFetch.send(url, body, options);
    },
  };
}
