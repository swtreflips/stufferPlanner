# UXwalkthrough.md — End-to-end flow

A narrative walkthrough of the planning UI for a simplified two-actor setup: one **internal** user (you) and one **factory** (Ditar S.A). All concepts and verbs come from [CONTCONFIG.md](CONTCONFIG.md). RLS for multi-factory still applies — the simplification is just for the story.

---

## Cast

| Role | User | What they care about |
|---|---|---|
| **Internal** | Mike (you) | Building OFQs out of incoming POs |
| **Factory** | Ditar S.A | Their POs shipping on time, in arrangements that match their manufacturing schedule |
| **Master data** | (system) | 12 open PO lines from Ditar; pushed by Admin (Phase 11) |

---

## Layout primer

Both roles render the same `AppLayout`. The contents differ by RLS + role gating.

```
+--------------------------------------------------------------+
| [SP] Stuffer Planner    [Main · 12 open POs]      [Internal] |
+----------------------------+---------------------------------+
|  Scenario: Main        ▼   |                                 |
|  [+ Fork scenario]         |   Open PO status report         |
|  ──────────────────────    |   ┌────────────────────────┐    |
|  COMMITTED (pinned)        |   │  AG Grid — 12 rows    │    |
|   (nothing yet)            |   │  Sortable, filterable │    |
|  ──────────────────────    |   │  Drag from row → tray │    |
|  DRAFTS in Main            |   └────────────────────────┘    |
|   (nothing yet)            |                                 |
|                            |                                 |
|  [+ Add container]         |                                 |
+----------------------------+---------------------------------+
```

**Left panel — Container Tray**

1. **Scenario switcher** — dropdown at top. Always lists "Main" first; forked scenarios below with a *forked from X* sublabel. Selecting a scenario re-renders the rest of the panel and the grid availability.
2. **Fork scenario** button — opens a small dialog to name the fork. Deep-copies the current scenario's draft containers.
3. **Committed section** — pinned at the top, always visible regardless of scenario. Each card shows the OFQ reference, contents, who committed it. Read-only.
4. **Drafts section** — draft containers in the currently-selected scenario. Editable. Each card has *Empty / Delete / Commit* actions.
5. **Add container** button — opens a dialog asking for destination (selected from distinct `shipTo` values) and type (`20GP` / `40GP` / `40HC` / `45HC`).

**Right panel — Open PO Status Report**

- AG Grid showing master items. The displayed availability column is **derived per current scenario**:
  ```
  available = original - committed_globally - sum(drafts in current scenario for this item)
  ```
- Rows where `available = 0` are dimmed and not draggable.
- Drag a row onto a draft container → opens the allocation modal.

**Role differences (for the simplified story)**

| Element | Internal | Factory |
|---|---|---|
| Scenario switcher | All scenarios | Own scenarios + scenarios containing own allocations |
| Committed section | All OFQs | Only OFQs containing factory POs |
| Drafts in scenario | All drafts | Own drafts + internal drafts touching factory POs (with only her allocation rows visible inside) |
| Add container button | Visible | Visible |
| Fork scenario button | Visible | Visible |
| Commit button on draft card | Visible | **Hidden** |
| Delete button on draft card | Visible on any draft | Visible only on own drafts that contain only own allocations |
| Grid row visibility | All rows | `name == 'Ditar S.A'` only |
| Editable cells in grid | None | `cargoReady`, `cbmPerCase`, `cbmTotal` on own rows |

---

# The story

## Scene 1 — Day 1, 9:00 AM: Internal starts building the first OFQ

Mike opens the app. The board is empty. Master grid shows 12 Ditar POs, all available, all in scenario "Main".

**Mike's actions:**

1. Clicks **+ Add container**.
2. Dialog appears:
   ```
   ┌─────────────────────────────────┐
   │  New container                  │
   │                                 │
   │  Destination:  [Simi Valley, CA ▼]
   │  Type:         [40HC ▼]         │
   │                                 │
   │              [Cancel] [Create]  │
   └─────────────────────────────────┘
   ```
3. Hits **Create**. A new empty draft container card appears in the Drafts section:
   ```
   ┌──────────────────────────────────────────┐
   │ Container 1  · 40HC · Simi Valley, CA    │
   │ draft · created by Mike                  │
   │ ────────────────────────────────────────  │
   │ (no allocations)                          │
   │ 0 lines · 0.0000 m³ · 0 cases             │
   │ [Empty] [Delete]                [Commit]  │
   └──────────────────────────────────────────┘
   ```
4. Mike drags PO155049 line 1 from the grid onto the card.
5. Allocation modal appears:
   ```
   ┌───────────────────────────────────────────┐
   │  Allocate PO155049 line 1                 │
   │  CFLF-WT10712                             │
   │                                            │
   │  Total quantity:           100             │
   │  Committed globally:       0               │
   │  Already in this scenario: 0               │
   │  Available for this draft: 100             │
   │                                            │
   │  Cases to allocate:  [100  ]               │
   │                                            │
   │                    [Cancel] [Confirm]      │
   └───────────────────────────────────────────┘
   ```
6. Confirms 100. Repeats the drag for PO155049 line 2, PO155026 line 1, etc.

After a few drops the card looks like:
```
┌─────────────────────────────────────────────────────┐
│ Container 1  · 40HC · Simi Valley, CA               │
│ draft · created by Mike                              │
│ ──────────────────────────────────────────────────── │
│  CFLF-WT10712     × 100  · by Mike                   │
│  CFLF-WT121012    × 100  · by Mike                   │
│  DELB-NK141015    × 100  · by Mike                   │
│                                                      │
│ 3 lines · 14.60 m³ · 300 cases                       │
│ Cargo ready: 2026-02-15                              │
│ [Empty] [Delete]                            [Commit] │
└─────────────────────────────────────────────────────┘
```

**Factory (Ditar) view at this moment:**
- She sees Main scenario.
- She sees Container 1 — *because it contains allocations against her POs* (she's the only factory in this scenario, so all of them are hers).
- Each allocation row carries a `by Mike` chip — she knows internal is proposing this arrangement.
- The right grid shows the same three POs as 0 available in Main.
- She does **not** have a Commit button on the card.

---

## Scene 2 — Day 1, 11:00 AM: First commit (OFQ-2026-001)

Mike has finalized Container 1. He clicks **Commit** on the card.

Commit modal:
```
┌──────────────────────────────────────────────┐
│  Commit Container 1                          │
│                                              │
│  This creates an OFQ from 3 allocations:     │
│   · CFLF-WT10712  × 100                       │
│   · CFLF-WT121012 × 100                       │
│   · DELB-NK141015 × 100                       │
│                                              │
│  OFQ reference:  [____________________]      │
│                                              │
│  After commit, master availability drops     │
│  for these lines globally. This is hard to    │
│  reverse (admin uncommit only).              │
│                                              │
│                  [Cancel]  [Commit OFQ]      │
└──────────────────────────────────────────────┘
```

Mike types `OFQ-2026-001` and confirms.

**What happens behind the scenes:**
- `commit_container(container_id, 'OFQ-2026-001')` runs in one transaction.
- Container row: `status = 'committed'`, `scenario_id = NULL`, `ofq_reference = 'OFQ-2026-001'`, `committed_by = Mike`, `committed_at = now()`.
- `master_items.committed_quantity` increments for each of the three lines.

**Mike's tray after:**
```
COMMITTED (pinned)
 ┌─────────────────────────────────────────┐
 │ OFQ-2026-001 · 40HC · Simi Valley, CA   │
 │ committed by Mike · 2026-05-17 11:02    │
 │  CFLF-WT10712     × 100                 │
 │  CFLF-WT121012    × 100                 │
 │  DELB-NK141015    × 100                 │
 │ 3 lines · 14.60 m³ · 300 cases          │
 └─────────────────────────────────────────┘

DRAFTS in Main
 (empty — Container 1 was promoted out)
```

The OFQ card is read-only. No more buttons. The three master rows in the grid now show:
- `original_quantity = 100`, `committed_quantity = 100`, available = 0.
- They're dimmed and undraggable.

**Factory view:**
- The committed card appears in her pinned section with the same OFQ reference and the same three allocations.
- A toast (sonner) fires for her: *"3 of your lines were booked into OFQ-2026-001."*
- Her grid rows for those POs now show committed = 100, available = 0.

---

## Scene 3 — Day 2, 10:00 AM: Factory proposes a pairing

Ditar's planner logs in. She sees:
- OFQ-2026-001 in pinned.
- 9 of her POs still pending in the grid.
- Main is empty of drafts.

She has an idea: PO155087 (four lines, 400 cases total) plus PO155173's two lines (435 cases) would fit nicely in a 40HC together because the cargo-ready dates align. She wants internal to consider it.

**Her actions:**

1. Clicks **+ Fork scenario**. Names it *"Ditar's idea — group 087 + 173"*. The fork copies Main's drafts (currently zero), so the new scenario is empty.
2. The scenario switcher updates and she's now viewing the new scenario.
3. Clicks **+ Add container**. Destination *Simi Valley, CA*, type *40HC*. Container 2 appears.
4. Drags her four PO155087 lines into Container 2 (100 each). For each, the allocation modal shows available = 100, she confirms 100.
5. Drags PO155173 line 1 (285 cases) → allocates 285. Drags PO155173 line 2 (150 cases) → allocates 150.

Her card:
```
┌─────────────────────────────────────────────────────┐
│ Container 2  · 40HC · Simi Valley, CA               │
│ draft · created by Ditar S.A                         │
│ ──────────────────────────────────────────────────── │
│  RPLQ-NK10712    × 100  · by Ditar S.A               │
│  RPLQ-NK13713    × 100  · by Ditar S.A               │
│  RPLQ-NK8510     × 100  · by Ditar S.A               │
│  RPLQ-NK141015   × 100  · by Ditar S.A               │
│  LEVI-NK16616    × 285  · by Ditar S.A               │
│  LEVI-NK13613    × 150  · by Ditar S.A               │
│                                                      │
│ 6 lines · 60.42 m³ · 835 cases                       │
│ Cargo ready: 2026-04-12                              │
│ [Empty] [Delete]                                     │
└─────────────────────────────────────────────────────┘
```

No Commit button — factories can't commit. She's done; she just leaves the scenario sitting there as a proposal.

**Mike's view (when he logs back in or via realtime push):**
- Scenario switcher gains a new entry: *"Ditar's idea — group 087 + 173"*, with a `created by Ditar S.A` sublabel.
- He switches to it. He sees Container 2 with all six allocations, each chip labeled `by Ditar S.A`.
- He has both `[Empty] [Delete]` AND a `[Commit]` button on the card (only internal/admin can commit). He can also drag more PO rows into Container 2 if he wants to modify her proposal.

---

## Scene 4 — Day 2, 2:00 PM: Internal explores an alternative

Mike likes Ditar's grouping but wonders if PO155176 (420 cases) would pack better than PO155173. He wants to compare.

**His actions:**

1. While viewing *"Ditar's idea"*, he clicks **+ Fork scenario**. Names it *"Mike's alt — 087 + 176"*. The fork copies Container 2 (let's call the copy Container 2′; it carries Ditar's allocations).
2. Switches to *"Mike's alt"*.
3. Clicks **Empty** on Container 2′. Confirmation: *"Remove all 6 allocations from Container 2? Their cases return to availability in this scenario."* Confirms.
4. Container 2′ is now empty (still 40HC, still Simi Valley). Card shows `0 lines · 0.00 m³`.
5. He drags the four PO155087 lines back in (each 100). Then drags PO155176 line 1 (225 cases) and line 2 (195 cases).

The scenario switcher now shows three options to Mike:
```
Scenario:  [Mike's alt — 087 + 176       ▼]
            ├─ Main
            ├─ Ditar's idea — 087 + 173  · by Ditar S.A
            └─ Mike's alt — 087 + 176    · by Mike · forked from Ditar's idea
```

He flips between the two non-Main scenarios to compare cargo-ready dates, CBM totals, vendor satisfaction.

**Factory's view of "Mike's alt":**
- Container 2′ is visible to her because it contains her POs (it's all her POs in this single-factory story).
- Each allocation chip says `by Mike` — she can see internal is exploring an alternative.

---

## Scene 5 — Day 2, 4:00 PM: Commit the winner

Mike decides Ditar's original grouping was better (the cargo ready date is earlier). He:

1. Switches back to *"Ditar's idea — 087 + 173"*.
2. Clicks **Commit** on Container 2.
3. Commit modal lists Ditar's six allocations. Mike types `OFQ-2026-002` and confirms.

**Result:**

- Container 2 moves to the pinned committed section globally:
  ```
  OFQ-2026-002 · 40HC · Simi Valley, CA
  committed by Mike · 2026-05-18 16:04
  proposed by Ditar S.A (every allocation `by Ditar S.A`)
  6 lines · 60.42 m³ · 835 cases
  ```
- Master `committed_quantity` increments for PO155087 lines 1-4, PO155173 lines 1-2.
- The right grid shows those six rows at availability = 0 globally.

**What happens to Mike's alternative ("Mike's alt — 087 + 176")?**

- Container 2′ in that scenario still has its allocations: PO155087 × 100 each, plus PO155176 × 225 and × 195.
- PO155087 lines 1-4 are now globally committed — available = 0 — but Container 2′ still claims 100 of each.
- The card in *"Mike's alt"* now shows a **stale badge**:
  ```
  ┌───────────────────────────────────────────────────┐
  │ Container 2′ · 40HC · Simi Valley · ⚠ STALE       │
  │ draft · created by Mike                            │
  │ ────────────────────────────────────────────────── │
  │  RPLQ-NK10712    × 100  · by Mike ⚠               │
  │  RPLQ-NK13713    × 100  · by Mike ⚠               │
  │  RPLQ-NK8510     × 100  · by Mike ⚠               │
  │  RPLQ-NK141015   × 100  · by Mike ⚠               │
  │  LEVI-NK16616    × 225  · by Mike                  │
  │  LEVI-NK13613    × 195  · by Mike                  │
  │  ⚠ 4 lines exceed global availability              │
  │ [Empty] [Delete]                       [Commit]   │
  └───────────────────────────────────────────────────┘
  ```
- The Commit button is **disabled** with a tooltip: *"Cannot commit — some allocations exceed global availability. Empty or remove the conflicting lines."*
- Mike can resolve by clicking **Empty** (and rebuilding), **Delete**, or by removing the four stale allocation rows individually.

**Factory view of *"Mike's alt"* after the commit:**
- She still sees it (her POs are in it).
- The stale badge shows. She knows internal's alternative was abandoned.
- She does not see the Commit button at all (factory).

---

## Scene 6 — Day 3: The next cycle

Two OFQs are committed. Six PO lines are gone from availability. Two scenarios sit in the switcher: *Ditar's idea* (now containing zero drafts — Container 2 was promoted out) and *Mike's alt* (stale).

Mike deletes *"Mike's alt"* by archiving the scenario from the switcher dropdown. Now only Main and *Ditar's idea* (empty) remain. He archives *Ditar's idea* too — it served its purpose.

Back to one scenario, six POs remaining, two OFQs pinned at the top. The cycle continues: drag, allocate, commit. As more POs arrive (admin push, Phase 11) the grid expands again.

---

# Element reference

## Components (in `src/components/`)

| Component | Purpose | Phase |
|---|---|---|
| `layout/AppLayout.tsx` | Header + split pane | 1 (exists) |
| `layout/SplitPane.tsx` | 50/50 split | 1 (exists) |
| `grid/OpenPoStatusReport.tsx` | AG Grid; reads `availableQty(currentScenarioId, item)` | 3 (exists; modify in 5.6) |
| `containers/ContainerTray.tsx` | The whole left panel | 4 |
| `containers/ScenarioSwitcher.tsx` | Dropdown + Fork button | 5.6 |
| `containers/ContainerCard.tsx` | A single card (draft or committed) | 4 |
| `containers/AllocationCard.tsx` | One row inside a container | 5.5 |
| `containers/AddContainerDialog.tsx` | New-container modal | 4 |
| `containers/AllocationDialog.tsx` | Quantity prompt | 5.5 |
| `containers/CommitConfirmDialog.tsx` | OFQ-reference prompt | 7.5 |
| `containers/ForkScenarioDialog.tsx` | New-scenario name prompt | 5.6 |
| `drag/DragOverlayRenderer.tsx` | dnd-kit overlay | 5 |
| `drag/DroppableContainer.tsx` | Drop zone on a card | 5 |
| `drag/SortableRow.tsx` | Reorder allocations | 6 |

## Buttons / actions per role

| Action | Where | Internal / Admin | Factory |
|---|---|---|---|
| Add container | Tray footer | Yes | Yes |
| Fork scenario | Tray header | Yes | Yes |
| Allocate (drag + modal) | Grid → card | Any PO | Own POs only |
| Empty container | Card footer | Any draft | Own drafts with only own allocations |
| Delete container | Card footer | Any draft | Own drafts with only own allocations |
| Remove single allocation | Allocation row hover | Any allocation | Own allocations only |
| Commit container | Card footer (drafts only) | Yes | **Hidden** |
| Uncommit container | OFQ card menu | **Admin only** | No |
| Archive scenario | Switcher dropdown | Yes | Own scenarios |
| Edit `cargoReady` / CBM | Grid cell | No | Own rows |

## Status badges on container cards

| Badge | When shown | Notes |
|---|---|---|
| `draft` | status='draft' | Default for drafts |
| `committed` | status='committed' | With OFQ reference inline |
| `stale` ⚠ | Any allocation in a draft now exceeds global availability (derived) | Disables Commit |
| `empty` | Container has zero allocations | Implicit; no special styling needed |

---

# Edge cases

**Factory clicks Empty on internal's draft that has her allocations + another factory's allocations** (when we eventually add a second factory):
- Button is disabled. Tooltip: *"This container contains allocations you don't own. Only internal can empty it."*

**Factory tries to drag a non-own PO** — can't happen; her grid is filtered to own rows.

**Internal commits a container in scenario A; scenario A also has another draft with no conflict** — that other draft is unaffected (no stale flag). It stays editable.

**Internal opens the Commit modal but a factory adds an allocation in real time** — the modal's summary line updates (or warns on confirm if the totals changed since opening). Implementation detail; acceptable to refresh-and-retry for MVP.

**Two scenarios use the same PO line in different drafts; one commits first** — the loser goes stale as in Scene 5. No transaction-time interlock needed; the invariant is a derived flag, not a constraint.

**Container has zero allocations and user clicks Commit** — button is disabled; tooltip: *"Cannot commit an empty container."*

**Container has allocations whose `shipTo` doesn't match the container's destination** — cannot happen; the allocation modal blocks the drop at the destination boundary.

---

# Open UX questions (track these)

1. **Stale resolution shortcut**: should the stale badge include a one-click *"Remove conflicting allocations"* button, or always require manual edit? Suggest: include the shortcut, but with confirmation.
2. **Scenario archive vs delete**: archive (recoverable) vs hard delete (gone). Recommend default to archive; admin-only hard delete.
3. **Committed container display order**: chronological (most recent first), grouped by destination, or by OFQ reference? Probably chronological with destination as a secondary group label.
4. **Factory toast on commit**: *"3 of your lines were booked into OFQ-XYZ"* — useful, but how often does it fire if internal commits a 10-line container with 6 of factory's POs? Probably one toast per commit, not per line.
5. **Forking when the source scenario is empty** — should it be allowed (creates an empty new scenario, same as Add Scenario) or blocked (the Add Scenario button covers that case)? Lean toward blocking; force users into one verb per intent.
