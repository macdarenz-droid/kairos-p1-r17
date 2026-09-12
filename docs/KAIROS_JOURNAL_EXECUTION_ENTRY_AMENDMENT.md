# Journal execution-entry integration amendment

## Authority and purpose

User approved the roadmap-backed continuation on 12 September 2026 after the audit identified that P10's save command supports executions but the Journal form only collects trade metadata and plans. Base is FULL canonical GOLDEN Gate396, run34670701285, job103491385531, mainb016648c08f2b45a0acb2793afeec1c71764553e. Every canonical stage and both nonexpired exact-run artifacts verified. Base archive KAIROS_HOME_DASHBOARD_YOUR_TRADES_V1_CANDIDATE_2026-09-12.zip,3354108 bytes,SHA256923f77fa924693fd8b5a75b463de69bba066bd1a80d0b01bf7fb0e5b7c389a43.

This is a controlled integration amendment to P10 supporting P11/P12/P13/P14/P21 consumers. It is not P21 closure, a new chart phase, or an amendment to financial algorithms.

## Ownership and flow

JournalRoute retains its existing draft, submission, success/error and history-refresh ownership. JournalExecutionFields presents explicit entry/exit rows and optional fee rows, with stable ephemeral keys, positive-value validation delegated to the existing save command, no defaults copied from plans, and no direct database access. A user adds entry/exit rows only for Open/Closed. Changing status retains typed rows; incompatible status blocks submission until the user explicitly removes the rows or chooses Open/Closed. Removing a draft row affects only unsaved UI state.

manualTradeExecutionDraft adapts the already-prepared P10 trade draft plus explicit execution/fee rows. It strips ephemeral keys, converts valid device-local execution and trade timestamps to UTC ISO timestamps, and leaves financial strings unchanged for existing P10 validation. Each added execution row requires a timestamp. No financial arithmetic, result currency inference or aggregate result ownership is added.

JournalRoute -> existing prepareManualTradeSubmission -> prepareManualTradeExecutionDetails -> existing saveManualTrade -> existing atomic repository transaction -> existing listJournalHistory/P11/P13 -> existing Your Trades query/UI. Save controls are disabled during the write. Only committed success clears the draft; validation/storage failures retain fields and focus the message. No schemas, repository APIs, persisted record types, provider feeds or calculation algorithms change.

## UI

Actual entry/exit cards use a compact two-column price/quantity row and full-width date/time control. Repeated entry/exit rows support scaling and partial exits. Fees and the optional trade plan use collapsible native details. Error fields have aria-invalid; errors receive focus. All added CSS consumes registered design tokens. The approved Home live/trade bubble appearance, motion, sizing, ranking, identities and selection remain unchanged.

## Verified locally

- Production build and TypeScript compilation passed.
- Full unit regression:292 files,1149 tests passed.
- Dedicated actual Journal UI tests prove long/short results, partial exits, incomplete realization remaining unavailable, invalid numeric input with no save, incompatible status retention, explicit fees, atomic storage rollback/retry, and exact timestamp/decimal handling.
- Existing P2/P10/P11/P12/P13/P14/P21 ownership checks passed.
- Real Chromium on320/390px mobile widths and three released themes: actual form input/save without seeded records, error focus/input retention, correct Australia/Melbourne-to-UTC timestamps, reload persistence, navigation to Your Trades, and exact result40 with unknown currency preserved. Local evidence in .execution-evidence is generated, not included in source archive; CI uploads its own run evidence.
- Canonical gate must additionally pass all retained browser, full unit, controlled-roadmap and historical stages plus both artifacts. Local results alone do not promote this candidate.

## Known limits and next approval

This form creates new trades; it does not edit existing saved trades or retrofit the user's earlier records. Plan fields remain plans. A closed trade with incomplete execution evidence still has no fully realized result. The released history query supplies no gross-result currency; with recorded fees, released currency-comparability rules can therefore keep the net result unavailable. No currency is guessed from a symbol or fee and no FX conversion is invented. Daily results retain their existing Settings time-zone prerequisite. Chart candles, logged-trade chart navigation, risk/reward overlays and automatic market-context acquisition remain separate integration gaps.

The latest user instruction requires approval before every new slice. Verify/repair this approved amendment autonomously. After FULL PASS, prepare a source-grounded next-slice proposal with concrete UI behavior and limitations, then wait for user approval before implementation/publication. Refer to KAIROS_CONTINUATION_APPROVAL_CONTROL.md. A phase marked closed proves its recorded boundary, not that every promised product screen has been connected.
