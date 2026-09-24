import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsRoute } from '../src/app/SettingsRoute';
import { ThemeProvider } from '../src/design-system/themes';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { readVisualPnlTimeZonePreference } from '../src/application/visual-pnl';

const names = new Set<string>();

async function fixture(label: string) {
  const name = `kairos-p1312r2-${label}-${crypto.randomUUID()}`;
  names.add(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return { db, repositories: createKairosRepositories(db) };
}

afterEach(async () => {
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
  }
  names.clear();
});

const timeZoneAccessibleName =
  /Time zone Use an IANA time zone, for example Australia\/Sydney, America\/New_York, Europe\/London, or UTC\./i;

async function readyTimeZoneInput(): Promise<HTMLInputElement> {
  const input = screen.getByRole('combobox', { name: timeZoneAccessibleName }) as HTMLInputElement;
  await waitFor(() => expect(input).toBeEnabled());
  return input;
}

describe('P13.12R2 explicit Visual P&L timezone settings accessible-name contract', () => {
  it('starts unconfigured after the preference load completes and never inserts a device timezone', async () => {
    const { db } = await fixture('empty');
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);

    const input = await readyTimeZoneInput();
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(input).toHaveValue('');
    db.close();
  });

  it('persists an explicitly entered valid timezone through P13.10R1 after loading completes', async () => {
    const { db, repositories } = await fixture('save');
    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);

    const input = await readyTimeZoneInput();
    fireEvent.change(input, { target: { value: 'Australia/Sydney' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time zone' }));

    expect(await screen.findByText('Daily-results time zone saved.')).toBeInTheDocument();
    await waitFor(async () =>
      expect(await readVisualPnlTimeZonePreference(repositories.metadata)).toBe('Australia/Sydney'),
    );
    db.close();
  });

  it('rejects invalid evidence without replacing the stored preference', async () => {
    const { db, repositories } = await fixture('invalid');
    await repositories.metadata.put({
      key: 'preferences.visual-pnl.time-zone.v1',
      value: 'UTC',
      updatedAt: '2026-09-02T00:00:00.000Z',
    });

    render(<ThemeProvider><SettingsRoute db={db} /></ThemeProvider>);
    const input = await readyTimeZoneInput();
    expect(input).toHaveValue('UTC');

    fireEvent.change(input, { target: { value: 'Not/A_Time_Zone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time zone' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid time zone');
    expect(await readVisualPnlTimeZonePreference(repositories.metadata)).toBe('UTC');
    db.close();
  });
});
