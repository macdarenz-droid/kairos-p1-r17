import '../../src/shell.css';
import '../../src/design-system/accessibility.css';
import '../../src/design-system/tokens.css';
import '../../src/design-system/shell/navigationShell.css';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from '../../src/app/AppShell';
import { JournalRoute } from '../../src/app/JournalRoute';
import { HomeRoute } from '../../src/app/HomeRoute';
import { applyTheme, type ThemeId } from '../../src/design-system/themes/themeEngine';
import { kairosDatabase, openKairosDatabase } from '../../src/data/database';

export function theme(id: ThemeId) { applyTheme(document.documentElement, id); }
export async function mount() {
  await openKairosDatabase(kairosDatabase); theme('kairos-depth');
  createRoot(document.getElementById('execution-test-root')!).render(<MemoryRouter initialEntries={['/journal']}><Routes><Route element={<AppShell/>}><Route path="/" element={<HomeRoute/>}/><Route path="/journal" element={<JournalRoute/>}/></Route></Routes></MemoryRouter>);
}
export async function readSavedFacts() {
  return { trades: await kairosDatabase.trades.toArray(), executions: await kairosDatabase.tradeExecutions.toArray(), fees: await kairosDatabase.tradeFees.toArray() };
}
