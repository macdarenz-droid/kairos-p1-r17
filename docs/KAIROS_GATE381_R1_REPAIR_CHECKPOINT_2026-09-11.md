# Gate381 R1 fixture repair checkpoint

Manual continuation; workers and supervisor intentionally paused.

Authority: Gate380 run 34579897908, job 103200776280 verified all stages successful and both exact-run artifacts present. Gate381 run 34583169478 failed TypeScript. Main before repair: dc74bb7dff302db4172baf8421ad7e5f1c2b2e57.

Reconstructed from exact Gate380 GOLDEN bytes plus intended Gate381 five-file delta. Fixed fixture fields to minimumRadiusCssPixels: 16 / maximumRadiusCssPixels: 48. Focused execution then proved accumulated mock calls across tests; added beforeEach mock reset/clear in that same test file. Assertions and production component unchanged. Five-file delta, zero removals, ZIP integrity verified.

Local evidence: typecheck PASS; production build PASS; focused nine test files / 38 tests PASS; dedicated static verifier PASS. Local Node 24.19.0 / npm 11.9.0 differ from canonical pins. Full local verifier attempt stopped at verify:doctor on registry.npmjs.org EAI_AGAIN; no full regression PASS claimed. Canonical Node22.16.0/npm10.9.2 and all gate stages preserved. Local full unit run still pending when checkpoint prepared.

Candidate: KAIROS_HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_CONFIGURED_BROWSER_PIXEL_RADIUS_TEXT_EVIDENCE_RUNTIME_COMPOSITION_FIXTURE_REPAIR_R1_CANDIDATE_2026-09-11.zip
Size: 1696072
SHA-256: 780ba3281773e6b476ab36cab5064a3d4e4427a69bad7da4e128f73551177e58
Git blob: ecfef225aeacf4029105768bf638a3f7fc05f419

Gate workflow retarget changes only candidate filename, size and digest. Gate380 remains GOLDEN pending full canonical success plus exact artifacts. No HomeRoute or visible bubble renderer change. Next action: monitor only the exact canonical run from this commit; inspect failure if any, otherwise verify all stages and artifacts before promotion. No concurrent next slice. Manual lease astra-g381r1 held while preparing; release after durable result update.
