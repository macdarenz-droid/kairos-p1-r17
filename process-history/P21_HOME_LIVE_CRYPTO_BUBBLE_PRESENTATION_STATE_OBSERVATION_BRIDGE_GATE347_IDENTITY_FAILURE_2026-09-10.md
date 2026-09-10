# P21 Home Live Crypto Bubble Presentation-State Observation Bridge — Gate347/Gate348 Identity Failure

Date: 2026-09-10

## Canonical status

Gate346 remains the latest FULL canonical PASS/GOLDEN. Gate347 / run `34448394587`, job `102778196021`, head `902bee7b28188bf98601554f63854a5397526b34`, completed FAILURE before candidate extraction/build/test execution. The first gate-only identity repair then triggered Gate348 / run `34449824077`, job `102782785959`, head `40d538485db9ec524335b96d4692d6a1a6b6efc2`, which also completed FAILURE at the same archive-identity stage before extraction/build/tests.

## Exact Gate347 failure

The canonical gate failed at `Verify exact uploaded archive identity and integrity` because `.github/workflows/kairos-gate.yml` expected the candidate byte identity:

- filename `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-10.zip`
- size `1618538`
- SHA256 `e75cada42f3578cf03f7218f0005f181db7313dd0b024050cb89a27420bc43aa`

The runtime assertion was `CANDIDATE_ZIP: byte size mismatch`. Because the gate stopped before extraction, Gate347 did not validate or promote the candidate.

## Fresh helper/root re-proof

The successful NON-CANONICAL helper `Kairos Home Dashboard Live Crypto Bubble Presentation State Observation Bridge Reconstruction` run `34446823393`, job `102773314481`, artifact id `10140183601`, was freshly downloaded again and independently inspected byte-for-byte.

Exact artifact wrapper identity from the fresh download:
- size `1385304`
- SHA256 `3e07cb1376ea7f2ace46bd30181f6252219c8d58effb75d61998b8b88bdc5155`

The wrapper contains exactly one nested candidate:
- filename `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-10.zip`
- size `1618603`
- SHA256 `52c8513f8d3b89fddd3f5ebe361f5d2e43a57696bc96708855f045413e8e4fa7`
- root exactly `kairos_p76/`
- Git blob `b38fc9abe374af20d0586e7d0a0589c7b3db339b`
- ZIP integrity test clean

Repository-root placement commit `6448dcad9d751772c92f96a4811855712010bd41` contains the same candidate at size `1618603` and Git blob `b38fc9abe374af20d0586e7d0a0589c7b3db339b`. Gate347 and Gate348 heads retain that same candidate Git object, so the candidate/root staging bytes themselves were not changed by either gate-only repair.

## Gate348 failure and corrected classification

The first repair correctly fixed the candidate size but accidentally transcribed the SHA256 incorrectly as `52c851a9e5d39d8750db8558885185654a38cd05ffc0e9090992fa791897ffdd`. Gate348 therefore passed the size assertion but failed the SHA assertion with `CANDIDATE_ZIP: SHA-256 mismatch`.

Fresh byte-level artifact inspection proves the exact candidate SHA256 is instead:

`52c8513f8d3b89fddd3f5ebe361f5d2e43a57696bc96708855f045413e8e4fa7`

Classification remains `GATE_IDENTITY_EXPECTATION_DEFECT`, now specifically a transcription defect in the first gate-only repair. This is not a candidate/root staging defect. Gate346 remains GOLDEN; neither Gate347 nor Gate348 may be used as a base.

## Smallest next repair

Repair only `.github/workflows/kairos-gate.yml` candidate SHA256 constant while preserving all other Gate346 base identity, exact five-file scope, deterministic install, dependency proof, production TypeScript/build, dedicated/lower-owner verification, focused/full regressions, historical closures, and canonical artifact uploads:

- candidate size remains `1618603`
- candidate SHA256 becomes `52c8513f8d3b89fddd3f5ebe361f5d2e43a57696bc96708855f045413e8e4fa7`

No candidate bytes are to be changed. After this single gate-only repair, refresh main/Actions and monitor only the one newly triggered canonical run.