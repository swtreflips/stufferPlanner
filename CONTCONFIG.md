# CONTCONFIG.md — Container Planning Model

The canonical design for how containers, scenarios, and PO allocations work in the Stuffer Planner. Supplements [CLAUDE.md](CLAUDE.md). Implemented progressively across Phases 4–8.

---

## What you're doing

You build Ocean Freight Quotes. Each OFQ is **one container's worth of decision**: *"we're booking this container with this set of POs."* OFQs are committed **incrementally** — one at a time, on different days, as POs become ready and decisions firm up. Waiting to commit everything in a batch costs time.

Between commits, you explore alternatives — especially when one PO is big enough to anchor a container but only fills part of it (*"does it pair better with these smaller POs or those?"*).

The system has two jobs:

1. Make **committing one container at a time** the fast, natural path.
2. Make **exploring alternatives before committing** cheap and safe.

---

## The model — three concepts

### 1. Master Items

PO lines from the CSV/API. Each one has `original_quantity` and `committed_quantity`. **`committed_quantity` only goes up.** Nothing else mutates them except commit.

### 2. Containers — first-class, with a status

Every container is one of:

- **`draft`** — being explored. Belongs to exactly one **Scenario**. Allocations on it are hypothetical.
- **`committed`** — locked. Lives globally (no scenario). Has an `ofq_reference`. Its allocations have decremented master availability. **This is an OFQ.**

Status is a one-way ratchet: `draft → committed`. Uncommit is a separate, audited operation.

### 3. Scenarios — lightweight branches for drafts only

A Scenario is a folder for draft containers. That's all. No commit semantics, no nested configs. It exists so that draft containers in Scenario A don't poison the availability view in Scenario B.

```
  committed containers (global)  ◄──── always visible everywhere
  ─────────────────────────────
  Scenario "Main"
    Draft container 1
    Draft container 2
  ─────────────────────────────
  Scenario "Alt-OptB"
    Draft container 3
```

When viewing Scenario "Main," availability = `original - committed - sum(drafts in Main)`. Switch to "Alt-OptB" and it recomputes against that scenario's drafts.

---

## Availability math

```
available_in(scenario, item) =
    item.original_quantity
  - item.committed_quantity
  - sum(allocations.quantity
        for draft containers IN scenario
        targeting item)
```

Committed containers globally reduce. Draft containers only reduce within their scenario's view.

---

## The verbs — five operations

| Verb | What it does | Scope |
|---|---|---|
| **Allocate** | Place qty of a master item into a draft container | one container |
| **Empty** | Remove all allocations from a draft container | one container |
| **Commit** | Flip status `draft → committed`, decrement master, record OFQ | one container |
| **Fork scenario** | Deep-copy a scenario's draft containers into a new scenario | one scenario |
| **Delete** | Hard-remove a draft container or empty scenario | one entity |

That is the entire verb set. Every workflow composes from these.

---

## Walkthrough 1 — the simple incremental case (no forks)

Monday morning. Default scenario "Main" is selected.

1. Create Container A in Main, type 40HC.
2. Drag PO lines into it.
3. Click **Commit** → modal asks for OFQ reference → OFQ-2026-014 created. Container A is now `committed`, globally visible, no longer in Main's draft list.
4. Master availability shrinks accordingly.

Tuesday afternoon. Same pattern: create Container B, allocate, commit → OFQ-2026-015.

**This is 90% of the workflow.** No scenarios needed beyond the default. No forks. Just allocate-and-commit.

---

## Walkthrough 2 — the exploration case (POCORE + OptA vs OptB)

POCORE × 800, OptA × 200, OptB × 200. POCORE is the anchor; compare pairings.

1. In Main: create Container X, allocate POCORE × 800 + OptA × 200.
2. Available in Main: POCORE = 0, OptA = 0, OptB = 200.
3. Want to compare against OptB. **Fork** Main → new scenario *"Alt-OptB"*. Container X is duplicated as X′.
4. In Alt-OptB: **Empty** Container X′ (drops its allocations in this scenario only). Re-allocate POCORE × 800 + OptB × 200.
5. Flip between Main and Alt-OptB to compare.
6. Decide Main wins. Switch to Main, **Commit Container X** → OFQ-2026-016.
7. Master state: POCORE.committed = 800, OptA.committed = 200.
8. Alt-OptB now has a draft (X′) whose POCORE allocation is impossible (`POCORE.available_globally = 0`). X′ is flagged **stale**.
9. User deletes Alt-OptB, or rebuilds X′.

Exploration is local to scenarios; commits are global. Both coexist without contradicting each other.

---

## Cross-scenario invalidation — derived, not stored

When a container commits, drafts in other scenarios may become impossible:

- It's a query, not stored state: `available_globally(item) < 0` implies any draft allocation against it is stale.
- Run on scenario switch, on commit, on demand.
- UI surfaces stale drafts with an amber badge and a tooltip: *"POCORE was committed elsewhere — this draft is impossible. Empty or delete."*
- **Never auto-mutate user data.** The user knows their intent better than the system does.

This is the only cross-cutting rule in the system and it's read-only logic. No transactions, no cascades, no cleanup jobs.

---

## Schema

```sql
create table scenarios (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  parent_id   uuid references scenarios(id),     -- "forked from", nullable
  created_by  uuid references auth.users(id),    -- signature
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table master_items (
  id              text primary key,
  document_number text not null,
  line_id         integer not null,
  sku             text not null,
  name            text not null,                  -- vendor / factory
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
  scenario_id   uuid references scenarios(id),    -- NULL iff committed
  name          text not null,
  type          text not null check (type in ('20GP','40GP','40HC','45HC')),
  destination   text not null,
  display_order integer not null default 0,
  ofq_reference text,                             -- populated on commit
  committed_at  timestamptz,
  committed_by  uuid references auth.users(id),   -- populated on commit
  created_by    uuid references auth.users(id),   -- signature
  created_at    timestamptz not null default now(),
  constraint draft_has_scenario check (
    (status = 'draft'     and scenario_id is not null and ofq_reference is null and committed_at is null and committed_by is null) or
    (status = 'committed' and scenario_id is null     and ofq_reference is not null and committed_at is not null and committed_by is not null)
  )
);

create table container_allocations (
  id              uuid primary key default gen_random_uuid(),
  container_id    uuid not null references containers(id) on delete cascade,
  master_item_id  text not null references master_items(id),
  quantity        integer not null check (quantity > 0),
  display_order   integer not null default 0,
  created_by      uuid references auth.users(id),    -- signature
  created_at      timestamptz not null default now()
);

create view scenario_item_availability as
select
  s.id as scenario_id,
  m.id as master_item_id,
  m.original_quantity
    - m.committed_quantity
    - coalesce((
        select sum(a.quantity)
        from container_allocations a
        join containers c on c.id = a.container_id
        where c.status = 'draft'
          and c.scenario_id = s.id
          and a.master_item_id = m.id
      ), 0) as available
from scenarios s
cross join master_items m;
```

Note what's **not** there: no `plans` table, no `configurations` table, no `active_config_id`, no `committed_config_id`, no `committed_quantity` on containers (commit is a status flip, not a denormalized count).

---

## Backend RPCs

Three functions. Everything else is plain CRUD.

```sql
-- 1. Fork a scenario: deep-copy all draft containers + allocations.
create function fork_scenario(source_id uuid, new_name text) returns uuid;

-- 2. Commit a container: status flip + master decrement + OFQ tagging.
create function commit_container(container_id uuid, ofq_ref text) returns void;

-- 3. Uncommit a container: the inverse. Audit log entry mandatory.
create function uncommit_container(container_id uuid, reason text) returns void;
```

`commit_container` body, sketched:

```sql
update master_items m
set committed_quantity = committed_quantity + a.quantity
from container_allocations a
where a.container_id = $1 and a.master_item_id = m.id;

update containers
set status = 'committed',
    scenario_id = null,
    ofq_reference = $2,
    committed_at = now()
where id = $1 and status = 'draft';
```

One transaction. No cascade through other scenarios. Stale drafts surface via the view; they're a UI concern, not a backend write.

---

## RLS / multi-role — siloed collaboration

Factories **do** participate in planning, but with strict siloing: a factory only ever sees its own work and the slices of internal's work that touch its POs. Factories never see other factories' POs, allocations, scenarios, or drafts. Total siloing is preserved.

The rules:

| Table | admin / internal | factory |
|---|---|---|
| `master_items` | full r/w | SELECT where `name = profiles.factory_name`; UPDATE only `cargo_ready`, `cbm_per_case`, `cbm_total` on those rows |
| `scenarios` | full r/w | SELECT where `created_by = self` **OR** any container in the scenario contains an allocation against one of factory's POs. INSERT own. No DELETE on others. |
| `containers` | full r/w; commit/uncommit | SELECT where `created_by = self` **OR** the container has at least one allocation against a factory PO. INSERT (draft only). DELETE only own draft containers that contain only own allocations. No commit/uncommit. |
| `container_allocations` | full r/w | SELECT where `master_item_id` is a factory PO. INSERT where `master_item_id` is a factory PO **and** the parent container is a draft. DELETE own allocations where the parent container is a draft. |

The key invariant: **each `container_allocation` row is independently filtered by the master item's factory ownership.** A factory inside a mixed container sees only her own allocation rows — Factory B's allocations in the same container are simply not returned by Postgres. The container itself is visible (it has at least one of her allocations) but she can't browse what else is inside it.

### Walkthrough — mixed draft container

Internal creates draft Container X in scenario "Main" with two allocations: Factory A × 100 and Factory B × 200.

- **Internal** sees Container X with both allocations.
- **Factory A** sees Container X exists; sees her 100; does not see Factory B's 200.
- **Factory B** sees Container X exists; sees her 200; does not see Factory A's 100.
- Either factory can **add** her own allocations to Container X (the container is a draft).
- Neither factory can remove the other's allocation, edit the container's name/type, or commit it.
- Internal commits → both factories see the committed OFQ with their own line in it; cross-factory data remains hidden.

### Walkthrough — factory's own scenario

Factory A creates her own scenario "A's idea", with Container Y containing only her POs.

- **Internal** sees the scenario and the container with all its contents (created_by = Factory A).
- **Factory A** sees her scenario and container normally.
- **Factory B** sees nothing — the scenario has no allocations referencing her POs and she didn't create it.
- Internal can fork the scenario, modify, or commit Container Y directly to produce an OFQ.

---

## Provenance (signatures)

Every `scenario`, `container`, and `container_allocation` row carries `created_by` referencing `auth.users(id)`. Committed containers additionally carry `committed_by` for OFQ audit.

UI surface:

- **Scenario card**: *"forked from X · created by [name]"*.
- **Container header**: *"draft by [name]"* or *"OFQ-2026-014 · committed by [name]"*.
- **Allocation card**: small chip showing creator name (factory name or internal user). When internal reviews a draft, who-suggested-what is visible at a glance.

For factory-created rows the displayed name is the factory name (from `profiles.factory_name`). For internal/admin, the user's display name.

---

## Frontend store

```ts
interface PlannerStore {
  masterItems: MasterItem[]
  scenarios: Scenario[]
  containers: Container[]                 // both draft and committed in one collection
  allocations: Allocation[]

  currentScenarioId: string               // null = "no scenario", just committed view

  // Derived
  availableQty(scenarioId: string, masterItemId: string): number
  staleDrafts(): Container[]

  // Verbs
  allocate(containerId: string, masterItemId: string, qty: number):
    | { ok: true }
    | { ok: false; reason: 'insufficient'; available: number }
  emptyContainer(containerId: string): void
  forkScenario(name: string, sourceId?: string): Promise<string>
  commitContainer(containerId: string, ofqRef: string): Promise<void>
  uncommitContainer(containerId: string, reason: string): Promise<void>
}
```

Five verbs, each with one clear contract.

---

## UX

- **Top-of-tray scenario switcher.** A simple dropdown. Default scenario "Main" always exists and can't be deleted. New scenarios appear with a `forked from X` lineage label.
- **Committed containers pinned at the top of the tray**, in every scenario view, read-only, with their OFQ reference visible. They're reality — they don't disappear when you change scenarios.
- **Draft containers below**, under the current scenario, with edit controls. *Empty / Delete / Commit* per card.
- **Stale badge** on drafts where global availability has gone negative; tooltip names the offending master item.
- **Commit confirmation modal** prompts for the OFQ reference (and lists the allocations being consumed).
- **No side-by-side comparison view in MVP.** Flipping the dropdown is enough. Side-by-side comes later if needed.

---

## Design principles

The whole model rests on one test: **can the user always predict what their click will do, and does each verb solve one problem cleanly?**

- Allocate → puts cases in a container.
- Empty → removes cases from a container.
- Commit → ships a container (creates an OFQ).
- Fork → duplicates an exploration to vary it.
- Delete → cleanup.

Every workflow composes from these. No verb takes a flag that changes its kind. No verb secretly triggers another verb. No verb's name leaves the user guessing about scope.

---

## Implications for CLAUDE.md

Sections needing alignment with this model:

1. **Permissions matrix** — factories CAN create scenarios, draft containers, and allocations against their own POs (with siloing). They cannot commit/uncommit.
2. **Phase 4** — containers start empty; destination + type at creation; `created_by` recorded.
3. **Phase 5.5** — allocation modal writes to a draft container; factory allocations gated to own PO lines.
4. **Phase 5.6** — **"Scenarios and Exploration"**: scenario switcher, fork, empty. Factories can fork too; siloing applies to the resulting visibility.
5. **Phase 7.5** — "Commit Container" with OFQ reference; per-container, not per-plan. Admin/Internal only.
6. **Phase 12 schema** — tables `master_items`, `scenarios`, `containers`, `container_allocations`, `profiles`. RLS as in this doc.

---

## Open questions

1. **OFQ reference format** — free-text (the freight forwarder's number, typed in) or system-generated (`OFQ-YYYY-NNN`)? Lean toward free-text since the real OFQ number originates externally.
2. **Uncommit audit** — admin-only with a mandatory reason string? Recommend yes.
3. **Scenario lifetime** — auto-archive after idle period, or pure manual? Manual is simpler; revisit only if scenario clutter becomes a real problem.
4. **Container destination binding** — bound at creation (recommended; mixing destinations in one container is almost always a bug).
5. **Empty container while stale-badged** — clear badge instantly, or wait for re-check? Instant is fine; it's derived state.
