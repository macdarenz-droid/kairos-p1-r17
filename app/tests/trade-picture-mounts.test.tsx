import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { listJournalHistory } from '../src/application/journal';
import { projectTradePicture } from '../src/application/trade-visualizer';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradePicture } from '../src/features/journal/TradePicture';
import { TradePictureCard } from '../src/features/journal/TradePictureCard';
import { createLimitedQueue, TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';
import { saveTradePictureImage, serializeTradePictureSvg, tradePictureFileName, type TradePictureSavePorts } from '../src/features/journal/tradePictureImage';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-t027d-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T10:00:00.000Z';
async function seedClosedTrade(db: KairosDatabase) {
  const saved = await saveManualTrade(db, {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: opened, closedAt: closed, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: '60000', plannedStopPrice: '59000', plannedTargetPrice: '62000', plannedQuantity: '0.1' },
    executions: [{ type: 'entry', price: '60000', quantity: '0.1', executedAt: opened }, { type: 'exit', price: '61500', quantity: '0.1', executedAt: closed }],
  });
  if (!saved.ok) throw new Error('fixture');
}
const offline: TradePictureCandleLoader = async () => null;

describe('T-027d trade picture on the cards', () => {
  it('Journal shows a picture for a closed trade; without candles it says they need a connection, and it opens full size', async () => {
    const db = await database();
    await seedClosedTrade(db);
    const loader = vi.fn(offline);
    render(<TradePictureCandleLoaderContext.Provider value={loader}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
    const open = await screen.findByRole('button', { name: 'Open the BTCUSDT trade picture' });
    await waitFor(() => expect(within(open).getByText('Candles need a connection.')).toBeInTheDocument());
    expect(loader).toHaveBeenCalledTimes(1);
    expect(within(open).getByText('Risk')).toBeInTheDocument();
    expect(screen.queryByText('Visual guide · Not to scale')).toBeNull();

    fireEvent.click(open);
    const dialog = screen.getByRole('dialog', { name: 'BTCUSDT trade' });
    expect(within(dialog).getByText('Result after fees')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Share or download image' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the Analysis variant shows the picture at once under "Your trade"', async () => {
    const db = await database();
    await seedClosedTrade(db);
    const [entry] = await listJournalHistory(db);
    render(<TradePictureCandleLoaderContext.Provider value={offline}><TradePicture entry={entry} variant="full" /></TradePictureCandleLoaderContext.Provider>);
    expect(screen.getByRole('heading', { name: 'Your trade' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Candles need a connection.')).toBeInTheDocument());
  });

  it('loads at most three pictures at a time', async () => {
    const queue = createLimitedQueue(3);
    let running = 0, peak = 0;
    const releases: Array<() => void> = [];
    const tasks = Array.from({ length: 7 }, () => queue(() => new Promise<void>(resolve => {
      running += 1; peak = Math.max(peak, running);
      releases.push(() => { running -= 1; resolve(); });
    })));
    await Promise.resolve();
    expect(running).toBe(3);
    while (releases.length > 0) { releases.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)); }
    await Promise.all(tasks);
    expect(peak).toBe(3);
  });
});

describe('T-027d save image', () => {
  async function model() {
    const db = await database();
    await seedClosedTrade(db);
    const [entry] = await listJournalHistory(db);
    return projectTradePicture({ trade: entry.trade, plans: entry.plans, executions: entry.executions, fees: entry.fees, candles: null, now: closed });
  }

  it('the serializer returns standalone SVG text that contains the risk box', async () => {
    const { container } = render(<TradePictureCard model={await model()} />);
    const svg = container.querySelector('svg')!;
    const text = serializeTradePictureSvg(svg, () => ({ getPropertyValue: (name: string) => (name === 'fill' ? 'rgb(255, 0, 0)' : '') }));
    expect(text.startsWith('<svg')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toContain('data-box="risk"');
    expect(text).toContain('Risk');
    expect(text).toContain('fill:rgb(255, 0, 0)');
  });

  it('the serialized picture keeps the candle clip (T-039b)', async () => {
    const { container } = render(<TradePictureCard model={await model()} />);
    const text = serializeTradePictureSvg(container.querySelector('svg')!, () => ({ getPropertyValue: () => '' }));
    expect(text).toContain('<clipPath');
    expect(text).toContain('clip-path="url(#');
  });

  function ports(canShare: boolean) {
    const rasterize = vi.fn(async (_svg: string, _width: number, _height: number, _scale: number) => new Blob(['png'], { type: 'image/png' }));
    const share = vi.fn(async (_data: { files: File[]; title: string }) => undefined);
    const download = vi.fn((_blob: Blob, _fileName: string) => undefined);
    const value: TradePictureSavePorts = { rasterize, canShare: () => canShare, share, download };
    return Object.assign(value, { rasterize, share, download });
  }

  it('shares when the device can share files, else downloads, with the kairos-<symbol>-<date>.png name', async () => {
    const fileName = tradePictureFileName('btc/usdt', opened);
    expect(fileName).toBe('kairos-BTCUSDT-2026-09-20.png');
    const sharing = ports(true);
    await expect(saveTradePictureImage('<svg/>', fileName, sharing)).resolves.toBe('shared');
    expect(sharing.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.objectContaining({ name: fileName, type: 'image/png' })] }));
    expect(sharing.download).not.toHaveBeenCalled();
    const downloading = ports(false);
    await expect(saveTradePictureImage('<svg/>', fileName, downloading)).resolves.toBe('downloaded');
    expect(downloading.download).toHaveBeenCalledWith(expect.any(Blob), fileName);
    expect(downloading.rasterize).toHaveBeenCalledWith('<svg/>', 360, 220, 2);
  });

  it('the button in the full picture hands the serialized picture to the save ports', async () => {
    const db = await database();
    await seedClosedTrade(db);
    const [entry] = await listJournalHistory(db);
    const save = ports(false);
    render(<TradePictureCandleLoaderContext.Provider value={offline}><TradePicture entry={entry} variant="full" savePorts={save} /></TradePictureCandleLoaderContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Share or download image' }));
    await waitFor(() => expect(save.download).toHaveBeenCalledWith(expect.any(Blob), 'kairos-BTCUSDT-2026-09-20.png'));
    expect(save.rasterize.mock.calls[0][0]).toContain('data-box="risk"');
  });
});
