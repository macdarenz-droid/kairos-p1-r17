import { vi } from 'vitest';

/**
 * jsdom loads no images and draws no canvas: this makes the glass art load (or fail) and counts what the page made.
 * `vi.restoreAllMocks()` and `vi.unstubAllGlobals()` undo it, except a `URL.createObjectURL` it had to add (harmless:
 * each test file has its own globals).
 */
export function stubGlassImage() {
  // jsdom may lack URL.createObjectURL; a spy needs the property to exist.
  if (typeof URL.createObjectURL !== 'function') Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: () => '' });
  const state = { images: 0, loads: true, createObjectURL: vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:kairos-glass') };
  class FakeImage {
    naturalWidth = 4;
    naturalHeight = 4;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { state.images += 1; }
    set src(_value: string) { queueMicrotask(() => { if (state.loads) this.onload?.(); else this.onerror?.(); }); }
  }
  const context = {
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: vi.fn(),
  };
  vi.stubGlobal('Image', FakeImage);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback: BlobCallback) {
    // As in a browser, the blob arrives later, not inside the call.
    queueMicrotask(() => callback(new Blob(['glass'], { type: 'image/png' })));
  });
  return state;
}
