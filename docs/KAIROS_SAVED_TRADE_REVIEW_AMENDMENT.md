# Saved trade review UI amendment — 12 September 2026

## Authority and exact base

The user said “Continue” after the verified Gate401 UI repair and repeated it during this slice's validation. The next contained behavior was explained in live commentary before implementation. Finish this slice and its repairs, then present the visible UI for review; do not start another feature automatically. P21 stays open.

FULL canonical base: workflow `.github/workflows/kairos-gate.yml`, job `verify-current-candidate`, Gate401/run34682450498/job103523448305/head05eebc7e92187a575ac588f2e39c6d3f5e8d9e51. All28actual stages succeeded. Exact-run artifacts KAIROS_CURRENT_CANDIDATE10294472084 and KAIROS_GATE_EVIDENCE10294531894 were present, nonexpired and bound to that head. Base ZIP KAIROS_JOURNAL_THEME_TOKEN_REPAIR_R1_CANDIDATE_2026-09-12.zip;3408043bytes;SHA2565e5d0b0a498a891e2c4fccc16e16299a8e752f8b5a67ad5a9be39ae6e305d231;Git blob a1d69ea6dc2d1e9121bbadf5f80b41a21c1868c9. Gate400 is failed evidence only.

## Visible behavior and ownership

- Journal history cards and selected Your Trades bubbles offer View trade, opening `/analysis?trade=<encoded saved ID>`.
- Analysis replaces its placeholder with a bounded recent-trade chooser or the selected trade's saved facts. The existing Analysis heading/navigation contract is retained.
- Exact-ID loading includes older records outside the latest500. A missing/empty ID never falls back to a different trade, including trades sharing a symbol. Direct links and reloads keep the same identity; records remain device-local.
- Overview shows side/status/market/source/currency and saved times. Saved plans remain distinct from chronological actual executions. Fees show their persisted currency and execution association when present. Gross/net and visual outcome reuse existing P11/P13 results and truthful unknown/unavailable states. No new arithmetic or currency conversion.
- Route reads discard stale/unmounted completion, refresh on focus/visibility or explicit request, and expose loading/error/retry/missing/empty states. The heading receives focus after load. Theme-owned cards, wrapping facts and44px controls support narrow phones.

P12 historyQuery extends exact primary-key read and shares hydration with existing bounded/indexed list queries. Exact trade/plan/execution/fee snapshot is read in one readonly transaction. loadTradeReview orchestrates database readiness and selection/detail choice. AnalysisRoute owns route/read lifecycle; TradeReviewDetails owns formatting; ReviewTradeLink owns encoded navigation. No storage/schema/backup/index/calculator/provider/dependency changes. Journal save/update, P14 visualizer, P17/P18/P19 chart/drawing/risk semantics, P20 Saved Analysis, and approved Live Bubble behavior retain their owners.

## Deliberate scope limit

This delivers a saved-trade review screen, not market candles or a risk-box chart. Historical candle acquisition and rendered chart integration remain separate work. It does not edit/backfill trades or infer fills/currency from plans or symbols. Phase closures describe source boundaries and do not imply that these pending user-facing capabilities already exist.

## Validation

- Pinned clean install, TypeScript, production build and all295testfiles/1183tests PASS through both verify:gate and verify:p1. An initial run exposed the intentional route replacement's heading mismatch; Analysis heading was restored and new focus coverage aligned. The old routing contract was retained unchanged. Initial concurrent full-suite executions also produced local worker-process exits; final sequential clean runs completed without errors.
- All319registered verifiers were executed. After the above fix,318passed; unchanged verify:doctor alone hit local DNS EAI_AGAIN for registry.npmjs.org. Its canonical check remains mandatory and was successful in FULL base401; no verifier is removed, skipped or weakened.
- Nine new tests cover an old exact ID beyond501newer records, shared hydration/read-only export payload, plan-versus-fill/result evidence, unknown currency, linked/orphan fee association, encoded navigation, duplicate symbols, empty/missing/retry and stale async identity guards. Released history, routing, Journal and dashboard tests pass in the full suite.
- Dedicated verify-trade-review, P8 navigation and P12 query-scope contracts PASS. No dependency/lockfile/toolchain changes.
- Real Chromium browser test PASS using actual Journal save UI and the full production route tree, without seeded trades. Closed BTCUSDT: plan90/80/130/quantity2, actual entry100x2/exit120x2, fee0.3USDT -> existing net result39.7USDT. A second BTCUSDT draft remains a separate identity. Journal and Your Trades links, direct URL/reload, chooser and missing ID all pass; saved facts remain identical after all review/navigation/theme operations.
- Browser measurements and screenshots at320/390px across kairos-depth/cosmic/ocean: all referenced tokens resolve, no horizontal overflow/runtime errors, stable card geometry,16px padding/1px borders and minimum44px controls. Screenshots inspected for readable hierarchy and plan/fill separation. Canonical browser script emits `.trade-review-evidence/trade-review-browser-report.json` and six screenshots.

Canonical promotion is pending until every required stage and both exact-run artifacts are verified. Local success alone is not GOLDEN. The unchanged large-bundle build warning remains an existing release concern, not a failed build.

## Packaging and publication

Candidate: KAIROS_SAVED_TRADE_REVIEW_UI_CANDIDATE_2026-09-12.zip, clean `kairos_p76/` root. Exact changed-file set is enforced against the above Gate401 base in the canonical workflow. Preserve all previous verifiers, browser checks, full unit/current/historical gates and both artifact uploads; add dedicated review ownership/unit/browser coverage and screenshot evidence. Pinned Node22.16.0/npm10.9.2, Lightweight Charts5.2.1 and Playwright1.62.1 are unchanged. Archive byte identity is pinned by the publication manifest/workflow rather than a self-referential hash in this report. Guarded direct Git Data publication uses the shared lease, fresh main/Actions after each write and no force push.

## Canonical verification and completion

FULL canonical PASS verified 12 September 2026: Gate402/run34684862514/job103529980136/heada78d048d6612867a2b8eb33bf0ddb040962f7416, all29actual stages succeeded. Both exact-run artifacts are present, nonexpired and bound to this head: KAIROS_CURRENT_CANDIDATE10294728829 and KAIROS_GATE_EVIDENCE10294808722. Workflow .github/workflows/kairos-gate.yml/job verify-current-candidate remains sole authority. Archive KAIROS_SAVED_TRADE_REVIEW_UI_CANDIDATE_2026-09-12.zip;3426535bytes;SHA256f0aedc23ef00e025be70d0ac3e16096ce32c3e88684f301768167c72815b1c1d;Git blob7d98466e26b4140c5b75c733da11cc731116c720. Latest GOLDEN is now402; immediate verified rollback401.

All dedicated review, released browser, full unit, complete current-roadmap and historical checks succeeded, including the unchanged doctor that was locally DNS-limited. Both artifacts were verified through exact-run metadata; no artifact download/extraction is claimed. Uploaded archive byte identity and18file delta passed the canonical integrity/scope steps. Production responsibilities are recorded in the architecture map's new canonical integration section. This root post-PASS entry supersedes the frozen candidate report's pending statement; candidate bytes and workflow are unchanged. The slice is ready for user UI review/deployment. Await explicit continuation before further feature work; P21 remains open.
