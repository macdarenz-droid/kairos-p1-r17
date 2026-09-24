/**
 * Pure build logic for the service worker. Compiled by both the app and the
 * Vite config, so it uses only ES2023: no DOM, no Node, no crypto.
 */
export const KAIROS_SERVICE_WORKER_CONFIG_TOKEN = '__KAIROS_SERVICE_WORKER_CONFIG__';

export interface KairosServiceWorkerBuildFile {
  readonly fileName: string;
  readonly content: string | Uint8Array;
}

export interface KairosServiceWorkerBuild {
  readonly source: string;
  readonly cacheVersion: string;
  readonly precacheUrls: readonly string[];
}

const PUBLIC_REFERENCE = /(?:src|href)="\/([^"/][^"]*)"/g;

/** Public (non-hashed) files the built index.html references, plus the manifest; no leading slash, sorted. */
export function listKairosPublicPrecacheFiles(indexHtml: string): string[] {
  const names = new Set<string>(['manifest.webmanifest']);
  for (const match of indexHtml.matchAll(PUBLIC_REFERENCE)) {
    if (!match[1].startsWith('assets/')) names.add(match[1]);
  }
  return [...names].sort();
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(hash: number, value: number): number {
  return Math.imul(hash ^ (value & 0xff), FNV_PRIME) >>> 0;
}

function hashFiles(files: readonly KairosServiceWorkerBuildFile[]): string {
  let hash = FNV_OFFSET;
  const feedText = (text: string) => { for (let index = 0; index < text.length; index += 1) hash = fnv1a(hash, text.charCodeAt(index)); };
  for (const file of files) {
    feedText(file.fileName);
    hash = fnv1a(hash, 0);
    if (typeof file.content === 'string') feedText(file.content);
    else for (const byte of file.content) hash = fnv1a(hash, byte);
    hash = fnv1a(hash, 0);
  }
  return hash.toString(16).padStart(8, '0');
}

const byName = (left: KairosServiceWorkerBuildFile, right: KairosServiceWorkerBuildFile) =>
  left.fileName < right.fileName ? -1 : left.fileName > right.fileName ? 1 : 0;

/** Renders the worker for one build: its own precache list and a cache name from the build id and file contents. */
export function buildKairosServiceWorker(
  template: string,
  input: { readonly buildId: string; readonly files: readonly KairosServiceWorkerBuildFile[] },
): KairosServiceWorkerBuild {
  if (template.split(KAIROS_SERVICE_WORKER_CONFIG_TOKEN).length !== 2) {
    throw new Error('The service worker template must contain __KAIROS_SERVICE_WORKER_CONFIG__ exactly once.');
  }
  const kept = input.files.filter((file) => !file.fileName.endsWith('.map') && file.fileName !== 'sw.js').sort(byName);
  const precacheUrls = [...new Set(kept.map((file) => file.fileName === 'index.html' ? '/' : `/${file.fileName}`))].sort();
  const cacheVersion = `${input.buildId}-${hashFiles(kept)}`;
  const source = template.replace(KAIROS_SERVICE_WORKER_CONFIG_TOKEN, () => JSON.stringify({ cacheVersion, precacheUrls }));
  return { source, cacheVersion, precacheUrls };
}
