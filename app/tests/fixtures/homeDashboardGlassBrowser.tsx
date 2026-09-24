import '../../src/shell.css';
import '../../src/design-system/accessibility.css';
import { createRoot } from 'react-dom/client';
import { HomeDashboardGlassBubbleMap } from '../../src/app/HomeDashboardGlassBubbleMap';
import { applyTheme, type ThemeId } from '../../src/design-system/themes/themeEngine';
import '../../src/design-system/tokens.css';
import { glassTestModel } from './homeDashboardGlassModel';

const root = createRoot(document.getElementById('glass-test-root')!);
export function mount(count: number) {
  root.render(<HomeDashboardGlassBubbleMap model={glassTestModel(count)} />);
}
export function theme(id: ThemeId | 'light-proof') {
  applyTheme(document.documentElement, id === 'light-proof' ? 'kairos-depth' : id);
  if (id === 'light-proof') {
    // Test-only light surface stress case; does not add a product theme.
    const tokens = { '--kairos-background-base': '#eef2f7', '--kairos-surface-card': '#e1e7f1', '--kairos-surface-raised': '#ffffff', '--kairos-text-primary': '#18243a', '--kairos-text-secondary': '#4a5970', '--kairos-trade-profit': '#06775a', '--kairos-trade-loss': '#b52950' };
    for (const [k,v] of Object.entries(tokens)) document.documentElement.style.setProperty(k,v);
  }
}

export function refreshRanking() {
  const model = glassTestModel(8);
  if (!model.radiusScaleProjection?.ok) throw Error('fixture');
  const entries = model.radiusScaleProjection.entries;
  Object.assign(entries[0].areaWeightEntry.presentationEntry.metricInput, { movementPercent24h: '4.25' });
  Object.assign(model.radiusScaleProjection, { entries: [...entries].reverse() });
  root.render(<HomeDashboardGlassBubbleMap model={model} />);
}

import { MemoryRouter, Route, Routes } from 'react-router';
import { AppShell } from '../../src/app/AppShell';
import '../../src/design-system/shell/navigationShell.css';
export function mountCompact() {
  const model=glassTestModel(30);
  if(!model.radiusScaleProjection?.ok) throw Error('fixture');
  const symbols=['BTC','ETH','SOL','BNB','XRP','ADA','LINK','SUI','DOGE','AVAX','DOT','NEAR','LTC','UNI','ATOM','AAVE','TRX','FIL','SHIB','PEPE','ARB','OP','TON','JUP','WIF','ENA','INJ','SEI','APT','TAO'];
  model.radiusScaleProjection.entries.forEach((e,i)=>{
    const p=e.areaWeightEntry.presentationEntry;
    const value=i===0?10.5:((i%11)+1)*.22*(i%2?-1:1);
    Object.assign(p.metricInput,{movementPercent24h:String(value),instrument:{venue:'binance-spot',symbol:symbols[i]+'USDT'}});
    Object.assign(p,{movementSemantic:value<0?'negative':'positive'});
  });
  root.render(<MemoryRouter><Routes><Route element={<AppShell/>}><Route path="/" element={<section className="kairos-route" data-kairos-home-dashboard="live-crypto-text-runtime"><header><h1>Home</h1><p>Your Kairos dashboard lives here.</p></header><section><h2>Live Crypto Bubble</h2><HomeDashboardGlassBubbleMap model={model}/></section></section>}/></Route></Routes></MemoryRouter>);
}

import { HomeRoute } from '../../src/app/HomeRoute';
import { kairosDatabase, openKairosDatabase } from '../../src/data/database';
import { createKairosRepositories } from '../../src/data/repositories';
import { createTradeDomainId, parsePositiveDecimalString, type TradeId, type TradeExecutionId } from '../../src/domain/trades';
export async function seedYourTrades() {
  await openKairosDatabase(kairosDatabase);
  const repos=createKairosRepositories(kairosDatabase);
  const dec=(text:string)=>{const p=parsePositiveDecimalString(text);if(!p.ok)throw Error('fixture');return p.value;};
  for(let i=0;i<14;i++) {
    const id=createTradeDomainId<TradeId>(),time='2026-09-12T01:00:00.000Z';
    await repos.trades.put({id,symbol:['BTCUSDT','ETHUSDT','SOLUSDT','AAPL'][i%4],side:'long',marketType:i%4===3?'stock':'crypto',status:i<8?'closed':'draft',source:'manual',openedAt:i<8?time:null,closedAt:i<8?time:null,createdAt:time,updatedAt:time});
    if(i<8)for(const [type,price] of [['entry','100'],['exit',i%2?'90':'120']] as const)await repos.tradeExecutions.put({id:createTradeDomainId<TradeExecutionId>(),tradeId:id,type,price:dec(price),quantity:dec('1'),executedAt:time,createdAt:time});
  }
}
export function mountHome() {
  root.render(<MemoryRouter><Routes><Route element={<AppShell/>}><Route path="/" element={<HomeRoute/>}/></Route></Routes></MemoryRouter>);
}
