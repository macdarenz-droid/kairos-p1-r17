import learningSourceCatalogJson from '../../content/library/learningSources.json';
import {
  checkLearningSourceFile,
  parseLearningSourceCatalog,
  type LearningSource,
  type LearningSourceCatalog,
  type LearningSourceId,
} from '../../domain/library/learningSources';
import { KAIROS_LEARNING_SOURCES_CACHE, KAIROS_LEARNING_SOURCES_PATH } from '../../pwa/serviceWorkerBuild';

/**
 * P23 learning sources on this device: the shipped catalog, each source's
 * revision URL, which sources are saved here, saving (checked first) and
 * removing. It is the only writer of the learning-sources cache; nothing here
 * touches IndexedDB, a journal table or a backup.
 */
let catalog: LearningSourceCatalog | null = null;

export function readLearningSourceCatalog(): LearningSourceCatalog {
  catalog ??= parseLearningSourceCatalog(learningSourceCatalogJson as unknown);
  return catalog;
}

/** The URL names the revision, so a replaced file is never served from an old saved copy. File names are URL-safe by contract. */
export function learningSourceHref(source: LearningSource): string {
  return `${KAIROS_LEARNING_SOURCES_PATH}${source.revision.fileName}?rev=${source.revision.sha256.slice(0, 16)}`;
}

/** Space kept free for the journal; a source is saved only if free space ≥ its size + this. */
export const KAIROS_LEARNING_SOURCE_SPACE_RESERVE_BYTES = 50_000_000;

export interface LearningSourceCache {
  keys(): Promise<readonly Request[]>;
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(request: string | Request): Promise<boolean>;
}

export interface LearningSourceDevice {
  /** null: this browser has no Cache Storage. */
  readonly openCache: (() => Promise<LearningSourceCache>) | null;
  readonly download: (href: string) => Promise<Response>;
  /** null: no Web Crypto (not a secure context). */
  readonly sha256Hex: ((bytes: Uint8Array<ArrayBuffer>) => Promise<string>) | null;
  /** null: unknown. */
  readonly freeSpace: () => Promise<number | null>;
}

const toHex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** The real device: Cache Storage, fetch, Web Crypto and the storage estimate, each null when the browser lacks it. */
export function browserLearningSourceDevice(): LearningSourceDevice {
  const subtle = globalThis.crypto?.subtle;
  return {
    openCache: typeof caches === 'undefined' ? null : () => caches.open(KAIROS_LEARNING_SOURCES_CACHE),
    download: (href) => fetch(href, { cache: 'no-cache' }),
    sha256Hex: subtle === undefined ? null : async (bytes) => toHex(await subtle.digest('SHA-256', bytes)),
    freeSpace: async () => {
      try {
        const estimate = await globalThis.navigator?.storage?.estimate?.();
        return typeof estimate?.quota === 'number' && typeof estimate.usage === 'number' ? estimate.quota - estimate.usage : null;
      } catch {
        return null;
      }
    },
  };
}

export type LearningSourceOfflineStates =
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'ready'; saved: ReadonlySet<LearningSourceId> }>;

/** Which sources are saved on this device. A saved copy of an old revision, or of a source this build no longer lists, is deleted. */
export async function readLearningSourceOfflineStates(sources: readonly LearningSource[], device: LearningSourceDevice): Promise<LearningSourceOfflineStates> {
  if (device.openCache === null) return Object.freeze({ kind: 'unsupported' as const });
  try {
    const cache = await device.openCache();
    const byHref = new Map(sources.map((source) => [learningSourceHref(source), source.id]));
    const saved = new Set<LearningSourceId>();
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      const id = byHref.get(url.pathname + url.search);
      if (id === undefined) await cache.delete(request);
      else saved.add(id);
    }
    return Object.freeze({ kind: 'ready' as const, saved });
  } catch {
    return Object.freeze({ kind: 'unsupported' as const });
  }
}

export type SaveLearningSourceResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: 'unsupported' | 'not-enough-space' | 'download-failed' | 'file-mismatch' | 'storage-failed' }>;

const refused = (reason: Extract<SaveLearningSourceResult, { ok: false }>['reason']): SaveLearningSourceResult => Object.freeze({ ok: false as const, reason });

/** Saves one source for offline reading, only after its size, PDF start and SHA-256 match the catalog. "Saved" always means "checked". */
export async function saveLearningSourceForOffline(source: LearningSource, device: LearningSourceDevice): Promise<SaveLearningSourceResult> {
  const { openCache, sha256Hex } = device;
  if (openCache === null || sha256Hex === null) return refused('unsupported');
  const free = await device.freeSpace();
  if (free !== null && free < source.revision.bytes + KAIROS_LEARNING_SOURCE_SPACE_RESERVE_BYTES) return refused('not-enough-space');
  const href = learningSourceHref(source);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    const response = await device.download(href);
    if (!response.ok) return refused('download-failed');
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return refused('download-failed');
  }
  // A host that answers a missing file with the app's HTML page fails here too.
  if (checkLearningSourceFile(source, bytes, await sha256Hex(bytes)) !== null) return refused('file-mismatch');
  try {
    await (await openCache()).put(href, new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-length': String(bytes.byteLength) } }));
    return Object.freeze({ ok: true as const });
  } catch {
    return refused('storage-failed');
  }
}

export async function removeLearningSourceFromDevice(source: LearningSource, device: LearningSourceDevice): Promise<Readonly<{ ok: true }> | Readonly<{ ok: false; reason: 'unsupported' | 'storage-failed' }>> {
  if (device.openCache === null) return Object.freeze({ ok: false as const, reason: 'unsupported' as const });
  try {
    await (await device.openCache()).delete(learningSourceHref(source));
    return Object.freeze({ ok: true as const });
  } catch {
    return Object.freeze({ ok: false as const, reason: 'storage-failed' as const });
  }
}
