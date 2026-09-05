import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const required=['verify:p18:24-chart-drawing-interaction-port','verify:p18:45-chart-drawing-deletion-coordination','verify:p18:51r3-chart-trend-line-edit-presentation-coordination-runtime-projection-expectation-repair','verify:p18:52-chart-drawing-deletion-presentation-coordination','verify:p18:53-chart-drawing-deletion-initiation-coordination','verify:p18:58-lightweight-charts-v5-trend-line-edit-endpoint-click-lifecycle-composition','verify:p18:59-lightweight-charts-v5-trend-line-edit-click-execution-lifecycle-composition'];
for(const name of required){if(typeof pkg.scripts?.[name]!=='string')throw new Error(`P18.60 closure missing historical verifier: ${name}`)}
const map=fs.readFileSync(path.join(root,'docs/KAIROS_ARCHITECTURE_MAP.md'),'utf8');
for(const phrase of ['P18 Drawing Tools — system closure (P18.60)','P18 does not own Risk/Reward business truth','P19 may consume the generic P18 drawing machinery']){if(!map.includes(phrase))throw new Error(`P18.60 architecture closure evidence missing: ${phrase}`)}
console.log('P18.60 Drawing Tools system closure verifier PASS');
