# Your Trades profit sizing — 12 September 2026

## Authority and base

The user confirmed the deployed hold/drag interaction works, approved prior changes through the latest gates, and requested larger bubbles for larger saved profits and small bubbles for losses. They then authorized continuation in roadmap/dependency order after first seeing the live Journal and Analysis UI. This is one contained P21 presentation amendment. Manual-only control remains in force.

Base: FULL canonical Gate404, run34692607390/job103550421370, head d0343cffd708afbaf6d3a0dc8ae92828e639d128. All31actual stages succeeded. Both exact-run artifacts are nonexpired and match that head: KAIROS_CURRENT_CANDIDATE10298121148 and KAIROS_GATE_EVIDENCE10297401877. Archive KAIROS_DASHBOARD_BUBBLE_DRAG_UI_CANDIDATE_2026-09-12.zip,3466532bytes,SHA2567337eb53bcb9d1098e20777f3c4ebfd393f8917ce6167c9270d912eba848469b,Git blobb881c996cca3b36ca84b8ccaf56fbd861fc642c9. Work started with a verified fresh extraction of those exact bytes.

## Visible behavior and ownership

Your Trades shows one bubble per saved trade. Valid closed positive P&L grows relative to the largest loaded profit in the exact same recorded currency. The dimensionless radius weight is0.5+0.5*sqrt(amount/maximum). Every loss uses0.3, even a large loss; break-even and unavailable results use0.4. A positive result without a recorded currency uses a fixed0.5 and is not compared with other money. These are relative presentation weights, not proportional areas or an absolute dollar scale. The existing packer applies phone bounds and minimum touch size; very small differences can meet the same minimum. Comparison covers all latest100loaded trades before12per-page presentation. Physical size can change with page density.

P11/P13 and loadHomeYourTrades remain the result/outcome source. New src/app/homeDashboardYourTradesSizing.ts validates the projected amount/outcome, delegates decimal comparison and division to the existing P11 decimalKernel, and converts only the bounded dimensionless ratio to Number. It neither computes P&L nor imports another decimal implementation. Exact currencies remain separate: USD is not assumed to equal USDT; unknown currency is not inferred from a symbol. Invalid, open, unavailable or inconsistent evidence stays unscaled. Query, storage, schema, financial calculations, Live Market sizing/colors and shared drag/motion owners are unchanged. Caption text explains the new rule. Selection still shows the exact saved result.

## Validation

Six new unit/DOM tests cover increasing profits, uniformly small losses, zero/unavailable distinction, missing/separate currencies,400-digit/400-decimal amounts, invalid evidence, loaded-history normalization, identity, refresh, selection and input immutability. The released Your Trades verifier's Equal sizes expectation is explicitly amended to the approved behavior; other ownership assertions remain. The new verifier enforces delegation and forbids direct money-number conversion, storage, provider requests and a second decimal implementation. The existing P1 static gate initially caught a direct UI decimal import; implementation was corrected to delegate to the existing kernel. That gate was not changed.

Pinned Node22.16.0/npm10.9.2 verify:p1 passed clean install, TypeScript, all300test files/1227tests and production build. Dedicated real Chromium regression passed production Your Trades with actual IndexedDB records and released P11/P13 calculations:20/200/2000USDT profits, loss, zero and unavailable outcomes;320/390/768px in three themes; bounds/touch targets/no horizontal overflow; native touch hold/drag/release; exact details; saved-result refresh;12+2pagination; unchanged saved trade/execution/fee snapshots after presentation interactions; no page errors. Phone and twelve-trade screenshots were inspected. This is Chromium touch emulation, not physical-handset/Safari testing. Evidence is generated outside the source ZIP.

The released glass browser also contained the superseded equal-size assertion for its missing-currency trade fixture. It is explicitly amended to require fixed equal size within each outcome category, loss smaller than neutral smaller than profit, and verified absence of recorded currency; no magnitude ranking is allowed there. All other browser assertions remain. The released drag browser passed unchanged with the new sizing.

Final local checkpoint: all319registered verifiers were executed;318passed. Only the unchanged environment doctor was blocked by local DNS EAI_AGAIN. It remains required in the canonical environment, where Gate404 passed it. The released glass browser passed after the explicit category-size expectation amendment; released drag and the dedicated sizing browser also passed. No unresolved product/test failure remains locally.

Canonical verification and both exact-run artifacts remain required before this candidate is GOLDEN. Preserve every released stage/browser regression, full registered verifier run and historical closure, adding the dedicated sizing stage/browser evidence. No local check substitutes for the canonical gate.

## Packaging and continuation

Candidate: KAIROS_YOUR_TRADES_PROFIT_SIZE_UI_CANDIDATE_2026-09-12.zip. Source-only kairos_p76/ root, bounded delta from404, no removals or build/cache/evidence/log residue. Dependencies/lockfile stay exact. Publish with guarded direct Git Data and fresh main/Actions checks, then verify the full canonical run and both artifacts. Do not claim Cloudflare deployment.

P21 remains active. Journal's symbolic Trade map and Analysis's saved-trade picker do not satisfy the requested candle workspace. KAIROS_CHART_WORKSPACE_INTEGRATION_PLAN.md records unfinished integration in dependency order before P21 closure/P22 progression. Component closure is not proof of a completed route.

## FULL canonical completion — Gate405

Fresh GitHub verification: canonical run34696306217/job103560275701 on head acef469e115c61412407bf0f840d5c15504feadd completed successfully. All32actual stages passed, including exact archive/scope, saved-result/decimal ownership, released drag, TypeScript/build, all browser scripts, full unit regression, all registered verifiers and historical closures. The environment doctor passed in the canonical environment.

Both exact-run nonexpired artifacts match that head: KAIROS_CURRENT_CANDIDATE10299400624 (artifact digest sha256:b37a42b7ebd6974534def66da1afcbe205d77ca279485370735d1555740543dc) and KAIROS_GATE_EVIDENCE10299370734 (artifact digest sha256:6f99794e3f019ed899ad3d1d8914abeb90d2d97640c09cd71b74c0b3e30fa05e). These artifact digests identify the Actions wrappers, not the source ZIP bytes.

GOLDEN candidate: KAIROS_YOUR_TRADES_PROFIT_SIZE_UI_CANDIDATE_2026-09-12.zip;3482304bytes;SHA2564a0f1871c67defb68cd2968bf9655927f0db76b23f1e33c67605e5a82df7d205;Git blob5e1ca533a29661f5b3bb267eaa66bc59a5dc95a7. Published archive Git identity and canonical workflow match the locally frozen candidate exactly. The pending checkpoints above and within the immutable ZIP are superseded by this completion evidence.

Run: https://github.com/macdarenz-droid/kairos-p1-r17/actions/runs/34696306217

UI VISIBLE: larger saved profits have larger Your Trades bubbles; losses remain small. Existing drag and exact saved details remain. This is ready for the user's Cloudflare deployment/review; no deployment or approval of this new UI is claimed. P21 remains active. The next responsibility after reviewed sizing is the existing P15/P16 candle-source/identity/history boundary recorded in KAIROS_CHART_WORKSPACE_INTEGRATION_PLAN.md, followed by the standalone Analysis workspace. This completion update changes repository documentation only, not the verified source ZIP/workflow, and does not open another gate.
