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
| Saved Analysis logical persistence contract | P20.1 | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Composes existing P17/P18/P19 logical truth only; no DB/schema/migration/repository/backup implementation yet, no UI, no provider state, no pixels, no duplicated RR/drawing semantics, no invented timeframe/metadata |

## P18 closure boundary

P18.1–P18.59 establish the generic drawing, provider, interaction, selection, deletion and trend-line editing lifecycle owners. P18.60 is the canonical P18 system closure. P18 remains the generic chart drawing/provider/interaction owner and explicitly does not absorb Risk/Reward semantics or persistence.

## P19 canonical ownership ledger — CLOSED through P19.7

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P19.1 | Risk/Reward analysis semantic contract: analysis identity/side + entry/stop/target DecimalString | `src/application/risk-reward/` | Semantic truth only; no rendering/provider/persistence |
| P19.2 | Immutable risk and reward zone semantics | `src/application/risk-reward/` | Entry↔stop and entry↔target semantic zones only; no pixel geometry or provider API |
| P19.3 | Complete RR chart semantic model | `src/application/risk-reward/` | Composes semantic levels/zones only; no presentation/provider ownership |
| P19.4 | Semantic style-token projection | `src/app/riskRewardChartStyleProjection.ts` | Presentation-boundary token references only; no hard-coded colors/provider API |
| P19.5 | Logical placement projection | `src/app/riskRewardChartPlacementProjection.ts` | Preserves caller-supplied generic `ChartTimestamp` start/end only; no timestamp derivation or persistence |
| P19.6 | Provider-neutral logical RR chart-object projection | `src/app/riskRewardChartObjectProjection.ts` | Levels become logical horizontal spans; zones become logical rectangles; no LWC/provider calls, numeric renderer conversion, pixels, interaction/editing or persistence |
| P19.7 | Risk/Reward Tool SYSTEM CLOSURE | No new production runtime owner; closure verifier/report + this architecture boundary | Canonically proves P19.1–P19.6 cover the P19-owned Risk/Reward responsibility. It adds no second semantic/style/placement/object owner and does not implement P20 persistence |

## Canonical P19.7 closure evidence

`Kairos Controlled Roadmap Gate` #280 / run `34021672747`, head `3bd90834bb142e64dc0c98d2b46066af711bd8be`, completed SUCCESS on 2026-09-06. Every `verify-current-candidate` stage succeeded, including exact controlled P19.7 scope from authoritative P19.6, deterministic install, exact Lightweight Charts dependency proof, production TypeScript/build, dedicated P19.7 system-closure verifier/runtime, full unit regression, full controlled roadmap regression through P19.7, P18→P17 chart regressions, historical closures, and both artifact uploads.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9985793982`, 1,150,946 bytes, digest `sha256:2579f64e7ef6a05215713e13975d11a23a9b35a70b2940f37fe5e90453a2ad50`.
- `KAIROS_GATE_EVIDENCE` artifact `9985794187`, 999 bytes, digest `sha256:806f07943d4e747e5e666390219cc9b8cd0da041b56b79c10b87e5ca53e0a66b`.

Therefore P19.7 is the canonical P19 system closure.

## P20 canonical ownership ledger — OPEN through P20.1

| Patch | Canonical responsibility | Production owner seam | Boundary |
|---|---|---|---|
| P20.1 | Saved Analysis contract foundation and dedicated SavedAnalysis identity | `src/app/savedAnalysisContract.ts`, `src/app/savedAnalysisIdentity.ts` | Composes existing provider-neutral market reference, readonly existing P18 drawing snapshots, and P19 RR semantic truth + logical time extent. No persistence backend yet; no schema/migration/repository/backup/UI/provider/pixel ownership; no invented timeframe/name/trade/timestamp/index metadata |

## Canonical P20.1 evidence

`Kairos Controlled Roadmap Gate` #281 / run `34025578061`, head `f8479efd89c61bac4f09e32c5c7d69280ee02c5c`, completed SUCCESS on 2026-09-06. Every `verify-current-candidate` stage succeeded: exact controlled P20.1 scope from authoritative P19.7, deterministic install, exact Lightweight Charts dependency proof, production TypeScript/build, dedicated P20.1 Saved Analysis contract verifier/runtime, full unit regression, full controlled roadmap regression through P20.1, historical closures, and both artifact uploads.

Exact-run artifacts:
- `KAIROS_CURRENT_CANDIDATE` artifact `9987048689`, 1,153,597 bytes, digest `sha256:34cdb119bab8177a5168877449490ebb5cef3e45156062049b8a70dfe7b7f44c`.
- `KAIROS_GATE_EVIDENCE` artifact `9987048971`, 1,184 bytes, digest `sha256:0491d7fbef1dd19768bcbcc5fe69c69f1d106f0ab6635f3b7673580eb9572295`.

Therefore P20.1 is now the canonical GOLDEN. Its ownership is contract/composition only; it does not yet authorize or imply a P20 database/store/schema implementation.

## Ownership rules that remain invariant

- One owner per responsibility; later patches extend or compose existing owners rather than silently duplicating them.
- P11 remains calculation truth.
- P14 remains journal/trade-visualization truth where assigned.
- P18 remains generic drawing/provider/interaction machinery.
- P19 remains Risk/Reward semantic and provider-neutral logical composition truth.
- P20 owns Saved Analysis persistence/restore only where canonically introduced, while reusing P17/P18/P19 logical truth.
- P2/P3 design tokens remain style-value authority; P19.4 references tokens rather than hard-coding colors.
- UI/presentation amendments must preserve business/data/navigation truth and use new controlled amendments from latest GOLDEN.

## Next audit checkpoint

Before P20.2, reread the controlling handoff/roadmap, P20.1 GOLDEN, this map, process history, Retry Ledger, and exact database/repository/backup ownership. Prove the smallest next persistence responsibility and non-scope before implementation. After each future canonical PASS, audit this map again and update only when canonical ownership/boundaries materially change.
