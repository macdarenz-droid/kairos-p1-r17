# Journal currency input and missing-fill guidance repair — 12 September 2026

## User authority and evidence

User supplied video44182.mp4 during Gate402 review. It shows the released View trade/Analysis screen working, followed by a Closed XRPUSD trade saved with currency text “50 USD” and0executions. The P&L correctly stays unavailable; the form did not reject the amount-like currency or explain the result prerequisite before saving. The user asked whether to repair now or move on. The concrete proposal was to clarify price currency, reject amount entries, explain missing actual fills, preserve records/calculations, then test/gate and return for UI review. User explicitly approved: “Okay continue”. This repair is the only authorized work; no next feature/phase closure.

## Authoritative base

FULL canonical Gate402/run34684862514/job103529980136/head a78d048d6612867a2b8eb33bf0ddb040962f7416; all29actual stages and both exact-run nonexpired artifacts freshly verified: KAIROS_CURRENT_CANDIDATE10294728829, KAIROS_GATE_EVIDENCE10294808722. Base ZIP KAIROS_SAVED_TRADE_REVIEW_UI_CANDIDATE_2026-09-12.zip;3426535bytes;SHA256f0aedc23ef00e025be70d0ac3e16096ce32c3e88684f301768167c72815b1c1d;Git blob7d98466e26b4140c5b75c733da11cc731116c720. Current main b4dbe608fc1da45da521bf3a437d1ce794ea9f00 is the documentation-only completion child; its canonical architecture and approval entries are carried into this candidate. No active chain at acquisition.

## Scope and ownership

- Journal Price currency / Currency code copy explicitly requests a unit, not a profit amount. Invalid submissions keep the form and show an accessible focused error plus field-specific aria-invalid/description. Open update distinguishes an invalid new code from immutable recorded currency.
- P10 priceCurrencyInput owns syntax for newly supplied manual currency: blank remains unknown, trim/uppercase remains existing normalization, a nonblank code contains only ASCII letters/digits and at least one letter. Examples USD/USDT/AUD/1INCH/MYTOKEN2 remain accepted; “50 USD”, “50”, “$50”, separated/multiple codes and punctuation are rejected. This is not a currency registry, ISO-only rule or currency validity certification. It does not parse amounts or infer a code from a symbol. A compact digit-bearing token is not guessed to be an amount.
- Existing prepareManualTrade calls the syntax guard before allocating identity or writing. Open updates send only newly added currency through that preparation. Existing currency remains immutable and is preserved through the current full-snapshot guarded atomic write, including old amount-like text. No domain/backup migration, cleanup, automatic replacement or historical currency reinterpretation.
- JournalClosedTradeGuidance shows a presence-based explanation for Closed trades missing entry/exit rows, considering saved plus new rows in updates. It allows incomplete facts to be saved with truthful unavailable results. Presence of both row types never certifies a complete financial result. Existing P11 calculation and execution-row validation remain authoritative; there is no quantity arithmetic or new result owner.
- Existing Journal currency tests and two browser scripts change only selectors for the intentional accessible label rename from P&L currency to Currency code. Their assertions/flows remain intact. No verifier is removed or weakened. No CSS/theme, dependency/lockfile, schema/backup, calculator, provider, Live Bubble, chart or phase change.

## Validation and limits

Focused new/released currency and Open-update tests pass:3files39tests, including14new cases. New tests verify invalid save before ID allocation/no writes, normalization and digit-bearing codes, unknown currency, currency-only/closing update rejection, correction on same identity, legacy currency backup/restore and append preservation, focused accessible errors, unchanged zero-fill result, and saved/new-row guidance.

The first test run exposed a test-fixture timestamp without the backup-required millisecond ISO format and an overly broad test label selector. Fixtures now match production UTC serialization; the note's distinct P&L guidance name avoids ambiguity with the Closed input. No backup or date validation was changed.

Actual Chromium browser regression passes using real Journal save/update UI and production route tree: “50 USD”/“50”/“$50” cause0writes, corrected USD saves no-fill details with unavailable result, review opens the same identity, invalid currency on an existing open trade leaves its facts intact, then a corrected USDT plus real exit produces the existing40USDT result and survives reload. Earlier no-fill trade stays unchanged. The first browser run's exact-label select lookup was corrected to the established combobox-role selector; no UI behavior was bypassed.

Screenshots/measurements inspected at320/390px across kairos-depth/cosmic/ocean: no overflow,44px input targets, visible guidance and stable geometry. Existing released currency browser and saved-trade review browser also pass after label updates. Evidence is emitted under `.currency-guidance-evidence/` and uploaded by the canonical gate.

Pinned clean install, TypeScript, production build and full296files1197tests pass through both verify:gate and verify:p1. All319registered verifiers executed:316initially passed; unchanged doctor was locally DNS-limited (EAI_AGAIN); two historical source checks falsely classified the literal validation field address 'grossPnlCurrency' as calculation logic. P10 Journal-route and P13.11R1 daily-results boundary verifiers now exempt only that exact string-literal field address, retain all other prior checks/vocabulary, and explicitly reject calculator imports/calls and numeric conversion. Both accept GOLDEN/repaired source and reject injected calculator code, numeric conversion and P&L variables in execution-based negative contract probes. After those two focused reruns,318of319pass; the unchanged doctor remains mandatory in canonical GitHub, where FULL402 passed it. No gate weakening, skipping or replacing an application owner with test-only behavior.

Local tests do not establish GOLDEN; this candidate remains pending until all required canonical stages and both exact-run artifacts are verified. The frozen archive carries pre-gate evidence; later root/automation checkpoints record canonical completion without repackaging verified bytes.

## Publication and continuation

Candidate KAIROS_JOURNAL_CURRENCY_GUIDANCE_REPAIR_CANDIDATE_2026-09-12.zip, clean kairos_p76/ root, exact delta against402 enforced by the gate. Preserve all existing canonical stages, historical/current verifiers, browser scripts and both artifact uploads; add dedicated repair tests/verifier/browser evidence. Preserve pinned Node22.16.0/npm10.9.2/Lightweight Charts5.2.1/Playwright1.62.1. Direct Git Data guarded publication uses frozen ZIP hash/blob, current parent/tree, fresh main/Actions after each mutation, the shared lease and no force push. Existing hourly worker/supervisor stay enabled with schedules unchanged.

UI VISIBLE: price-currency label/help, rejected amount-like input and missing-fill guidance in Journal create/update forms. Existing stored records are preserved, so a previously saved “50 USD” value is not silently corrected. P21 remains open. Give build/review instructions after FULL PASS and await fresh continuation before another feature.

## Canonical completion — Gate403

FULL canonical PASS verified 12 September 2026: Gate403/run34688331500/job103539144108/head 3f86b952a7bf4cca223326dcafcbf280cae51ebf; all 30 actual stages succeeded. Both exact-run artifacts are present, nonexpired and bound to this head: KAIROS_CURRENT_CANDIDATE 10296801277 and KAIROS_GATE_EVIDENCE 10296776333. Workflow .github/workflows/kairos-gate.yml/job verify-current-candidate remains sole promotion authority. Archive KAIROS_JOURNAL_CURRENCY_GUIDANCE_REPAIR_CANDIDATE_2026-09-12.zip; 3441426 bytes; SHA256 963049022be4e7137dd5d0b33155c766f7ba6692284d24276a00abcc96b97f8f; Git blob 8edaf3afeabb642cb7f23a4494d3a853c493cca5. Latest FULL GOLDEN is now403; immediate verified rollback402. Preserve401 and failed400 evidence. The candidate ZIP and workflow remain frozen; this root documentation update records verified completion without repackaging.

Canonical full unit, current roadmap and historical regression stages all passed, together with production typecheck/build, new and released browser checks, exact archive identity, exact18-file scope, and both uploads. This resolves the local doctor DNS limitation without altering that check. The frozen candidate's earlier pending-gate wording is historical; this root completion entry is current.

Review the new UI in Journal create/update. Example: “50 USD” is rejected as currency; “USD” is accepted. Closed trades missing actual fills explain unavailable P&L before Save. Existing stored records remain unchanged, including legacy amount-like currency. Build from the exact released ZIP:

```bash
rm -rf .pages-build && mkdir -p .pages-build && unzip -q KAIROS_JOURNAL_CURRENCY_GUIDANCE_REPAIR_CANDIDATE_2026-09-12.zip -d .pages-build && cd .pages-build/kairos_p76 && npm ci && npm run build
```

Output directory: `.pages-build/kairos_p76/dist`. No Cloudflare deployment is claimed. P21 remains open. The user's newer manual-only instruction disables all autonomous work; do not resume scheduled tasks or show routine automation status. The bubble drag/bounce inquiry is feasible read-only planning and has not been implemented in this release.
