import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsRoute } from '../src/app/SettingsRoute';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { applyTheme, resolveTheme, ThemeProvider, themePreferenceStorageKey } from '../src/design-system/themes';

/** A stand-in for the phone's light or dark setting: `matches` can be flipped and `change` listeners are called. */
function stubPhone(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { listeners.delete(listener); },
  };
  window.matchMedia = ((media: string) => (media === query.media ? query : { ...query, matches: false })) as unknown as typeof window.matchMedia;
  return {
    setDark(next: boolean) {
      query.matches = next;
      for (const listener of [...listeners]) listener({ matches: next } as MediaQueryListEvent);
    },
  };
}

const originalMatchMedia = window.matchMedia;
const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-match-phone-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
const tableCounts = (db: KairosDatabase) => Promise.all(db.tables.map(table => table.count()));

beforeEach(() => {
  for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
});

afterEach(async () => {
  cleanup();
  localStorage.clear();
  window.matchMedia = originalMatchMedia;
  delete document.documentElement.dataset.kairosTheme;
  for (const name of names.splice(0)) await Dexie.delete(name);
});

describe('T-049b Match my phone', () => {
  it('picks Kairos Depth for a dark phone, Paper for a light one, and a chosen theme stays itself', () => {
    expect(resolveTheme('system', true)).toBe('kairos-depth');
    expect(resolveTheme('system', false)).toBe('paper');
    expect(resolveTheme('ocean', false)).toBe('ocean');
  });

  it('follows the phone switching from light to dark while the app is open', async () => {
    const phone = stubPhone(false);
    localStorage.setItem(themePreferenceStorageKey, 'system');
    render(<ThemeProvider><p>Journal</p></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset.kairosTheme).toBe('paper'));
    act(() => phone.setDark(true));
    await waitFor(() => expect(document.documentElement.dataset.kairosTheme).toBe('kairos-depth'));
  });

  it('offers "Match my phone" in Settings, stores it, and keeps it checked after a remount without touching the journal', async () => {
    stubPhone(true);
    const db = await database();
    const before = await tableCounts(db);
    const first = render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('radio', { name: 'Match my phone' }));
    await waitFor(() => expect(localStorage.getItem(themePreferenceStorageKey)).toBe('system'));
    expect(screen.getByRole('radio', { name: 'Match my phone' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Kairos Depth' })).not.toBeChecked();
    first.unmount();
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    expect(screen.getByRole('radio', { name: 'Match my phone' })).toBeChecked();
    expect(await tableCounts(db)).toEqual(before);
  });

  it('puts the theme page colour in the status bar, creating the tag once', () => {
    expect(document.head.querySelector('meta[name="theme-color"]')).toBeNull();
    applyTheme(document.documentElement, 'paper');
    applyTheme(document.documentElement, 'paper');
    const tags = document.head.querySelectorAll('meta[name="theme-color"]');
    expect(tags).toHaveLength(1);
    expect(tags[0]!.getAttribute('content')).toBe('#fafafa');
    applyTheme(document.documentElement, 'kairos-depth');
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#0b0d14');
  });
});
