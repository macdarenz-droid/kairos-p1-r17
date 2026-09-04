# Kairos P18.37 — Chart Drawing Collection Presentation Coordination

Authority: canonical P18.36 PASS #242, run 33911759232, head 1b6b28a23d44ca5e954436b5fe12bcda999d477c.

## Responsibility
P18.37 adds the provider-neutral composition seam between the authoritative committed drawing collection and the existing drawing presentation boundary.

- P18.33 remains the sole committed in-memory drawing collection owner.
- P18.2/P18.36 remain the sole domain drawing -> renderer drawing projection owner.
- P18.11 remains the sole chart series/drawing presentation resource-ordering owner.
- P18.37 reads one committed collection snapshot, projects it through P18.36, then calls P18.11 presentation with the caller-supplied renderer series.

## Non-scope
No drawing mutation, ID allocation, draft commit, provider APIs, coordinate conversion, persistence/restore, selection/edit/delete execution, undo/redo, new drawing kinds, journal truth, calculations, navigation, or P19 Risk/Reward semantics.

## Controlled scope
Exactly six files versus authoritative P18.36:
1. `KAIROS_P18_37_CHART_DRAWING_COLLECTION_PRESENTATION_COORDINATION_REPORT_2026-09-05.md`
2. `package.json`
3. `scripts/verify-p18-37-chart-drawing-collection-presentation-coordination.mjs`
4. `src/features/chart/chartDrawingCollectionPresentationCoordination.ts`
5. `src/features/chart/index.ts`
6. `tests/chart-drawing-collection-presentation-coordination.test.ts`
