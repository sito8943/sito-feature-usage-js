import type { SendResult, Transport } from "../types.js";
export declare const resultOfStatus: (status: number) => SendResult;
/** POSTs with fetch. Works in browsers, Tauri webviews and React Native. */
export declare function fetchTransport(fetchImpl?: typeof fetch): Transport;
/**
 * fetch while the page is open (so failures are retried), sendBeacon while it
 * unloads (so the last events are not lost). Falls back to fetch keepalive.
 */
export declare function webTransport(fetchImpl?: typeof fetch): Transport;
