# P21 Quote-Volume Ordering Helper #2 — Base64 Payload Corruption

Date: 2026-09-09
Run token: W16-SAME-WORKER-16M-20260908-A-AUTO11-DIRECT-HELPER-REPAIR

## Canonical authority
- Latest canonical GOLDEN remains Gate #326 / run `34296922584`, full SUCCESS.
- Active responsibility remains provider-neutral deterministic quote-volume ordering only: already-eligible `LiveMarketSummaryFact[]` -> sorted copy descending exact `quoteVolume24h`, symbol ordering only as equal-volume tie-break.
- Top-N / Top-30 remains separate later ownership.

## Action
- Fresh complete ordering helper blob `18c1959b3372862a9b0f28f360d3de7ac370d266` (12,661 bytes) was read completely.
- Direct GitHub connector update changed exactly `json.loads(os.environ['PAYLOAD_JSON'])` to `json.loads(os.environ['PAYLOAD_JSON'], strict=False)` and preserved all other helper steps.
- Main commit: `957697d6f743c66118ed3a04cd127da8fe4d0f54`; new helper blob `58f26c9ff78191992239930de72c6a0dc51fd0ab`.
- This triggered NON-CANONICAL helper run `34309619493`, job `102333383220`.

## Exact result
- Setup, checkout, Node 22.16.0, and npm 10.9.2 pinning succeeded.
- Reconstruction failed before exact-scope/install/verifier/test/build/package stages.
- Exact decoded log now proves the parser repair itself worked and execution advanced into per-file base64 decode.
- Failure: `binascii.Error: Incorrect padding` from `base64.b64decode(data)`.
- Log exposed malformed embedded verifier payload, including `scripts/verify-live-market-universe-quote-volume-ordering-policy-foundation.mjs` value containing non-base64 `>` characters (`...bGVT>8J+RkQ==`).
- All downstream verification/package stages were skipped; no candidate was produced or promoted.

## Classification
This is a NON-CANONICAL helper payload/transfer corruption, not a candidate or canonical gate verdict. Gate #326 remains GOLDEN.

The raw JSON + embedded-base64 YAML environment transfer family has now failed twice with materially related serialization/payload corruption evidence. It MUST NOT be repeated or loosened again.

## Next safe strategy
Materially change representation. Recover the exact intended six-file ordering delta from a clean authoritative source (prior local draft/source evidence, deterministic reconstruction from exact Gate326 source, or direct repository/file transport), then verify the bytes before any helper run. Do not reuse the malformed embedded verifier base64. A safe next helper should consume integrity-proven files/patch/blob content rather than a raw large JSON/base64 YAML env scalar. Preserve exact six-file scope, pinned Node/npm/LWC, dedicated verifier, focused tests, typecheck/build/full unit/current-historical verifier regressions, clean `kairos_p76/` packaging, ZIP integrity and exact SHA identity.

No canonical retarget and no Top-N/Top-30 work until exact ordering candidate identity/scope is fully proven.