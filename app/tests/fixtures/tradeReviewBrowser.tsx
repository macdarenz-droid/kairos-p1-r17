import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { appRoutes } from '../../src/app/routes';
import { kairosDatabase, openKairosDatabase } from '../../src/data/database';
import { theme } from './journalExecutionBrowser';
export { theme, readSavedFacts } from './journalExecutionBrowser';

export async function mount() {
  await openKairosDatabase(kairosDatabase); theme('kairos-depth');
  createRoot(document.getElementById('execution-test-root')!).render(<RouterProvider router={createBrowserRouter(appRoutes)} />);
}
