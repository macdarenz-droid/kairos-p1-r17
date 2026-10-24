import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {useEffect} from 'react';
const {mount,unmount}=vi.hoisted(()=>({mount:vi.fn(),unmount:vi.fn()}));
vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime',()=>({HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime:()=>{useEffect(()=>{mount();return unmount;},[]);return <div>market runtime</div>;}}));
vi.mock('../src/app/HomeDashboardYourTrades',()=>({HomeDashboardYourTrades:()=> <div>saved-trade view</div>}));
import {HomeRoute} from '../src/app/HomeRoute';
describe('Home view selection',()=>{it('defaults to live market and stops its runtime when Your Trades is selected',()=>{
 render(<HomeRoute/>);expect(mount).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:'Your Trades'}));expect(unmount).toHaveBeenCalledTimes(1);expect(screen.getByText('saved-trade view')).toBeTruthy();expect(screen.queryByText('market runtime')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Live Market'}));expect(mount).toHaveBeenCalledTimes(2);
});});
