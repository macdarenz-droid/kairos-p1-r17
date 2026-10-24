import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };
import { buildInfo } from '../src/shared/config/buildInfo';
import { appRoutes } from '../src/app/routes';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

describe('app version', () => {
  it('comes from package.json', () => {
    expect(buildInfo.appVersion).toBe(packageJson.version);
  });
});

describe('not-found page', () => {
  it('tells the user the page does not exist and links back to Home', () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/does-not-exist'] });
    render(<RouterProvider router={router} />);
    expect(screen.getByText("This page doesn't exist.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/');
  });
});
