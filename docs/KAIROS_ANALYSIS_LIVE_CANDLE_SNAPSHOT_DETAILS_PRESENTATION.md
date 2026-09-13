# Analysis live-candle authoritative snapshot details presentation

## Gate435 scope

This bounded item-4 prerequisite extends the released Gate434 selected-scope canvas with the exact authoritative history page already returned by Gate431's activation. After successful activation, the component presents the exact candle count, caller-authoritative quote asset, UTC receipt time and an expandable OHLC table. Decimal strings are rendered unchanged, so zero remains zero and no missing fact is manufactured.

The presentation consumes only `binding.activation.snapshot`. It does not acquire history, start a stream or timer, select an instrument, choose a limit, interpret decimals, calculate results or create a second renderer. Failed or incomplete activation continues to use Gate433's released status projection and exposes no stale snapshot details.

## Dependency purpose

The existing historical workspace exposes exact candle values and UTC snapshot context. A later route-integration slice must replace its historical-only request/renderer lifecycle with Gate434 without losing that information or issuing a duplicate provider request. Keeping the authoritative snapshot presentation beside the released live canvas makes that later replacement bounded and ownership-safe.

## Exclusions

`AnalysisHistoryWorkspace` and `AnalysisRoute` remain unchanged, so the current product UI is unchanged. This slice adds no route mount, provider policy, persistence, IndexedDB access, journal/calculation mutation, execution inference, FX, drawing, marker, risk box, Live Bubble behavior or phase closure. UI visible: no. P21 remains active.

## Evidence

- Dedicated verification requires successful-activation snapshot ownership, exact UTC and quote-asset copy, unchanged decimal strings and explicit absence of route/provider/storage/calculation owners.
- Focused tests prove details appear only for the exact successful activation snapshot, preserve zero and precision strings, and remain absent while activation is incomplete.
- TypeScript, production build, all current/historical/browser regressions and exact candidate/artifact verification remain mandatory before promotion.
