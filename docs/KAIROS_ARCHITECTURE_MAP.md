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

## P18 closure boundary

P18.1–P18.59 establish the generic drawing, provider, interaction, selection, deletion and trend-line editing lifecycle owners. P18.60 is the canonical P18 system closure. P18 remains the generic chart drawing/provider/interaction owner and explicitly does not absorb Risk/Reward semantics or persistence.

## P19 canonical ownership ledger — CLOSED through P19.7

P19.7 remains the canonical P19 system closure via `Kairos Controlled Roadmap Gate` #280 / run `34021672747`.

## P20 canonical ownership ledger — OPEN through P20.4

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P20.1 | Saved Analysis contract foundation and dedicated SavedAnalysis identity | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Logical Saved Analysis composition only; no persistence/UI/provider/pixel ownership |
| P20.2 | Saved Analysis persistence foundation | DB V4 `savedAnalyses` store; `src/data/repositories/SavedAnalysisRepository.ts`; backup/restore seams | Persists/restores P20.1 truth atomically; no UI/provider/pixels or speculative query metadata |
| P20.3 | Saved Analysis application-save orchestration | `src/application/saved-analysis/saveSavedAnalysis.ts`, `src/application/saved-analysis/index.ts` | Fresh-id allocation + one atomic repository write only; no inferred read/update/delete/list ownership |
| P20.4 | Saved Analysis application load-one-by-id orchestration | `src/application/saved-analysis/loadSavedAnalysis.ts`, exported through `src/application/saved-analysis/index.ts` | One stable-id repository read only; no UI/provider/pixels, list/update/delete orchestration, schema/backup/index changes, or invented metadata |

## Canonical P20 evidence

P20.1: `Kairos Controlled Roadmap Gate` #281 / run `34025578061` completed SUCCESS.

P20.2: `Kairos Controlled Roadmap Gate` #282 / run `34040888312` completed SUCCESS.

P20.3: `Kairos Controlled Roadmap Gate` #283 / run `34045317884` completed SUCCESS.

P20.4: `Kairos Controlled Roadmap Gate` #284 / run `34051280988`, job `101535244582`, exact head `5fcbafc31c5c91b13e07f1687332d5f2cc29ef61`, completed SUCCESS on 2026-09-07. Every required `verify-current-candidate` stage succeeded: exact controlled P20.3→P20.4 scope, deterministic install, exact Lightweight Charts dependency proof, production TypeScript compilation/build, dedicated P20.4 Saved Analysis application-load verifier/runtime, full unit regression, full controlled-roadmap regression through P20.4, historical closures, and both exact-run artifact uploads.

Exact P20.4 artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9994736197`, 1,164,825 bytes, digest `sha256:ec38e3fc20449af2321cb817d7eeffdd1c8cd8955171eabb6ebfff73a49f388a`.
- `KAIROS_GATE_EVIDENCE` artifact `9994736471`, 1,060 bytes, digest `sha256:731ec4df1da8bdb363281acce90a438abb20b2d90346835e1f41891e2aaabcf9`.

Therefore P20.4 is the canonical GOLDEN. It extends Saved Analysis application orchestration with one load-by-id read seam while preserving P20.1 logical truth, P20.2 persistence ownership, and P20.3 save ownership.

## Ownership rules that remain invariant

- One owner per responsibility; later patches extend or compose existing owners rather than silently duplicating them.
- P11 remains calculation truth.
- P14 remains journal/trade-visualization truth where assigned.
- P18 remains generic drawing/provider/interaction machinery.
- P19 remains Risk/Reward semantic and provider-neutral logical composition truth.
- P20 owns Saved Analysis persistence/application orchestration only where canonically introduced, while reusing P17/P18/P19 logical truth.
- P2/P3 design tokens remain style-value authority; P19.4 references tokens rather than hard-coding colors.
- UI/presentation amendments must preserve business/data/navigation truth and use new controlled amendments from latest GOLDEN.

## Next audit checkpoint

Before any next P20 responsibility, reread the controlling handoff/roadmap, P20.4 GOLDEN, process history, Retry Ledger, and exact current Saved Analysis owners/consumers. Prove exactly one smallest dependency-safe remaining P20 responsibility or prove P20 closure from source evidence. Do not infer P20.5 from numbering, and do not jump to P21 until P20 is source-proven closed. After each future canonical PASS, audit this map again and update only when canonical ownership/boundaries materially change.
