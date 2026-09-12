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
- Canonical workflow retains all released checks and both artifacts, adds token-reference verification and the new Journal browser regression, and proves exactly this five-file candidate delta from Gate399. Canonical publication is pending at report freeze: local success is not GOLDEN. Full exact-run stages and both artifacts remain required before promotion.

## Manual process checkpoint

Run token `manual-journal-style-1789198718668`; durable shared lease acquired and verified before mutation. Fresh GitHub main and Actions confirmed no competing chain. Clean exact-base package/fresh-extract verification and guarded direct Git Data publication follow. The existing hourly V16 worker and read-only supervisor retain their identities/schedules. After publication, checkpoint the exact run, verify worker/supervisor recurrence, release the lease, and monitor this repair only. Present the visible Journal repair for review after FULL canonical PASS; await explicit continuation before another slice.
