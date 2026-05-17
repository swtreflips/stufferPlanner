# forkFixes.md — Implementation plan for the fork UX problems

Companion to [fork.md](fork.md). `fork.md` identified four UX problems with the current fork flow; this doc is the design response — what gets built, in which Phase, and with what verbs. **Designed, not yet built.** Lands in Phase 5.6, after Phase 5 (drag-and-drop) and Phase 5.5 (allocation modal) ship.

---

## The keystone: `tryAlternativeForContainer`

The single verb that does most of the work. One click on a draft container card forks the current scenario, clears the duplicate of *that* container in the new scenario, and switches to it.

- **UI label**: *"Try alternative"*.
- **Defaults**: scenario name pre-filled to `{containerName} — Alternative`.
- **Store action**:
  ```ts
  tryAlternativeForContainer(containerId: string, newScenarioName: string): Promise<string>
  ```
  Composition of two primitives: `forkScenario(currentId, newName) → { newScenarioId, containerIdMap }`, then `emptyContainer(containerIdMap[containerId])`. Returns the new scenario id.
- **Why it works**: collapses the three-step fork → empty → re-allocate dance into one verb that matches user intent ("I want to try a different arrangement *for this container*").

This single verb mostly solves Fix 3 (inverted intent) and partially Fix 1 (a discoverable entry point that isn't called "fork") and Fix 2 (no programmer word in the label).

---

## Fix 1 — Dead-end drag → tooltip with entry point

The grid already dims rows where `available_in(currentScenario, item) === 0` (per Phase 5.5 spec). Phase 5.6 adds a tooltip + click affordance on those rows.

**Tooltip text**:
> *"POX is fully allocated in {scenarioName}. Try a different arrangement?"*

**Click behaviour**:
- If POX appears in exactly **one** draft container of the current scenario → invoke `tryAlternativeForContainer(thatContainer.id)` directly.
- If POX appears in **multiple** drafts → open `ContainerPickerDialog` listing the candidates → user picks → invoke `tryAlternativeForContainer`.

The tooltip turns a confused dead-end into a guided action. The user never needs to know the word "fork."

---

## Fix 2 — Rename programmer verbs (UI labels only; internal API names unchanged)

| Internal name | UI label |
|---|---|
| `forkScenario` (manual, no clearing) | *"Save current scenario as alternative"* — demoted to a kebab menu in the scenario switcher. Rare workflow ("snapshot before fiddling") preserved, but not in the primary action surface. |
| `emptyContainer` | *"Clear allocations"* |
| `tryAlternativeForContainer` | *"Try alternative"* |

Store actions, repo functions, and Postgres RPC names stay as in [CONTCONFIG.md](CONTCONFIG.md). Only the strings users see in the app change.

---

## Fix 3 — The fork-then-empty dance

Fully addressed by the keystone verb above. The user no longer composes `fork` + `empty` themselves; one click does both.

---

## Fix 4 — Lightweight comparison modal

A *"Compare with…"* item in the scenario switcher's kebab menu. Click → small list of other scenarios → pick one → `CompareScenariosModal` opens.

**What the modal shows**: a per-container table across the two scenarios.

| Container | Lines (A · B) | CBM total (A · B) | Cargo ready (A · B) | OFQ ref |
|---|---|---|---|---|
| Container 1 | 3 · 6 | 14.60 · 60.42 m³ | Feb 15 · Apr 12 | — |
| Container 2 | — · 2 | — · 18.20 m³ | — · Mar 02 | — |

- Differences chipped in amber.
- Containers present in only one scenario show an em-dash on the other side.
- Committed containers show their OFQ reference and a `committed` badge.

Side-by-side full-tray view is **deferred** as a future enhancement; this modal closes 80% of the comparison gap with much less code.

---

## Files this will touch (Phase 5.6)

### New components

- `src/components/containers/ScenarioSwitcher.tsx` — dropdown + kebab menu (manual fork + compare items).
- `src/components/containers/TryAlternativeDialog.tsx` — name prompt for the new scenario.
- `src/components/containers/ContainerPickerDialog.tsx` — disambiguation when a PO is in multiple drafts.
- `src/components/containers/CompareScenariosModal.tsx` — the diff table.

### Modified

- [src/store/plannerStore.ts](src/store/plannerStore.ts) — new actions `forkScenario`, `emptyContainer`, `tryAlternativeForContainer`, `setCurrentScenario`; selector `availableQty(scenarioId, masterItemId)`.
- [src/data/repos/](src/data/repos/) — `AllocationRepo` lands; `ScenarioRepo.fork(sourceId, name)` returns `{ newScenarioId, containerIdMap }`.
- [src/components/containers/ContainerTray.tsx](src/components/containers/ContainerTray.tsx) — scenario switcher replaces the hardcoded "Main" header.
- [src/components/containers/ContainerCard.tsx](src/components/containers/ContainerCard.tsx) — adds *Clear* and *Try alternative* buttons alongside the existing *Delete*.
- [src/components/grid/OpenPoStatusReport.tsx](src/components/grid/OpenPoStatusReport.tsx) — `tooltipComponent` for zero-availability rows + click handler.

### Dependencies (already installed in Phase 4)

- `@radix-ui/react-dialog` — reused for all four dialogs/modals.

---

## Deferred (not in Phase 5.6)

- **Side-by-side two-tray view** — bigger UX investment; modal covers the immediate need.
- **Diff highlights on the master grid** (which lines moved between scenarios) — Phase 9 polish.
- **First-fork onboarding tooltip** — Phase 9 polish.
- **Custom verb naming per user** (some teams may want their own terminology) — future, only if asked.

---

## Implementation order when Phase 5.6 starts

1. **Substrate first**: `forkScenario` / `emptyContainer` / `tryAlternativeForContainer` in the store + `AllocationRepo` + `ScenarioRepo.fork` returning the id map. Verify with a console exercise.
2. **Switcher + manual fork**: `ScenarioSwitcher.tsx` with the kebab. Confirm the rare "save as alternative" path works.
3. **Card button + dialog**: *Try alternative* on `ContainerCard`. The main user-facing verb.
4. **Tooltip + picker**: wire the grid's zero-availability rows to the disambiguation flow.
5. **Compare modal**: last, after all other state is in place.

Each step is a separate, reviewable commit.
