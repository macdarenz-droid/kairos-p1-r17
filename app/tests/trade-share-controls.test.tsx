import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectTradePicture, type TradePictureInput } from '../src/application/trade-visualizer';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeFeeId, type TradeFeeRecord, type TradeId, type TradePlanId, type TradeRecord } from '../src/domain/trades';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import { JournalRoute } from '../src/app/JournalRoute';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { loadTradeReview } from '../src/application/journal/loadTradeReview';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradeShareControls } from '../src/features/journal/TradeShareControls';
import { renderTradePage, tradePageHeading } from './fixtures/tradePage';
import type { TradePictureSavePorts } from '../src/features/journal/tradePictureImage';

function dec(value: string): DecimalString { const parsed = parseDecimalString(value); if (!parsed.ok) throw new Error(value); return parsed.value; }
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z';
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed };
const pictureInput: TradePictureInput = {
  trade, plans: [{ id: 'p1' as TradePlanId, tradeId, plannedEntryPrice: dec('100'), plannedStopPrice: dec('90'), plannedTargetPrice: dec('130'), plannedQuantity: dec('2'), createdAt: opened, updatedAt: opened }],
  executions: [
    { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: dec('100'), quantity: dec('2'), executedAt: opened, createdAt: opened },
    { id: 'x1' as TradeExecutionId, tradeId, type: 'exit', price: dec('120'), quantity: dec('2'), executedAt: closed, createdAt: closed },
  ],
  fees: [{ id: 'f1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USDT', createdAt: closed } as TradeFeeRecord],
  candles: null, now: '2026-09-24T12:00:00.000Z',
};
const model = projectTradePicture(pictureInput);

function ports(options: { canShare?: boolean; broken?: boolean } = {}) {
  const context = { fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), measureText: vi.fn((text: string) => ({ width: text.length * 10 })) };
  const makeCanvas = vi.fn((width: number, height: number) => {
    if (options.broken) throw new Error('canvas-unavailable');
    return { context: context as never, toBlob: async () => new Blob([`png ${width}x${height}`], { type: 'image/png' }) };
  });
  const share = vi.fn(async (_data: { files: File[]; title: string }) => undefined);
  const download = vi.fn((_blob: Blob, _name: string) => undefined);
  const value: TradePictureSavePorts = { makeCanvas, loadSvg: async () => ({}) as CanvasImageSource, loadFonts: async () => undefined, canShare: () => options.canShare ?? false, share, download };
  return Object.assign(value, { makeCanvas, share, download });
}
const svg = () => ({ current: document.createElementNS('http://www.w3.org/2000/svg', 'svg') });
const preview = () => screen.findByRole('img');

let urls = 0;
beforeEach(() => {
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:card-${++urls}`);
  URL.revokeObjectURL = vi.fn();
});
const names: string[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const name of names.splice(0)) await Dexie.delete(name); });

describe('T-052c the share card controls', () => {
  it('makes a tall card by default, and a square one on "Square"', async () => {
    const save = ports();
    render(<TradeShareControls model={model} svg={svg()} ports={save} />);
    expect(screen.getByRole('button', { name: 'Tall' })).toHaveAttribute('aria-pressed', 'true');
    expect(await preview()).toHaveAttribute('data-shape', 'tall');
    expect(save.makeCanvas).toHaveBeenLastCalledWith(1080, 1350);
    fireEvent.click(screen.getByRole('button', { name: 'Square' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('data-shape', 'square'));
    expect(save.makeCanvas).toHaveBeenLastCalledWith(1080, 1080);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card-1');
  });

  it('"Hide money amounts" takes the amount out of the card', async () => {
    render(<TradeShareControls model={model} svg={svg()} strategyName="Breakout" ports={ports()} />);
    expect(await preview()).toHaveAccessibleName('BTCUSDT long, won, +39 USDT, +1.95× what you risked, strategy Breakout');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide money amounts' }));
    await waitFor(() => expect(screen.getByRole('img')).toHaveAccessibleName('BTCUSDT long, won, +1.95× what you risked, strategy Breakout'));
  });

  it('shares the card when the phone can share files, else downloads it, and focus stays on the button', async () => {
    const sharing = ports({ canShare: true });
    render(<TradeShareControls model={model} svg={svg()} ports={sharing} />);
    await preview();
    const button = screen.getByRole('button', { name: 'Share or download image' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(sharing.share).toHaveBeenCalledTimes(1));
    const shared = sharing.share.mock.calls[0]![0].files[0]!;
    expect([shared.name, shared.type, await shared.text()]).toEqual(['kairos-BTCUSDT-2026-09-20.png', 'image/png', 'png 1080x1350']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share or download image' })).toHaveFocus());
    cleanup();
    const downloading = ports();
    render(<TradeShareControls model={model} svg={svg()} ports={downloading} />);
    await preview();
    fireEvent.click(screen.getByRole('button', { name: 'Share or download image' }));
    await waitFor(() => expect(downloading.download).toHaveBeenCalledWith(expect.any(Blob), 'kairos-BTCUSDT-2026-09-20.png'));
    expect(downloading.share).not.toHaveBeenCalled();
  });

  it('says when the image could not be made, and nothing is shared', async () => {
    const broken = ports({ broken: true, canShare: true });
    render(<TradeShareControls model={model} svg={svg()} ports={broken} />);
    expect(await screen.findByText('The preview could not be made.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share or download image' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The image could not be made. Nothing was changed.');
    expect(broken.share).not.toHaveBeenCalled();
    expect(broken.download).not.toHaveBeenCalled();
  });
});

describe('T-052c fix r1', () => {
  /** A canvas that writes what was painted into its PNG, and fonts that load only when told to. */
  function recordingPorts() {
    let release: () => void = () => undefined;
    const fonts = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const makeCanvas = vi.fn(() => {
      const painted: string[] = [];
      const context = { fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', fillRect: () => undefined, drawImage: () => undefined, measureText: (text: string) => ({ width: text.length * 10 }), fillText: (text: string) => { painted.push(text); } };
      return { context: context as never, toBlob: async () => new Blob([painted.join('|')], { type: 'image/png' }) };
    });
    const share = vi.fn(async (_data: { files: File[]; title: string }) => undefined);
    const value: TradePictureSavePorts = { makeCanvas, loadSvg: async () => ({}) as CanvasImageSource, loadFonts: fonts, canShare: () => true, share, download: vi.fn() };
    return Object.assign(value, { share, release: () => release() });
  }
  const lost = projectTradePicture({ ...pictureInput, executions: [pictureInput.executions[0]!, { ...pictureInput.executions[1]!, price: dec('80') }] });

  it('never shows or shares the card of an older picture', async () => {
    const save = recordingPorts();
    const { rerender } = render(<TradeShareControls model={model} svg={svg()} ports={save} />);
    save.release();
    expect(await preview()).toHaveAccessibleName(/won/);
    // The picture changes (the exit was corrected): the old image is not shown under the new words, and is not shared.
    rerender(<TradeShareControls model={lost} svg={svg()} ports={save} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Making the image…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share or download image' }));
    save.release();
    await waitFor(() => expect(save.share).toHaveBeenCalledTimes(1));
    const painted = await save.share.mock.calls[0]![0].files[0]!.text();
    expect(painted).toContain('Long · Lost');
    expect(painted).not.toContain('Won');
  });

  it('keeps the preview\'s frame, in the card\'s shape, while a new card is made, so nothing under it moves (fix r2)', async () => {
    const save = recordingPorts();
    const { container, rerender } = render(<TradeShareControls model={model} svg={svg()} ports={save} />);
    save.release();
    await preview();
    const frame = container.querySelector('.kairos-trade-share__frame')!;
    expect(frame).toHaveAttribute('data-shape', 'tall');
    expect(frame).toContainElement(screen.getByRole('img'));
    rerender(<TradeShareControls model={lost} svg={svg()} ports={save} />);
    expect(container.querySelector('.kairos-trade-share__frame')).toBe(frame);
    expect(frame).toHaveTextContent('Making the image…');
    fireEvent.click(screen.getByRole('button', { name: 'Square' }));
    expect(frame).toHaveAttribute('data-shape', 'square');
  });

  it('closing the phone\'s share sheet is not a failure', async () => {
    const save = ports({ canShare: true });
    save.share.mockRejectedValueOnce(Object.assign(new Error('Share canceled'), { name: 'AbortError' }));
    render(<TradeShareControls model={model} svg={svg()} ports={save} />);
    await preview();
    fireEvent.click(screen.getByRole('button', { name: 'Share or download image' }));
    await waitFor(() => expect(save.share).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share or download image' })).toHaveTextContent('Share or download image'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('T-052c the card names the strategy you chose, in the Journal and in Analysis', () => {
  /** jsdom has no canvas and loads no images: these stand in for the browser's, so the real ports run. */
  function browserStandIns() {
    const context = { fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', fillRect: () => undefined, fillText: () => undefined, drawImage: () => undefined, measureText: (text: string) => ({ width: text.length * 10 }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => { callback(new Blob(['png'], { type: 'image/png' })); });
    vi.stubGlobal('Image', class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onload?.()); } });
  }
  async function seeded(): Promise<{ db: KairosDatabase; id: string }> {
    const name = `kairos-share-strategy-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); await openKairosDatabase(db);
    const strategy = await saveStrategy(db, { id: null, name: 'Breakout', rules: [{ id: 'stop', kind: 'stop-planned' }] });
    if (!strategy.ok) throw new Error('fixture');
    const saved = await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed,
      plan: { plannedEntryPrice: '100', plannedStopPrice: '90', plannedTargetPrice: '130', plannedQuantity: '2' },
      executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: opened }, { type: 'exit', price: '120', quantity: '2', executedAt: closed }] } as Parameters<typeof saveManualTrade>[1]);
    if (!saved.ok) throw new Error('fixture');
    const marked = await saveTradeDiscipline(db, { tradeId: saved.tradeId, scope: 'real', half: 'strategy', strategyId: strategy.strategy.id, answers: [] });
    if (!marked.ok) throw new Error(`fixture ${JSON.stringify(marked)}`);
    return { db, id: saved.tradeId };
  }

  it('in the picture on the trade\'s page (T-060c: the Journal\'s rows have no picture dialog)', async () => {
    browserStandIns();
    const { db, id } = await seeded();
    renderTradePage(db, id);
    const picture = within(await screen.findByRole('region', { name: 'Your trade' }, { timeout: 4000 }));
    expect(await picture.findByRole('img', { name: /, strategy Breakout$/ }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('in Analysis "Your trade"', async () => {
    browserStandIns();
    const { db, id } = await seeded();
    const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute db={db} load={tradeId => loadTradeReview(tradeId, db)} /> }], { initialEntries: [`/analysis?trade=${encodeURIComponent(id)}`] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('img', { name: /, strategy Breakout$/ }, { timeout: 4000 })).toBeInTheDocument();
  });
});
