# Gate392 design-system repair checkpoint

Gate392 run34630445192, job103365669030 failed verify:p2:design-system on src/app/homeDashboardGlassBubbleMap.css. Browser and full unit stages passed. Gate391 run34627355628 remains latest full GOLDEN.

The correction was implemented locally and the P2 check and real Chromium smoke/theme/30-circle/no-scroll/size-contrast checks passed. All sorted verifiers from verify:p2:design-system through verify:static passed; verify:toolchain correctly rejected local Node24.19 instead of required22.16. Canonical CI already supplies22.16. Do not weaken any verifier.

Exact correction:
- CSS gap: 1px -> gap: calc(var(--kairos-space-1) / 4).
- Visually hidden home header width/height:1px -> calc(var(--kairos-space-1) / 4), matching existing screen-reader styling.
- Home h2 margin:0 0 4px; font-size:16px -> margin:0 0 var(--kairos-space-1); font-size:var(--kairos-font-size-md).
- Home shell padding:10px 8px 0 -> calc(var(--kairos-space-2) * 1.25) var(--kairos-space-2) 0.
- font-weight:600 -> var(--kairos-font-weight-semibold).
- Replace four smoke gradient literals, in order #5adfff85, #9366e94d, #46dfff6b, #b879ff66, with var(--kairos-bubble-smoke-1) through var(--kairos-bubble-smoke-4).
- Register those exact four values in kairosDepthTokens in src/design-system/themes/themeEngine.ts, with comment that the approved V5 decorative rim palette is inherited consistently by all themes. Existing cosmic/ocean inheritance supplies them.
- Smoke alpha mask #000 at85% -> black at85% (alpha mask, not theme color).
No other UI behavior changed.

Reconstruct from Gate391 GOLDEN archive plus intended Gate392 changed paths, adding only themeEngine.ts and the repair note to the amendment report. Failed Gate392 is evidence of intended delta only, never authoritative base. Preserve exact ten-path scope (nine Gate392 paths plus themeEngine.ts), all existing verification stages, and both required artifacts. Add early npm run verify:p2:design-system after installation. Retarget exact R1 ZIP filename, byte length and SHA256 after freezing.

Locally prepared archive (not uploaded): KAIROS_HOME_DASHBOARD_COMPACT_BUBBLE_SMOKE_AMENDMENT_CANDIDATE_2026-09-11-R1.zip,3336229 bytes,SHA256 7e9b8b8e6cb6e5d27d1c0d8ffaddceb5cc0aa925be74b07d767b11080def2a4d,blob f483612ccddd6a64ce7462ad87c662b5cf6c4de1. Stored in /workspace/scratch/b0166db37617/repo with smoke-r1-meta.json in workspace root; corrected working source in compact/kairos_p76. A reconstruction may have different ZIP timestamps; verify/recompute identity instead of blindly reusing these pins.

Publication blocked by exec-server environment_offline (409); both exec_command and node_repl unavailable. No candidate blob uploaded, no gate retargeted or new canonical run launched. This documentation-only checkpoint preserves recovery detail. Once workspace recovers, acquire shared lease, inspect fresh main/Actions, recover or reconstruct bytes, directly publish through Git Data with identity/main/lease guards and verify the new canonical run. User-visible fix is not released until full gate plus both artifacts.
