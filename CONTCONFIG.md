# CONTCONFIG.md -- Container Configuration Model

This document specifies how container configurations, quantity allocation, and commit
semantics work in the Stuffer Planner. It supplements [CLAUDE.md](CLAUDE.md) and
should be implemented across Phases 4-8 (with revisions to the existing phase plan --
see "Implications for CLAUDE.md" at the end).

---

## Core Concepts

| Concept            | Definition                                                                                          |
|--------------------|-----------------------------------------------------------------------------------------------------|
| **Container**      | A physical shipping unit bound to a single **destination** (e.g. "Simi Valley, CA").                |
| **Configuration**  | A snapshot/proposal of how PO lines fill one container. A container may hold multiple configurations side-by-side as alternatives. |
| **Allocation**     | Within a configuration: a (PO line, quantity) pair. Quantity may be partial.                        |
| **Active config**  | The configuration currently being viewed for a given container. Only one active per container.      |
| **Committed config** | The configuration declared final. At most one per container. Commits consume PO quantities from the master dataframe baseline. |

A container is a **vessel for proposals**. Configurations are **alternatives within
that vessel**. Commit promotes one alternative to reality.

### Worked example (from `stufferplannertemplate.csv`)

The sample CSV's `Column1` field illustrates the concept. Two configurations are
encoded on a single container:

* **Config A** = rows tagged `core` ∪ rows tagged `configA`
* **Config B** = rows tagged `core` ∪ rows tagged `configB`

The `core` rows appear in both configurations (the container always carries them;
they are not the variable). The `configA` / `configB` rows are the **alternative
fills** the user is comparing. Switching the active configuration on this container
swaps which optional rows appear; committing one of them consumes those PO
quantities and discards the other proposal.

This tagging is a **demonstration only** -- the app does not parse `Column1`. Real
configurations are user-created at runtime through the allocation modal.

---

## Destination Constraint

Containers are bound to a destination at creation. Only PO lines whose `shipTo` matches
the container's destination can be allocated into it. The grid should visually mark
ineligible rows (greyed out, not draggable) when a container is the active drop target.

---

## Quantity Allocation Flow

When a user drags a PO row from the grid into a container's active configuration:

1. A modal opens asking: **"How many cases from {available} are you assigning to {container.name}?"**
2. The modal displays:
   * Total quantity on the PO line.
   * Quantity already committed elsewhere (read-only).
   * Quantity currently allocated in *this* draft configuration (if user is editing).
   * **Maximum allocatable** = `totalQty - committedConsumed - alreadyInThisConfig`.
3. User enters a number. Validation: `1 <= n <= maxAllocatable`.
4. On confirm: an `Allocation` is added to the active configuration.
5. The grid view updates immediately (see "Master Dataframe View Modes" below).

Editing or removing an allocation: clicking a row inside a container reopens the modal
with the current quantity pre-filled. Setting quantity to 0 (or a "Remove" button)
deletes the allocation.

---

## Master Dataframe View Modes

The master shipment grid (right panel) renders **derived** data. The underlying
PO quantities are never mutated except by commit.

**Mode 1 -- Hypothetical view (default during planning):**

For each PO row, displayed remaining quantity is:
```
displayed = totalQty - committedConsumed(row) - activeConfigAllocation(row)
```
Where `activeConfigAllocation` sums allocations from the currently-viewed
configuration of the currently-focused container. If `displayed == 0` the row is
hidden (or visually collapsed) for that snapshot. The base data is unchanged --
this is pure derived state.

**Mode 2 -- Post-commit (permanent):**

When a configuration is committed:
```
committedConsumed(row) += sum of that config's allocations for (row)
```
Now `available(row) = totalQty - committedConsumed(row)` is a smaller number for all
future configurations across all containers.

**Important:** When viewing a configuration on Container A, allocations from Container
B's *uncommitted* configurations are NOT subtracted from the display. They are
hypothetical, not real. Only committed allocations reduce the baseline.

---

## Configuration Navigation

Each container card has navigation controls (arrows or tabs) at its bottom edge to:

* Cycle through existing configurations (Config A, Config B, ...).
* Add a new empty configuration.
* Delete the active configuration (if not committed).
* Show which configuration is committed (e.g. green ring + lock icon).

When the user switches the active configuration on a container, the master grid
re-renders to reflect the new hypothetical view.

---

## Commit Flow

1. User selects a configuration as the active one on a container.
2. Clicks "Commit Configuration".
3. Confirmation modal: "Committing will consume {n} cases across {m} PO lines. This
   cannot be undone except by uncommitting. Proceed?"
4. On confirm:
   * Mark configuration as `committed = true, committedAt = now()`.
   * Increment `committedConsumed(row)` for every allocation.
   * Other uncommitted configurations on this container should be flagged "stale"
     (still visible, but with a warning icon -- see Open Questions).
   * Other uncommitted configurations on *other* containers that allocated from the
     same PO lines may now be over-allocated -- they get a "needs revision" indicator.
5. Container header shows committed status and which configuration is committed.

**Uncommit / revert:** Optional but recommended. Reverses the consumption. Implementing
this becomes important the first time someone commits the wrong configuration in
production.

---

## Data Model

Proposed additions to [src/types/](src/types/):

```ts
// src/types/container.ts (revised)
export interface Container {
  id: string
  name: string
  type: '20GP' | '40GP' | '40HC' | '45HC'
  destination: string                    // matches ShipmentRow.shipTo
  configurations: Configuration[]
  activeConfigId: string                  // which config is currently displayed
  committedConfigId: string | null        // null = no commit yet
}

// src/types/configuration.ts (new)
export interface Configuration {
  id: string
  containerId: string
  name: string                            // "Config A", "Config B", ...
  createdBy: string                       // user id (admin or factory)
  createdAt: string                       // ISO timestamp
  committed: boolean
  committedAt: string | null
  allocations: Allocation[]
}

export interface Allocation {
  shipmentRowId: string
  quantity: number                        // cases assigned in this configuration
}
```

The existing `ShipmentRow` does not need new fields. The `committedConsumed` value is
derived at runtime by summing committed allocations across all containers for that
row. This avoids a denormalized field that can drift out of sync.

---

## State Management (Zustand)

Store shape:

```ts
interface PlannerStore {
  // Source of truth (mutated only on data load and commit)
  shipments: ShipmentRow[]
  containers: Container[]

  // UI state
  focusedContainerId: string | null       // which container the grid view follows

  // Actions
  createContainer(destination: string, type: ContainerType): void
  addConfiguration(containerId: string): string         // returns new config id
  setActiveConfig(containerId: string, configId: string): void
  allocate(containerId: string, configId: string, rowId: string, qty: number): void
  removeAllocation(containerId: string, configId: string, rowId: string): void
  commitConfiguration(containerId: string, configId: string): void
  uncommitConfiguration(containerId: string): void
}
```

Selectors (computed, memoized):

```ts
// How many cases of (rowId) have been committed across all containers
selectCommittedConsumed(rowId): number

// What the user currently sees for a row, given the focused container's active config
selectDisplayedRemaining(rowId): number

// Rows visible in the grid right now (hidden if displayedRemaining == 0)
selectVisibleShipmentRows(): ShipmentRow[]

// Whether a configuration is over-allocated (impossible to commit)
selectConfigStatus(containerId, configId): 'valid' | 'stale' | 'over-allocated'
```

Use **Zustand's `immer` middleware** so deep allocation updates stay readable.

---

## Stack Additions

What you have already covers most of this. Concrete additions:

### Required

| Need                              | Recommendation             | Why                                                                                  |
|-----------------------------------|----------------------------|--------------------------------------------------------------------------------------|
| Allocation modal                  | `@radix-ui/react-dialog`   | ~5 KB, fully accessible, headless (style with Tailwind). Don't roll your own.        |
| Immutable nested updates          | `immer` (Zustand middleware) | Allocation arrays nested inside configurations nested inside containers will be miserable to update without it. |
| Toast feedback (commit / errors)  | `sonner`                   | ~3 KB, no setup overhead. "Configuration committed" / "Cannot allocate -- exceeds available" messages. |

### Recommended

| Need                              | Recommendation             | Why                                                                                  |
|-----------------------------------|----------------------------|--------------------------------------------------------------------------------------|
| Confirm dialog for commit         | Same Radix Dialog          | Reuse the modal system. Don't pull in a separate confirm library.                    |
| Numeric input with bounds         | Native `<input type="number" min max>` + Tailwind | One field; no need for `react-hook-form`.                       |
| Optimistic update batching        | Already in Zustand        | Wrap multi-step operations (e.g. commit) in a single `set` call.                     |

### Phase 12 (Supabase) implications

New tables required at integration time:

* `containers`: `id, destination, type, name, committed_config_id`.
* `configurations`: `id, container_id, name, created_by, created_at, committed, committed_at`.
* `allocations`: `id, configuration_id, shipment_row_id, quantity`. Composite unique `(configuration_id, shipment_row_id)`.

RLS additions:

* Configurations are readable by all authenticated users (admin + factory).
* Configurations are writable by their creator OR admin.
* Only **admin** can commit (`UPDATE configurations SET committed = true`). Even
  though factories can propose, the act of committing is an admin-only privilege.
* Realtime subscription on `configurations` and `allocations` so committed states
  propagate to other open sessions.

---

## Implications for CLAUDE.md

This document changes things that should be reflected in [CLAUDE.md](CLAUDE.md) before
Phase 4 begins. **I have not made these edits** -- they are listed here for review.

1. **Permissions matrix needs revision.** The current matrix says factories cannot
   drag rows or add/remove containers. With this configuration model, factories
   *can* create configurations and allocate rows (to propose stuffing arrangements).
   They still cannot:
   * Create or delete containers (admin only).
   * Commit a configuration (admin only).
   * Edit any shipment column other than Cargo Ready Date.

   Suggested revised rows:

   | Capability                              | Admin | Factory |
   |-----------------------------------------|-------|---------|
   | Create / delete containers              | Yes   | No      |
   | Create configurations on a container    | Yes   | Yes     |
   | Allocate rows into a configuration      | Yes   | Yes     |
   | Commit a configuration                  | Yes   | No      |

2. **Phase 4 (Container Tray) needs to mention destinations.** A container is created
   *with* a destination, not as a generic empty box.

3. **New phases between 5 and 7:**
   * **Phase 5.5 -- Quantity Allocation Modal.** Drag-to-container opens the dialog.
   * **Phase 5.6 -- Configurations and Active Snapshot Navigation.** Multiple configs
     per container, arrow navigation, derived grid view.
   * **Phase 7.5 -- Commit Flow.** Commit / uncommit, stale-config warnings,
     over-allocation detection.

4. **Phase 8 (Export) clarification:** Export should emit only the *committed*
   configurations, not the proposals.

---

## Open Questions

These need product decisions before implementation, not technical ones:

1. **Stale config behavior on commit.** When Config A on Container X is committed,
   what happens to Config B on the same container? Auto-archive, manual-discard, or
   leave visible as historical?
2. **Cross-container over-allocation.** When committing Config A on Container X
   reduces availability such that Config Y on Container Z becomes invalid -- block
   the commit, warn-and-proceed, or silently mark Y as needing revision?
3. **Uncommit support.** Is uncommit a feature (lets admin recover from mistakes), or
   is commit truly final (forces clean discipline)? Recommendation: support it. The
   first production mistake will demand it.
4. **Configuration naming.** Auto-name (Config A, B, C) or user-named ("Plan with
   factory ditar split")? User-named is friendlier but adds a text input to the
   add-config flow.
5. **Concurrent editing.** Two users editing the same configuration: last-write-wins,
   optimistic locking, or pessimistic locking on the configuration? Affects Phase 12
   realtime design.
6. **Destination constraint enforcement.** Hard block (cannot drop) or soft warning
   (drop allowed, error shown)? Recommendation: hard block -- mixing destinations in
   one container is almost always a bug.
7. **Empty containers in export.** Do containers with no committed configuration
   appear in the exported plan, or are they skipped?

Lock these in before Phase 4 starts. Each one ripples into UI choices that are hard
to retrofit.
