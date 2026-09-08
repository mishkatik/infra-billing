import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { FaviconCandidate, FaviconSource, buildFaviconCandidates, pngWidth } from './favicon.util';

export interface FaviconImage {
  body: Buffer;
  contentType: string;
}

interface CacheEntry {
  /** null = negative entry: nothing resolved, don't retry until it expires. */
  image: FaviconImage | null;
  expiresAt: number;
}

const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 256;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024;
// Google s2 serves a 16px globe when it has no icon for the domain.
const SERVICE_MIN_WIDTH = 17;

const http = axios.create({
  timeout: FETCH_TIMEOUT_MS,
  maxRedirects: 3,
  maxContentLength: MAX_BYTES,
  responseType: 'arraybuffer',
  headers: { Accept: 'image/*' },
  validateStatus: (s) => s === 200,
});

/**
 * Same-origin favicon proxy. Panels and Google's favicon service send no CORS headers, so the
 * frontend can only inspect an icon's pixels (to pick a contrasting tile) when it comes from
 * here. Images are cached in memory per entity; a burst of identical <img> requests from one
 * table render shares a single upstream fetch.
 */
@Injectable()
export class FaviconsService {
  private readonly logger = new Logger(FaviconsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<FaviconImage | null>>();

  constructor(
    private readonly providers: ProvidersRepository,
    private readonly projects: ProjectsRepository,
  ) {}

  getProviderFavicon(uuid: string): Promise<FaviconImage | null> {
    return this.resolve(`provider:${uuid}`, async () => {
      const p = await this.providers.findByUuid(uuid);
      return p ? { faviconLink: p.faviconLink, loginUrl: p.loginUrl } : null;
    });
  }

  getProjectFavicon(uuid: string): Promise<FaviconImage | null> {
    return this.resolve(`project:${uuid}`, async () => {
      const p = await this.projects.findByUuid(uuid);
      return p ? { faviconLink: p.faviconLink, loginUrl: null } : null;
    });
  }

  invalidateProvider(uuid: string): void {
    this.cache.delete(`provider:${uuid}`);
  }

  invalidateProject(uuid: string): void {
    this.cache.delete(`project:${uuid}`);
  }

  private resolve(
    key: string,
    loadSource: () => Promise<FaviconSource | null>,
  ): Promise<FaviconImage | null> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.image);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const task = this.load(key, loadSource).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  private async load(
    key: string,
    loadSource: () => Promise<FaviconSource | null>,
  ): Promise<FaviconImage | null> {
    const source = await loadSource();
    // Unknown entity: not cached, the controller answers 404.
    if (!source) return null;
    for (const candidate of buildFaviconCandidates(source)) {
      const image = await this.fetchImage(candidate);
      if (image) {
        this.store(key, image, POSITIVE_TTL_MS);
        return image;
      }
    }
    this.store(key, null, NEGATIVE_TTL_MS);
    return null;
  }

  private store(key: string, image: FaviconImage | null, ttlMs: number): void {
    // Map keeps insertion order: delete + set moves the key to the end, eviction takes the head.
    this.cache.delete(key);
    while (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { image, expiresAt: Date.now() + ttlMs });
  }

  private async fetchImage({ url, service }: FaviconCandidate): Promise<FaviconImage | null> {
    try {
      const res = await http.get<ArrayBuffer>(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentType = String(res.headers['content-type'] ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!contentType.startsWith('image/')) {
        throw new Error(`unexpected content-type "${contentType || 'none'}"`);
      }
      // Node's adapter already yields a Buffer for arraybuffer responses; keep the copy-free path.
      const raw: unknown = res.data;
      const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      if (body.length === 0) throw new Error('empty body');
      if (service && (pngWidth(body) ?? SERVICE_MIN_WIDTH) < SERVICE_MIN_WIDTH) {
        throw new Error('placeholder globe');
      }
      return { body, contentType };
    } catch (e) {
      this.logger.debug(`Favicon ${url}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
