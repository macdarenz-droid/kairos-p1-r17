# KAIROS ARCHITECTURE MAP (Living Document)

## Purpose

This is the living ownership map for Kairos. Canonical code/gate truth always overrides this descriptive document.

## Maintenance rule

Update this file after every canonical PASS that establishes, extends, moves, or clarifies a production responsibility/owner/boundary, and at every phase closure. Only canonically proven ownership belongs here. Helper/candidate-only results are not architecture authority.

## Core Truth Ownership

| Concept / Truth | Owner (Phase) | File / Module | Boundary — what it must NOT do |
|---|---|---|---|
| Journal execution truth | P9 / P10 | canonical journal domain/application seams | Never silently overwritten by market data |
| Derived financial metrics | P11 Calculation Brain | canonical P11 calculation seams | UI is never a second calculation owner |
| Journal history / record listing | P12 | canonical P12 seams | No duplicate execution/calculation truth |
| Visual P&L presentation | P13 | canonical P13 seams | Must not aggregate incomparable currencies |
| Trade visualizer | P14 | canonical P14 seams | Visualization does not own journal truth |
| Market data acquisition | P15 | canonical P15 seams | Never overwrites journal execution truth |
| Binance Spot provider | P16 | canonical P16 provider seams | Provider mapping is not journal truth |
| Chart rendering / presentation | P17 | canonical P17 seams | Presentation only; never decides financial truth |
| Drawing tools / generic drawing-edit lifecycle | P18, CLOSED canonically at P18.60 | `src/features/chart/` and canonical P18 application/provider seams | No persistence/P20 ownership; no Risk/Reward/P19 meaning; no journal/calculation truth |
| Risk/Reward semantics + provider-neutral chart composition | P19, CLOSED canonically at P19.7 | `src/application/risk-reward/`, `src/app/riskRewardChartStyleProjection.ts`, `src/app/riskRewardChartPlacementProjection.ts`, `src/app/riskRewardChartObjectProjection.ts` | Owns RR meaning, semantic levels/zones, style-token references, logical placement/object composition only; no P18 provider machinery, P11 calculation truth, P14 journal writes, P20 persistence, DOM/UI, pixel geometry, normalization/order validation, or hard-coded colors |
| Saved Analysis logical persistence contract | P20.1 | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Composes existing P17/P18/P19 logical truth only; no DB/schema/migration/repository/backup implementation, no UI, no provider state, no pixels, no duplicated RR/drawing semantics, no invented timeframe/metadata |
| Saved Analysis persisted storage / backup / restore | P20.2 | `src/data/database/`, `src/data/repositories/SavedAnalysisRepository.ts`, `src/data/backup/` | Persists and restores the P20.1 logical contract only; no UI/provider/pixels, no duplicated P17/P18/P19 semantics, no speculative secondary indexes/query APIs, and no optional metadata invention |
| Saved Analysis application save orchestration | P20.3 | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Allocates a fresh Saved Analysis id and coordinates exactly one atomic persisted write using P20.1 logical truth and P20.2 persistence; no UI/provider/pixels, no second repository/schema owner, no duplicated P17/P18/P19 semantics, and no speculative load/update/delete/list orchestration |
| Saved Analysis application load-one orchestration | P20.4 | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | Reads one persisted Saved Analysis by its stable id through the P20.2 repository boundary; no UI/provider/pixels, no second persistence owner, no list/update/delete orchestration, and no redefinition of P17/P18/P19/P20.1 truth |
| Saved Analysis system | P20, CLOSED canonically at P20.5 | P20.1 logical contract + P20.2 persistence/backup/restore + P20.3 save + P20.4 load-one | Closure adds no new production runtime owner; no speculative list/update/delete lifecycle, UI/provider/pixel ownership, schema/index widening, or invented metadata |
| Home Dashboard route presentation ownership | P21.1 | `src/app/HomeRoute.tsx`, wired by `src/app/routes.tsx` at existing `/` index route | Presentation/semantic dashboard boundary only; does not own navigation truth, provider/live market data, persistence/query/calculation truth, Bubble Map geometry/algorithms, Saved Analysis CRUD, P22 behavior, or P40/global transition motion |

## P18 closure boundary

P18.1–P18.59 establish the generic drawing, provider, interaction, selection, deletion and trend-line editing lifecycle owners. P18.60 is the canonical P18 system closure. P18 remains the generic chart drawing/provider/interaction owner and explicitly does not absorb Risk/Reward semantics or persistence.

## P19 canonical ownership ledger — CLOSED through P19.7

P19.7 remains the canonical P19 system closure via `Kairos Controlled Roadmap Gate` #280 / run `34021672747`.

## P20 canonical ownership ledger — CLOSED through P20.5

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P20.1 | Saved Analysis contract foundation and dedicated SavedAnalysis identity | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Logical Saved Analysis composition only; no persistence/UI/provider/pixel ownership |
| P20.2 | Saved Analysis persistence foundation | DB V4 `savedAnalyses` store; `src/data/repositories/SavedAnalysisRepository.ts`; backup/restore seams | Persists/restores P20.1 truth atomically; no UI/provider/pixels or speculative query metadata |
| P20.3 | Saved Analysis application-save orchestration | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Fresh-id allocation + one atomic repository write only; no inferred read/update/delete/list ownership |
| P20.4 | Saved Analysis application load-one-by-id orchestration | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | One stable-id repository read only; no UI/provider/pixels, list/update/delete orchestration, schema/backup/index changes, or invented metadata |
| P20.5 | Saved Analysis SYSTEM CLOSURE | Verification/docs/package closure only; no new production runtime seam | Proves P20.1–P20.4 collectively complete the source-proven Saved Analysis responsibility; no speculative CRUD/runtime/UI/provider/schema expansion |

## Canonical P20 evidence

P20.1: `Kairos Controlled Roadmap Gate` #281 / run `34025578061` completed SUCCESS.

P20.2: `Kairos Controlled Roadmap Gate` #282 / run `34040888312` completed SUCCESS.

P20.3: `Kairos Controlled Roadmap Gate` #283 / run `34045317884` completed SUCCESS.

P20.4: `Kairos Controlled Roadmap Gate` #284 / run `34051280988`, job `101535244582`, exact head `5fcbafc31c5c91b13e07f1687332d5f2cc29ef61`, completed SUCCESS on 2026-09-07.

P20.5: `Kairos Controlled Roadmap Gate` #285 / run `34059034331`, job `101556113020`, exact head `a88b2d480ed0e8ae5cb571ead97a91d36693c4b0`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P20.4→P20.5 four-file closure scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation/build, dedicated P20.5 Saved Analysis system-closure verifier/runtime, full unit regression, full controlled-roadmap regression through P20.5, historical closures, and both exact-run artifact uploads.

Exact P20.5 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9996997282`, 1,167,501 bytes, digest `sha256:adf73735e84fe2bc79a0651fe14d76f2ee95860c1165f5da67c9337db9bfd6cd`.
- `KAIROS_GATE_EVIDENCE` artifact `9996997437`, 1,003 bytes, digest `sha256:869936a9c79813fd93e330c2d94bcb18f2ad5c08671bcf84f32e7939c282d8aa`.

Therefore P20.5 closed P20 Saved Analysis canonically.

## P21 canonical ownership ledger — OPEN through P21.1

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P21.1 | Home Dashboard Route Ownership Foundation | `src/app/HomeRoute.tsx`, `src/app/routes.tsx` index wiring | Dedicated Home presentation owner on existing `/`; preserves P8 `AppShell`/navigation/safe-area/theme truth and all existing business/data owners; no Bubble Map metrics/geometry, provider/live-data subscription, new persistence/query/calculation owner, Saved Analysis CRUD, P22 behavior, or full transition implementation |

## Canonical P21 evidence

P21.1: `Kairos Controlled Roadmap Gate` #286 / run `34061840453`, job `101563628073`, exact head `13d55093a569a156f316ccb848e6bd84e4e437ea`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P20.5→P21.1 five-file scope, deterministic install, exact Lightweight Charts 5.2.1 proof, production TypeScript compilation/build, dedicated P21.1 route-ownership verifier/runtime, full unit regression, full controlled-roadmap regression through P21.1, historical closures, and both artifact uploads.

Exact P21.1 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9997837809`, 1,169,775 bytes, digest `sha256:801b75beb1ed2bc16d13e2fa74a6905441652cdbc3ff66154abe6612894fdd17`.
- `KAIROS_GATE_EVIDENCE` artifact `9997837954`, 973 bytes, digest `sha256:829a2cf8118b04c59eb8cd3ca82c713f6acb0ad5f7445d622bd0175347524f9b`.

Therefore P21.1 is the canonical GOLDEN. P21 remains OPEN; later P21 responsibilities must be independently source-proven before implementation.

## Ownership rules that remain invariant

- One owner per responsibility; later patches extend or compose existing owners rather than silently duplicating them.
- P11 remains calculation truth.
- P14 remains journal/trade-visualization truth where assigned.
- P18 remains generic drawing/provider/interaction machinery.
- P19 remains Risk/Reward semantic and provider-neutral logical composition truth.
- P20 remains the closed Saved Analysis system; no generic CRUD expansion is inferred from P21 work.
- P21.1 owns only Home route presentation/composition semantics on the existing `/` route; P8 `AppShell`/navigation remains authoritative.
- The approved premium dashboard-transition direction remains presentation-only and must be layered through a clean motion seam later; animation must never own or delay route/navigation/data/persistence/calculation/chart/Saved Analysis/dashboard-selection truth.
- P2/P3 design tokens remain style-value authority; P19.4 references tokens rather than hard-coding colors.
- UI/presentation amendments must preserve business/data/navigation truth and use new controlled amendments from latest GOLDEN.

## Next audit checkpoint

P21 is open through canonical P21.1. Before any P21.2 implementation, reread the controlling handoff/roadmap, exact P21.1 GOLDEN, process history, Retry Ledger, current Home/dashboard/navigation owners and exact journal/provider consumers. Prove exactly one smallest dependency-safe next P21 Home Dashboard / Bubble Map responsibility and explicit non-scope from source evidence. Do not infer Bubble Map metrics, provider subscription, dashboard queries, or transition implementation from phase naming alone.
