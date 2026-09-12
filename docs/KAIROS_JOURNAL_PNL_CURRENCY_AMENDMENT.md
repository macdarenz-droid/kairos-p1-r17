# Journal explicit P&L currency integration — 12 September 2026

## User authority and canonical base

Current live user request: “Continue nxt slice, just let me know if the update involved ui visible changes so i can have a look”. This explicitly authorizes one next source-grounded slice after Gate398, and requires visible changes to be identified for review. It does not authorize any following slice or P21 closure. The selected currency gap and exact UI were explained in commentary before implementation.

Base FULL canonical GOLDEN: Gate398/run34676939484/job103508349329/head85b15fa8ca75a0e8f6e44f6094a8221aa730bf91, completed2026-09-12T06:14:27Z. All27steps succeeded. Exact-run nonexpired KAIROS_CURRENT_CANDIDATE artifact10292848236 and KAIROS_GATE_EVIDENCE artifact10292943030 verified. Base KAIROS_JOURNAL_OPEN_TRADE_UPDATE_UI_CANDIDATE_2026-09-12.zip:3386785bytes;SHA2564adb85401d42cb6394f9df4133a2270d6a3531755878e6f5b98d27782cd97a10;Git blob62fdaefbabd474d48c8fbc778299fc4a5f13cb53. Exact raw archive bytes, hash, integrity and fresh extraction verified locally. The legacy repository src/ tree is not the current candidate source.

## Missing capability and bounded responsibility

P11 already accepts explicit gross P&L currency and only subtracts nonzero fees when currencies match. P12 history previously supplied no currency evidence; TradeRecord had no such field. Thus a manual trade with complete fills and matching recorded fees could not show net P&L. This supporting P9/P10/P11/P12 integration makes that existing capability reachable and supplies P13/P21 consumers without replacing calculators.

The optional TradeRecord.grossPnlCurrency field records the user's declared unit of execution prices and the resulting P&L. Absent/null is unknown. New manual saves trim and uppercase supplied text; empty remains absent. It is never derived from symbol, market type, live provider, account currency or fees.

JournalPriceCurrencyField is presentation-only. JournalRoute keeps a neutral priceCurrency raw draft; the existing application draft adapter maps it to explicit calculation evidence. P12 supplies the saved unit to the existing P11 API. No new arithmetic, FX conversion, provider request, fee conversion or monetary rounding is introduced.

## UI and scope

- Journal new trade: optional “P&L currency” field, with a short explanation to use the currency of entered prices and leave it blank if unknown.
- Trade history -> Open manual trade -> Update trade: add a missing currency once, including a currency-only update. A recorded currency is read-only and preserved during later appends/closure.
- Journal gross/net amounts and Your Trades results display the known unit. Missing/mismatched fee evidence retains unavailable net results, with a short explanation.
- Existing Closed records cannot be retrofitted in this slice. General correction/reopening, inferred exchange rates, candles/risk boxes, Live Bubble changes and phase closure remain out of scope.
- The existing user-approved Live Bubble design, rankings, percentage sizing, BTC/ETH distinction and motion are untouched.

## Persistence and ownership safeguards

The optional field is non-indexed and backward compatible: no database store/index/schema-version changes or backfill. [Dexie Version.stores documentation](https://dexie.org/docs/Version/Version.stores()) states that the schema lists indexes rather than every stored property. Existing snapshot, serialization and replacement owners preserve full records. Existing backup validation delegates to validateTradeRecord, which now rejects malformed/non-normalized non-null currency evidence. Legacy backups without this field remain valid.

updateOpenManualTrade includes currency in its existing full-snapshot stale guard. A same-millisecond competing currency update cannot overwrite the first. Existing currency cannot be replaced or erased through append; a missing unit is committed atomically with the header and optional new rows. A child-write failure rolls back both currency and appended facts. Existing trade identity, original executions/fees and plans remain intact.

## Verification and actual limitations

Local pinned Node22.16.0/npm10.9.2 TypeScript compilation and production build passed. Full unit regression:294files/1174tests passed. Dedicated tests cover exact fee subtraction, absent/null/blank currency, mismatched/mixed fees, zero-fee legacy behavior, currency-only update, same-millisecond stale guard, immutable recorded unit, transactional rollback/retry, full backup/restore, malformed backup rejection and UI discard/read-only behavior. After neutral presentation naming, dedicated17tests and real browser were rerun successfully; the final history fallback retains the released missing-value expression.

Real Chromium153 with Playwright1.62.1 exercised actual create-open -> reload -> add currency only -> partial exit -> reload -> final exit/fee/close -> Your Trades. No seeded trade records. Original identity/entry preserved; final net34.7USDT after fee0.3USDT. A separate new manual trade saved AUD and reset its form. Browser checks passed320/390px containment, control geometry, all3themes, read-only currency and no page errors. Screenshots inspected. Evidence: .pnl-currency-evidence/ (generated during gate, not in clean candidate archive).

Initial local full verifier enumeration stopped at verify:doctor because direct DNS lookup of registry.npmjs.org returned EAI_AGAIN. npm ci itself succeeded. Preserve this check unchanged in canonical GitHub verification; local suite is not claimed as FULL canonical PASS. Remaining owner checks were resumed from exact stopping points. Historical broad source guards required preserving the existing P10 neutral draft naming and P12 unknown-currency fallback; no verifier expectations were weakened. The browser installer timed out; local QA used an existing verified nonempty Chromium executable. The canonical gate keeps its existing pinned Playwright installation and adds the new currency browser script.

## Publication and next action

Candidate filename: KAIROS_JOURNAL_PNL_CURRENCY_UI_CANDIDATE_2026-09-12.zip.
Publish direct Git Data on fresh main under the existing lease, with exact base/candidate identities and allowed delta. Preserve every required historical regression and both exact-run artifacts. Canonical promotion requires every stage and both artifacts; this report alone is not PASS authority.

After full canonical PASS, provide the review/build instructions and await the user's next explicit continuation. Existing V16 worker and supervisor remain enabled on their supported hourly recurrence; monitor/repair this approved slice only. P21 remains open; P22 is not started.
