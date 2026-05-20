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

## Identity & RLS

User identity is anchored on three tables: `suppliers`, `profiles`, and the existing `auth.users` (Supabase Auth).

```sql
create table suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,         -- "Ditar S.A", "Tejaswi Plastic Pvt Ltd."
  created_at timestamptz not null default now()
);

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null unique,
  display_name text not null,              -- "Mike", "Michelle", "Prasad"
  role         text not null check (role in ('admin','internal','factory')),
  supplier_id  uuid references suppliers(id),
  created_at   timestamptz not null default now(),
  constraint factory_has_supplier check (
    (role = 'factory' and supplier_id is not null) or
    (role in ('admin','internal') and supplier_id is null)
  )
);

alter table master_items add column supplier_id uuid not null references suppliers(id);
alter table containers   add column committed_by uuid references auth.users(id);
```

### Why a `suppliers` table (not domain mapping)

Some suppliers — like Tejaswi's user on `prasad.tejaswiplastic@gmail.com` — use free email domains shared with millions of unrelated accounts. Domain → supplier mapping is unreliable. Explicit `profile.supplier_id` is the only safe answer. Bonus: supplier renames are one row update, and RLS becomes a clean uuid join instead of string matching.

### Permissions matrix

| Table | admin | internal | factory |
|---|---|---|---|
| `master_items` | full r/w | read all; no write to PO data | read **own supplier only**; UPDATE `cargo_ready`, `cbm_per_case`, `cbm_total` only on rows where `supplier_id = profile.supplier_id` |
| `containers` (any status) | full r/w; commit/uncommit | full r/w; commit only (no uncommit) | read **own supplier only** (`supplier_id = profile.supplier_id`); INSERT draft (supplier auto-bound to own); UPDATE (draft, non-commit fields); DELETE (draft); no commit/uncommit |
| `container_allocations` | full r/w | full r/w | full r/w on rows in own-supplier draft containers |

Containers follow the same supplier-scoping rule as `master_items`. A factory never sees another supplier's containers (drafts or committed OFQs) — visibility, the AddContainer dialog, and the cross-container drag/drop all enforce it. Admin/Internal see everything; the tray clusters containers by supplier with section labels so the universe stays scannable. The social convention remains *"internal has priority for arrangement; factories only rearrange when necessary."*

### Commit signatures

`containers.committed_by` is set by the `commit_container(uuid, text)` RPC **server-side** using `auth.uid()`, not client-supplied:

```sql
update containers
set status = 'committed',
    ofq_reference = $2,
    committed_at = now(),
    committed_by = auth.uid()
where id = $1 and status = 'draft';
```

This makes the signature tamper-resistant. `uncommit_container(uuid)` (admin only) nulls `committed_by` along with the other commit fields and reverses the master `committed_quantity` deltas.

### Sample RLS policies for `master_items`

```sql
create policy master_items_read on master_items for select using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin','internal')
        or (p.role = 'factory' and p.supplier_id = master_items.supplier_id)
      )
  )
);

create policy master_items_factory_update on master_items for update using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and p.role = 'factory'
      and p.supplier_id = master_items.supplier_id
  )
);
```

Column-level write restriction (factory can only touch `cargo_ready`, `cbm_per_case`, `cbm_total`) lives in a BEFORE UPDATE trigger that rejects writes to other columns when the caller's role is `factory`.

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

## Container codes

Every container carries an immutable code minted at creation: **`<SUP><NNNN>`**.

- `<SUP>` — 2-letter supplier code (e.g. `DT` for Ditar S.A, `TP` for Tejaswi Plastic Pvt Ltd.).
- `<NNNN>` — zero-padded monotonic sequence per supplier (`0001`, `0002`, `0003`, …).

Examples: `DT0001`, `DT0002`, `TP0001`.

Codes are the **stable IDs** for shipping references in email, paperwork, conversation. The `name` field stays as a friendly nickname; the `code` never changes. Destinations don't influence the code — the container's destination is still bound at creation and enforced for allocations, but it's not encoded in the ID. This keeps the code short and avoids any city-name collision problem (Simi Valley vs San Vicente both deriving to "SV", etc.).

### Resolving the supplier segment

The supplier code lives on the `suppliers` table (`code` column, 2 letters, unique). Seeded for samples; admins set the code at supplier creation in production.

### Sequence policy: monotonic per supplier

Deleting a draft container does **not** free up its number. If `DT0002` is deleted, the next new Ditar draft is `DT0003`. References to `DT0002` in external systems will never silently point at a different container.

The sequence is stored in `container_sequences(supplier_code, next_number)` (Phase 12) with atomic increment via the `next_container_code(supplier_code)` Postgres function. Local-dev keeps it in the store as `containerCodeSequences: Record<supplierCode, number>`.

### Supplier binding

Containers gain `supplier_id` at creation. **Only that supplier's POs can be allocated** into the container — destination match + supplier match, both enforced at drop time and via the `eligibleContainersForMasterItem` selector.

This means mixed-supplier containers are blocked by construction — matching the OFQ semantics where one container ships one supplier's goods.

---

## Allocation entry points

Three paths converge on the same `addAllocation` action:

1. **Drag a row from the master grid** onto a draft container. Destination + supplier must match.
2. **Double-click a row in the master grid** → opens AllocationDialog with a container picker. The picker lists draft containers whose destination AND supplier match the row; auto-selects the first; user adjusts as needed.
3. **Click an existing allocation card** → AllocationDialog in edit mode (change qty or remove).

All three acquire the master-item lock at entry and release on dialog close (drag + click-to-edit) or on cancel.

Cross-container moves (drag an allocation card to a different container) also enforce destination + supplier match.

---

## Live editing & presence

Once two or more users see the same shared world, conflicts get noisy fast — internal allocates a row while a factory drags it away. The model handles this with **per-master-item pessimistic locks** broadcast as live presence:

- **Lock key**: `master:<masterItemId>`. Locking happens at the master item level (not allocation level) because the conflict is always about quantity availability for that PO line.
- **Lifecycle**: lock acquired on `onDragStart` of a grid row, on `onDragStart` of an allocation card, or on click-to-edit an allocation. Released on `onDragCancel`, on invalid drop, or on `AllocationDialog` close (whether confirmed or cancelled). The lock is held through the modal — drag → drop → modal counts as one transaction.
- **TTL + heartbeat**: locks expire 60s after acquisition. Active holders refresh every 20s via heartbeat. A 5s sweeper removes expired entries — covers tab-close / laptop-shut without leaking locks.
- **Re-entrance**: same `(userId, sessionId)` can re-acquire its own lock idempotently. Same user in two tabs counts as different sessions — predictable for QA.

Transport:
- **Local dev**: `BroadcastChannel('stuffer-planner-presence')` — cross-tab on the same browser. Sub-millisecond, native API.
- **Phase 12**: swap the channel internals for Supabase Realtime Presence. Lock entries are ephemeral — they never hit Postgres. The `commit_container` RPC stamps `committed_by` server-side via `auth.uid()`; that's the durable history.

Message protocol (`PresenceMessage` in [src/types/lock.ts](src/types/lock.ts)):

```ts
type PresenceMessage =
  | { type: 'lock-add'; lock: LockEntry }
  | { type: 'lock-remove'; resourceId; sessionId }
  | { type: 'lock-refresh'; resourceId; sessionId; expiresAt }
  | { type: 'snapshot'; locks: LockEntry[] }
  | { type: 'snapshot-request' }
```

UX:
- Locked grid row → drag handle replaced with a `LockedAvatar` (colored circle + initial); hover tooltip names the editor.
- Locked allocation card → tinted background + LockedAvatar chip top-right; click-to-edit disabled; drag disabled.
- Click on a locked allocation → inline coral toast on the container card: *"{Name} is editing this row — try again in a moment"* (auto-dismisses in 3s).
- Holder sees no special treatment — the active drag UX or open modal **is** the lock.

User colours come from [src/utils/userColor.ts](src/utils/userColor.ts) — a small hardcoded mapping for seeded sample users plus a deterministic hash fallback. Predictable across tabs and sessions.

---

## Cross-container moves

Allocations are draggable. Drop an allocation card on a different container card → the allocation's `containerId` updates (subject to the same destination-match rule as new allocations). If the target container already holds an allocation against the same master item, the move **merges** quantities into the existing allocation rather than creating a duplicate row.

Same-container drop is a no-op (within-container reorder is a Phase 6 follow-up). dnd-kit's 8px activation distance separates click-to-edit from drag-to-move on allocation cards — no extra UI affordance needed.

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
