# Journal theme token repair — 12 September 2026

## Problem and evidence

The user's screen recording `44179.mp4` shows the released Journal currency field, but history side/status labels touch, history and summary cards lose spacing/framing, and supplementary trade-map SVG labels are black on the dark background. Gate399's application stylesheet references nineteen retired CSS variables. The current design-system owners define only their `--kairos-*` counterparts. Invalid declarations therefore fall back to no padding/gap/border and the SVG default black fill.

The recording's two Closed trades have zero executions and fees. Their unavailable results are truthful: planned entry/stop/target values are not actual executions. Fees and Trade plan disclosure controls work in the browser reproduction. No data repair or result inference is justified.

## Authority and bounded change

Base: Gate399/run34680234948/job103517451325, main `2d7d5276765ae7e30fa24849cfb2e80ebfcb8827`. All28steps succeeded and both exact-run nonexpired artifacts were verified. Base archive `KAIROS_JOURNAL_PNL_CURRENCY_UI_CANDIDATE_2026-09-12.zip`,3399296bytes,SHA256`91fa89853107f19ab4a5a17abb4651e6229ea39458e9ca2b89f8a415b5927121`,Git blob`c3adc04b58f7a7ab636bf12eacb4c0b692463ad0`.

This is a routine presentation repair within the approved Journal integration after user UI review. The only production file changed is `src/app/journalRoute.css`: reference existing registered spacing, typography, radius and semantic theme tokens. Retired `radius-card` maps to the existing large card radius. Error/profit/loss colours use the existing state/trade owners. No global aliases, new palette, layout system, calculation, currency rule, storage, migration, provider, Live Bubble or navigation changes. No owner boundary changes; the architecture map remains accurate. P21 stays open; no next feature slice is authorized.

## Verification

- A browser test creates two Closed trades through the real Journal save UI, reproducing BTCUSDT planned12/10/15 and ETHUSDT without a plan. No injected trade facts. The test browser's explicit calendar timezone is configured through the released preference command.
- On unchanged Gate399, the regression fails: nineteen unresolved variables, zero card padding/radius/border, zero side/status gap, black SVG fill, missing lane stroke, and no summary framing. Baseline screenshots and measurements are retained in the manual evidence checkpoint.
- After repair, all variables resolve. Card padding16px, radius16px, border1px, card gap12px, side/status gap8px, summary padding12px, and SVG label contrast above4.5:1 are measured in the real browser. Theme geometry stays stable with no horizontal overflow at320/390px across kairos-depth/cosmic/ocean. Saved facts and both unavailable results remain unchanged. Fees disclosure works. History and summary screenshots plus JSON measurements are canonical evidence outputs.
- Dedicated token-owner verifier and P2 design-system contract pass. Production TypeScript compilation/build pass. Full unit regression:294files,1174tests pass. The existing real currency-only update/partial exit/final close/fee-result browser regression also passes after the stylesheet repair.
- Canonical workflow retains all released checks and both artifacts, adds token-reference verification and the new Journal browser regression, and proves the exact candidate delta from Gate399. Local success is not GOLDEN. Full exact-run stages and both artifacts remain required before promotion.

## Manual process checkpoint

Run token `manual-journal-style-1789198718668`; durable shared lease acquired and verified before mutation. Fresh GitHub main and Actions confirmed no competing chain. Clean exact-base package/fresh-extract verification and guarded direct Git Data publication follow. The existing hourly V16 worker and read-only supervisor retain their identities/schedules. After publication, checkpoint the exact run, verify worker/supervisor recurrence, release the lease, and monitor this repair only. Present the visible Journal repair for review after FULL canonical PASS; await explicit continuation before another slice.

## Gate400 failure and R1 verification-contract repair

Gate400/run34681679592/job103521331850/head`2f06839c538f73d5d0521507c77369b0459c20cc` failed step22 after build, all browser checks and full unit regression passed. Exact log: `verify-p13-14-streak-presentation.mjs` requires the undefined `--color-profit` spelling. The source audit found four historical verifiers demanding retired token names: P13.14 streak, P13.16 performance summary, P14.6 marker semantics and P14.7 execution time. This is a verification-contract defect: the production tokens exist in the current design-system owner and actual rendered colours/spacing passed the canonical browser regression. Reintroducing undefined aliases or adding misleading source comments would preserve the bug rather than the semantic requirement.

R1 is reconstituted from exact FULL GOLDEN Gate399 plus the approved five-file delta, then updates those four verification contracts. Production code is byte-identical to Gate400. The verifiers continue to require semantic colours and all previous component, projection, accessibility, shape/pattern, test-evidence and forbidden-owner checks. They now require the registered `--kairos-*` names; streak outcome and execution-time checks also bind the expected token to the actual selector, and the marker check requires exact text/surface/border roles instead of a broad old prefix. No verifier or canonical stage is removed, bypassed or disabled. The gate runs these four checks early as well as in unchanged full/current/historical loops.

R1 token `manual-journal-token-contract-1789200039717`; exact failed logs retained, shared lease reacquired/verified, no competing run. Gate400 failed package/evidence is retained; Gate399 remains GOLDEN until R1 full canonical PASS. R1 expected delta from Gate399 is nine files: the five approved presentation/evidence files plus the four compatibility verifiers. This does not authorize a following feature slice.

R1 local validation: all319registered verifiers executed;318passed. Only `verify:doctor` reports workspace DNS `EAI_AGAIN` for registry.npmjs.org; the exact same unchanged environment doctor passed with READY/DNS PASS in Gate400. It remains mandatory in the new canonical gate. All four final compatibility verifiers were separately proven to reject the original Gate399 broken styling and accept R1. Summary checks bind semantic roles to summary/grid declarations; marker checks inspect the trade-map CSS section. Their affected four test files/nine tests pass; the dedicated all-token registration verifier and P2 design-system check also pass. Production CSS is byte-identical to Gate400's canonically tested UI. No extra production changes are hidden in this retry.
