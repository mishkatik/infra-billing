import { AsyncLocalStorage } from 'node:async_hooks';
import axios, { type CreateAxiosDefaults } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

/** Default per-request timeout for outbound provider API calls (30s). */
export const REQUEST_TIMEOUT_MS = 30_000;

// Accounts sync in parallel, so the proxy travels with the async context, not a global default.
const proxyStore = new AsyncLocalStorage<SocksProxyAgent>();

/** Run `fn` so that every client made by {@link createHttp} inside it goes through `proxyUrl`. */
export function withProxy<T>(proxyUrl: string | null, fn: () => Promise<T>): Promise<T> {
  return proxyUrl ? proxyStore.run(new SocksProxyAgent(proxyUrl), fn) : fn();
}

/** SOCKS agent of the account being synced, for transports other than axios. */
export const proxyAgent = (): SocksProxyAgent | undefined => proxyStore.getStore();

/** `axios.create` that routes through the current account's proxy when one is set. */
export function createHttp(config: CreateAxiosDefaults = {}) {
  const agent = proxyAgent();
  // proxy: false keeps axios from also applying HTTP(S)_PROXY env vars on top of the agent.
  return axios.create(
    agent ? { ...config, httpAgent: agent, httpsAgent: agent, proxy: false } : config,
  );
}
