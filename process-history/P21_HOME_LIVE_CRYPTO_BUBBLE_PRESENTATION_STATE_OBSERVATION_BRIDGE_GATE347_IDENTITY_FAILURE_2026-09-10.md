# P21 Home Live Crypto Bubble Presentation-State Observation Bridge — Gate347 Identity Failure

Date: 2026-09-10

## Canonical status

Gate346 remains the latest FULL canonical PASS/GOLDEN. Gate347 / run `34448394587`, job `102778196021`, head `902bee7b28188bf98601554f63854a5397526b34`, completed FAILURE before candidate extraction/build/test execution.

## Exact Gate347 failure

The canonical gate failed at `Verify exact uploaded archive identity and integrity` because `.github/workflows/kairos-gate.yml` expected the candidate byte identity:

- filename `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-10.zip`
- size `1618538`
- SHA256 `e75cada42f3578cf03f7218f0005f181db7313dd0b024050cb89a27420bc43aa`

The runtime assertion was `CANDIDATE_ZIP: byte size mismatch`. Because the gate stopped before extraction, Gate347 did not validate or promote the candidate.

## Fresh helper/root re-proof

The successful NON-CANONICAL helper `Kairos Home Dashboard Live Crypto Bubble Presentation State Observation Bridge Reconstruction` run `34446823393`, job `102773314481`, artifact id `10140183601`, was freshly downloaded and independently inspected.

Exact artifact wrapper identity:
- size `1385304`
- SHA256 `3e07d7c511961301a79c5b23daf06154730e2b1756355c3d5b5cc1f173593f22`

The wrapper contains exactly one nested candidate:
- filename `KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_PRESENTATION_STATE_OBSERVATION_BRIDGE_FOUNDATION_CANDIDATE_2026-09-10.zip`
- size `1618603`
- SHA256 `52c851a9e5d39d8750db8558885185654a38cd05ffc0e9090992fa791897ffdd`
- root exactly `kairos_p76/`
- Git blob `b38fc9abe374af20d0586e7d0a0589c7b3db339b`

Repository-root placement commit `6448dcad9d751772c92f96a4811855712010bd41` contains the same candidate at the same size and Git blob. Gate347 head `902bee7b28188bf98601554f63854a5397526b34` also contains the same root candidate size/blob.

## Classification

`GATE_IDENTITY_EXPECTATION_DEFECT` — not a candidate/root staging defect.

The successful helper artifact and repository-root candidate bytes agree exactly. The canonical gate retarget encoded a stale/incorrect expected candidate size/SHA. The failed Gate347 candidate must not be treated as GOLDEN; Gate346 remains GOLDEN.

## Smallest repair

Repair only `.github/workflows/kairos-gate.yml` candidate identity constants, preserving all other base identity, exact five-file scope, deterministic install, dependency proof, production TypeScript/build, dedicated/lower-owner verification, focused/full regressions, historical closures, and canonical artifact uploads:

- `CANDIDATE_SIZE: '1618603'`
- `CANDIDATE_SHA256: 52c851a9e5d39d8750db8558885185654a38cd05ffc0e9090992fa791897ffdd`

No candidate bytes are to be changed. After the gate-only repair, refresh main/Actions and monitor the single newly triggered canonical run only.