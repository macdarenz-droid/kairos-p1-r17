import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsRoute } from '../src/app/SettingsRoute';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ThemeProvider, defaultThemeId, readThemePreference, themePreferenceStorageKey, themeRegistry } from '../src/design-system/themes';

function channel(hex: number): number {
  const value = hex / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(color: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) throw new Error(`not a #rrggbb colour: ${color}`);
  const [r, g, b] = match.slice(1).map(part => channel(parseInt(part, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-theme-picker-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
async function tableCounts(db: KairosDatabase): Promise<number[]> {
  return Promise.all(db.tables.map(table => table.count()));
}

afterEach(async () => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.kairosTheme;
  for (const name of names.splice(0)) await Dexie.delete(name);
});

describe('T-009 Kairos Depth in the vision colours', () => {
  const depth = themeRegistry['kairos-depth'].tokens;

  it('is the default and uses Depth Black, Navy Layer, Cyan and Violet', () => {
    expect(defaultThemeId).toBe('kairos-depth');
    expect(depth['--kairos-background-base'].toLowerCase()).toBe('#0b0d14');
    expect(depth['--kairos-surface-raised'].toLowerCase()).toBe('#131a2e');
    expect(depth['--kairos-accent-primary'].toLowerCase()).toBe('#35d6ff');
    expect(depth['--kairos-accent-secondary'].toLowerCase()).toBe('#9b6bff');
  });

  it('keeps primary and secondary text at 4.5:1 or more against the background', () => {
    expect(contrast(depth['--kairos-text-primary'], depth['--kairos-background-base'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(depth['--kairos-text-secondary'], depth['--kairos-background-base'])).toBeGreaterThanOrEqual(4.5);
    // Cards sit on the raised surface; their text must stay readable too.
    expect(contrast(depth['--kairos-text-primary'], depth['--kairos-surface-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(depth['--kairos-text-secondary'], depth['--kairos-surface-card'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('paints the page and fields with the vision colours, with no old accent left', () => {
    expect(depth['--kairos-background-gradient']).toContain('#0b0d14');
    expect(depth['--kairos-background-gradient']).toContain('#131a2e');
    expect(depth['--kairos-field-gradient']).toContain('#0b0d14');
    const all = JSON.stringify(depth).toLowerCase();
    for (const old of ['#070b12', '#59dcff', '#8b7cff', '89,220,255']) expect(all).not.toContain(old);
  });

  it('gives every theme a plain label', () => {
    expect(Object.values(themeRegistry).map(theme => theme.label)).toEqual(['Ink', 'Paper', 'Kairos Depth', 'Cosmic', 'Ocean']);
  });
});

describe('T-009 Settings theme picker', () => {
  it('lists every theme, starts on Kairos Depth, and choosing Ocean applies and stores it without touching the journal', async () => {
    const db = await database();
    const before = await tableCounts(db);
    const first = render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    const group = screen.getByRole('group', { name: 'Theme' });
    expect(group).toBeInTheDocument();
    for (const label of ['Ink', 'Paper', 'Kairos Depth', 'Cosmic', 'Ocean']) expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Kairos Depth' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /device/i })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }));
    await waitFor(() => expect(document.documentElement.dataset.kairosTheme).toBe('ocean'));
    expect(readThemePreference()).toBe('ocean');
    expect(localStorage.getItem(themePreferenceStorageKey)).toBe('ocean');
    expect(await tableCounts(db)).toEqual(before);

    first.unmount();
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked();
  });
});
