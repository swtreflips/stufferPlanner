# CONTCONFIG.md — Container Planning Model

Canonical design doc for how containers, allocations, and OFQs work in the Stuffer Planner. Supplements [CLAUDE.md](CLAUDE.md). Implemented across Phases 4–7.5.

---

## What you're doing

You build Ocean Freight Quotes (OFQs). Each OFQ is **one container's worth of decision**: "we're booking this container with these specific PO lines, these specific quantities." OFQs are committed **incrementally** — one at a time, on different days, as decisions firm up.

Before committing, you arrange and re-arrange POs across containers in a **shared, live planning view**. This replaces the current workflow of emailing Excel files back and forth — everyone (admin, internal, factory) sees the same draft state in real time.

The system has two jobs:

1. **Replace the Excel ping-pong** with a single, live, shared planning state.
2. **Resolve OFQ ambiguity at commit time** by recording the exact line items + quantities that ship in each OFQ. No more "wait, did we already use this PO?" — leftovers stay visible on the master grid.

---

## The model — three concepts

### 1. Master Items

PO lines from the CSV / API push. Each has `originalQuantity` and `committedQuantity`. **Only commit moves `committedQuantity`** (upward); uncommit reverses it.

### 2. Containers

Every container has a `status`:

- **`draft`** — being arranged. Editable by anyone.
- **`committed`** — locked. Has an `ofqReference`. The container's allocations have decremented master `committedQuantity` globally. **This is an OFQ.**

A container is bound to a `destination` and a `type` (20GP / 40GP / 40HC / 45HC) at creation.

### 3. Allocations

A `{containerId, masterItemId, quantity}` triple. The unit of "which cases go in which container." Stays attached to the container even after commit — it's the historical record of what shipped.

There are **no scenarios, no forks, no signatures**. One shared world.

---

## Availability math

```
available(item) =
    item.originalQuantity
  − item.committedQuantity
  − sum(allocations.quantity for DRAFT containers targeting this item)
```

The grid shows this number. When it hits 0 the row dims. When `committedQuantity === originalQuantity`, the row disappears entirely — the PO has fully shipped, nothing left to plan.

---

## The verbs — four operations

| Verb | What it does | Who can do it |
|---|---|---|
| **Allocate** | Place qty of a master item into a draft container (or merge into an existing allocation for the same item in the same container) | Anyone |
| **Empty** | Remove all allocations from one draft container | Anyone |
| **Commit** | Flip status `draft → committed`, record `ofqReference`, decrement `committedQuantity` on each affected master item | Admin / Internal |
| **Uncommit** | Reverse a commit: restore master quantities, flip back to draft, null the OFQ reference | Admin only |

Supporting CRUD: create container, delete (draft) container, remove or edit allocation. The four verbs above are the load-bearing ones.

---

## Walkthrough — the typical day

PO X has 2000 cases.

1. **Internal** creates Container A (40HC, Simi Valley) and drags PO X (allocate 1200). Grid shows: original=2000, committed=0, available=800.
2. **Internal** creates Container B (40HC, Simi Valley) and drags PO X (allocate the remaining 800). Available drops to 0; the row dims.
3. **Internal** clicks **Commit** on Container A → modal asks for OFQ reference → types `OFQ-2026-014` → confirms. Container A flips to committed; master `committedQuantity` for PO X = 1200; Container A is now pinned at the top of the tray with the OFQ ref visible.
4. **Internal** commits Container B as `OFQ-2026-015`. Master `committedQuantity` = 2000; row disappears from the grid. PO X is fully shipped.
5. Some operational change comes up — Internal needs to uncommit Container A. **Admin** clicks **Uncommit**. Container A reverts to draft; `committedQuantity` drops back to 800; the PO X row reappears in the grid with available = 0 (still allocated in draft); user can now edit Container A as needed.

No scenarios involved. No forks. The current state is what's true; everyone sees it.

---

## Walkthrough — splitting a multi-item PO across containers

PO Y has two line items: Line 1 (300 cases) and Line 2 (700 cases). You want to ship them in two different OFQs.

1. Create Container P (line 1 only, 300 cases). Commit as `OFQ-2026-016`.
2. Create Container Q. Drag PO Y line 2 in (700 cases). Commit as `OFQ-2026-017`.
3. Master grid: line 1 has committed=300, available=0, hidden. Line 2 has committed=700, available=0, hidden. Both lines are out of the planning pool.

This is the OFQ ambiguity fix you wanted: each commit records line + qty, so there's no more "the PO was partially assigned but I forgot which part."

---

## Schema (target shape; Phase 12 lands as Postgres)

```sql
create table master_items (
  id              text primary key,
  document_number text not null,
  line_id         integer not null,
  sku             text not null,
  name            text not null,                  -- vendor
  ship_to         text not null,
  date_issued     timestamptz,
  requested_ship_by timestamptz,
  cargo_ready     timestamptz,                    -- factory-editable
  status          text,
  cbm_per_case    numeric(10,4),
  cbm_total       numeric(12,4),
  etd_days        integer,
  eta             timestamptz,
  original_quantity   integer not null check (original_quantity >= 0),
  committed_quantity  integer not null default 0 check (committed_quantity >= 0),
  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint committed_le_original check (committed_quantity <= original_quantity)
);

create table containers (
  id            uuid primary key default gen_random_uuid(),
  status        text not null check (status in ('draft','committed')),
  name          text not null,
  type          text not null check (type in ('20GP','40GP','40HC','45HC')),
  destination   text not null,
  display_order integer not null default 0,
  ofq_reference text,
  committed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint draft_or_committed check (
    (status = 'draft'     and ofq_reference is null and committed_at is null) or
    (status = 'committed' and ofq_reference is not null and committed_at is not null)
  )
);

create table container_allocations (
  id              uuid primary key default gen_random_uuid(),
  container_id    uuid not null references containers(id) on delete cascade,
  master_item_id  text not null references master_items(id),
  quantity        integer not null check (quantity > 0),
  display_order   integer not null default 0,
  created_at      timestamptz not null default now()
);

create index on container_allocations(container_id);
create index on container_allocations(master_item_id);
```

Notice what's not there: no `scenarios`, no `created_by` / `committed_by`, no `factory_name` siloing columns.

---

## Backend operations (Phase 12)

Two RPCs are enough; everything else is CRUD.

```sql
create function commit_container(container_id uuid, ofq_ref text) returns void;
create function uncommit_container(container_id uuid) returns void;
```

`commit_container` in one transaction:
1. Sum allocations grouped by `master_item_id`; increment `master_items.committed_quantity`.
2. Update container: `status = 'committed'`, `ofq_reference`, `committed_at = now()`.

`uncommit_container` is the inverse.

---

## RLS / multi-role

Strict simplicity:

| Table | admin | internal | factory |
|---|---|---|---|
| `master_items` | full r/w | read all; no write to PO data | read all; UPDATE `cargo_ready`, `cbm_per_case`, `cbm_total` only on rows where `name = profiles.factory_name` |
| `containers` (any status) | full r/w; commit/uncommit | full r/w; commit only (no uncommit) | read all; INSERT (draft); UPDATE (draft, non-commit fields); DELETE (draft); no commit/uncommit |
| `container_allocations` | full r/w | full r/w | full r/w on rows in draft containers |

Everyone sees the same world. The social convention is *"internal has priority for arrangement; factories only rearrange when necessary."* The system permits any role to arrange because that flexibility is rarely abused and lets factories self-serve when internal isn't around.

---

## Frontend store

```ts
interface PlannerStore {
  masterItems: MasterItem[]
  containers: Container[]                 // both draft and committed
  allocations: Allocation[]

  // Container lifecycle
  createContainer(args: { name; type; destination }): Promise<void>
  deleteContainer(id: string): Promise<void>
  emptyContainer(id: string): Promise<void>
  commitContainer(id: string, ofqRef: string): Promise<void>
  uncommitContainer(id: string): Promise<void>

  // Allocation lifecycle
  addAllocation(input: { containerId; masterItemId; quantity }): Promise<Allocation>
  // ^ merges if (containerId, masterItemId) already exists
  updateAllocation(id, quantity): Promise<void>
  removeAllocation(id): Promise<void>

  // Dialog UI state
  allocationDialog: { open; mode: AllocationDialogMode | null }
  commitDialog: { open; containerId: string | null }
  openAllocationDialog(mode): void
  closeAllocationDialog(): void
  openCommitDialog(containerId): void
  closeCommitDialog(): void

  // Derived
  availableQty(masterItemId: string): number
  containersHoldingItem(masterItemId: string): Container[]
}
```

---

## UX

- **One shared tray.** Committed containers pin at the top (with OFQ reference + commit date). Drafts below. No scenario switcher.
- **Add container** at the bottom: destination dropdown (distinct `shipTo` values), type select.
- **Container card actions**: *Empty* (drafts with allocations) · *Delete* (drafts, two-click confirm) · *Commit OFQ* (drafts, admin/internal only) · *Uncommit* (committed, admin only).
- **Allocation modal** opens on drag-drop and on click-to-edit. Shows: original, committed, allocated-in-drafts, available-for-this-draft. Numeric input bounded by `available + (editing ? existing : 0)`.
- **Commit modal** asks for the OFQ reference (free text — your freight forwarder gives you the real number) and lists every allocation being locked in, with totals and effective cargo-ready date.
- **Grid** shows the master items with `Available` and `Committed` columns. Rows where available=0 dim. Rows where committed=original disappear.

---

## What this model does not do (intentionally)

- **No branching / scenarios / forks.** Variations are explored by emptying a container and re-arranging it in place.
- **No "who did what" signatures.** Real-time presence (Phase 12) is enough; an audit trail is over-engineering for the current workflow.
- **No per-factory siloing of the planning view.** The shared view *is* the value proposition. Factory write access to master fields is still siloed (`cargo_ready` / CBM on own rows only).

---

## Open questions

- **OFQ reference format**: free text (current design — your forwarder controls it). Add validation later only if patterns emerge.
- **Empty container UX**: currently a single-click action. Consider a one-step confirm if users empty by accident.
- **Uncommit gating**: admin-only today. Loosen to internal if the team grows and admin becomes a bottleneck.
- **Cross-container reorder** (Phase 6) — drag an allocation from Container A to Container B without going through the modal.
