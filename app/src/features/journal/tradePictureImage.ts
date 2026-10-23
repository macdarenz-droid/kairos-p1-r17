import { TRADE_PICTURE_HEIGHT, TRADE_PICTURE_WIDTH } from './TradePictureCard';
import { browserTradeShareImagePorts, type TradeShareImagePorts } from './tradeShareCardImage';

/** Style properties copied onto each element so the saved image looks like the screen without the page's CSS. */
const INLINED_STYLES = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight'] as const;

export type ReadStyle = (element: Element) => Pick<CSSStyleDeclaration, 'getPropertyValue'>;

/**
 * The trade picture as standalone SVG text: every drawn element carries its
 * resolved colours inline, so the image needs no stylesheet or theme.
 */
export function serializeTradePictureSvg(svg: SVGSVGElement, readStyle: ReadStyle = element => getComputedStyle(element)): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((original, index) => {
    const style = readStyle(original);
    const inline = INLINED_STYLES.map(name => [name, style.getPropertyValue(name)] as const).filter(([, value]) => value !== '');
    if (inline.length > 0) copies[index].setAttribute('style', inline.map(([name, value]) => `${name}:${value}`).join(';'));
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(TRADE_PICTURE_WIDTH));
  clone.setAttribute('height', String(TRADE_PICTURE_HEIGHT));
  clone.removeAttribute('aria-hidden');
  return new XMLSerializer().serializeToString(clone);
}

/** `kairos-<symbol>-<yyyy-mm-dd>.png`, from the trade date (else today). */
export function tradePictureFileName(symbol: string, dateIso: string | null, now: Date = new Date()): string {
  const date = dateIso !== null && Number.isFinite(Date.parse(dateIso)) ? new Date(dateIso) : now;
  const safe = symbol.replace(/[^A-Za-z0-9]+/g, '').toUpperCase() || 'TRADE';
  return `kairos-${safe}-${date.toISOString().slice(0, 10)}.png`;
}

export interface TradePictureSavePorts extends TradeShareImagePorts {
  canShare(data: { files: File[] }): boolean;
  share(data: { files: File[]; title: string }): Promise<void>;
  download(blob: Blob, fileName: string): void;
}

export type TradePictureSaveResult = 'shared' | 'downloaded' | 'failed';

/** Hands the share card's PNG to the share sheet when the device offers one, else downloads it (D214). */
export async function saveTradePictureImage(image: Blob, fileName: string, ports: TradePictureSavePorts = browserTradePictureSavePorts()): Promise<TradePictureSaveResult> {
  try {
    const file = new File([image], fileName, { type: 'image/png' });
    if (ports.canShare({ files: [file] })) {
      await ports.share({ files: [file], title: fileName });
      return 'shared';
    }
    ports.download(image, fileName);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export function browserTradePictureSavePorts(): TradePictureSavePorts {
  return {
    ...browserTradeShareImagePorts(),
    canShare: data => typeof navigator.canShare === 'function' && navigator.canShare(data),
    share: data => navigator.share(data),
    download: (blob, fileName) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
}
