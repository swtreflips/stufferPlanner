# VARIATIONS.md — Draft Views (deferred design)

**Status: NOT BUILT. Deferred by decision on 2026-07-28.**

This document records a design for parallel draft planning ("draft views") that
was considered and intentionally deferred. It exists so that if the need proves
real, the design does not have to be re-derived — and so that a future reader of
[CONTCONFIG.md](CONTCONFIG.md) ("No branching / scenarios / forks") knows the
question *was* asked and answered, not overlooked.

Do not implement any of this without an explicit decision to do so. See
"When to build this" for the trigger conditions.

> **Database names in this file predate the shared Supabase project.** The design holds; the
> identifiers moved. See [STUFFER.md](STUFFER.md) → *The canonical mapping* — in short:
> `suppliers` → `organizations` (`type='customer'`), `supplier_id` → `organization_id`,
> `master_items` → `planner_po_lines`, `containers` → `planner_containers`,
> `current_profile()` → `my_org()` / `my_org_type()` / `my_org_role()`.
> **Domain words like "supplier" and "factory" remain correct**; only SQL identifiers changed.

---

## The gap this addresses

Today there is one shared draft world. If a planner wants to explore a different
arrangement — swap items, shift quantities, split a PO across two containers
differently — they must **empty the existing draft and rebuild it**. The first
arrangement is gone. There is no way to hold two candidate plans side by side
and compare their trade-offs (this item arrives first vs. these two POs ship
together vs. this container fills better).

The workaround works. It is not a bad design. But it forces a decision before
the alternatives have been seen next to each other.

---

## The model

### Three layers, not two

```
committed containers  ──  global, absolute, view-independent
                          (the OFQs; they reduce master availability for everyone)

draft views           ──  named parallel worlds  ← NEW LAYER
                          baseline + up to 3 explorations

draft containers      ──  belong to exactly one view
```

### Views

A **draft view** is a named container of draft containers. It is a *timeline* —
one possible future — not a user's private scratchpad.

- **Global and shared.** Views belong to the environment, not to a person.
  Everyone (admin, internal, factory) sees the same set of views and can edit
  inside any of them. This is deliberate: private views would rebuild the Excel
  ping-pong the app exists to eliminate.
- **One baseline.** Exactly one view is the baseline — the live plan of record.
  It always exists, cannot be deleted or archived, and is the default view on
  load. Work continues here while variations stay open as options.
- **Explorations.** Every other view. Explicitly labeled as such. Capped (see
  "Lifecycle").

### Committed containers are view-independent

A container that commits **leaves the draft layer entirely**. It appears in the
Committed section of *every* view, because a commit is a fact about the world,
not about a plan. Its `view_id` is retained but ignored while committed — so
uncommitting returns it to the view it came from, with no null-handling dance.

This is the property that makes the whole model coherent: **views disagree about
the future, never about the past.**

---

## Availability math

The only change to the core selector is a filter:

```
available(item, view) =
    item.originalQuantity
  − item.committedQuantity                       ← global, all views agree
  − sum(allocations.quantity
        for DRAFT containers in THIS VIEW)       ← view-scoped
```

Consequences:

- Two views may both allocate the same 2000 cases of PO X. Both are valid
  hypotheticals. They do not compete.
- Within a view, the existing invariant still holds: a view's drafts are always
  **mutually consistent** — collectively realizable if committed together. This
  is the real value of a view, and the reason a simple "clone this container"
  button is not a substitute. A clone competes with its original for the same
  cases; a view does not.

---

## Realizability — the hard part

Views introduce a state the app has never had: **a draft that cannot be
committed, through no action taken inside it.**

### The invariant that bounds the problem

> A view can only become unrealizable through a **commit** in another view.
> Uncommitting can heal it. Draft activity in other views can never affect it.

This matters. It means staleness is event-driven, not continuous — a view goes
stale at discrete, observable moments, and those moments already flow through
`commitContainer` / `uncommitContainer`. It is not a background reconciliation
problem.

### States

| State | Meaning |
|---|---|
| `realizable` | Every allocation fits within `original − committed`. Commit is allowed. |
| `unrealizable` | Some allocation exceeds `original − committed` because cases were committed elsewhere. Commit is blocked. |

Computed per container and rolled up per view. Surfaced as:

- Container card: greyed, coral border, Commit button disabled with reason.
- Allocation card: the offending line flagged — *"over by 400 — committed in
  AP0007"*.
- View switcher: a coral dot on any view holding an unrealizable container.
- The fix is always one of: reduce the allocation, or uncommit the container
  that consumed the cases.

### Why this is the expensive part

Today, invalid states are **unreachable** — the allocation dialog caps input at
`effectiveCap` and the store re-checks the ceiling, so no sequence of user
actions produces an impossible container. Views change that to *invalid states
arise spontaneously and must be rendered*. That is a category change, not a
feature. It is a permanent tax on every component that displays a quantity.

Budget for it honestly. It is the majority of the work, not the availability
filter.

---

## Copy semantics

The primary way a variation is created: **copy an existing view**, then adjust
what differs. Copy what stays the same; edit what varies.

### What a copy does

- Deep-copies every **draft** container in the source view, with all of its
  allocations, quantities, type, destination, supplier binding, and operational
  capacity cap.
- Does **not** copy committed containers — those are global and already visible
  in every view.
- The copy is **always realizable at t=0**, because the source was realizable
  and no commit happened in between.

### Container codes on copy

Copied containers **mint new codes** from the normal per-supplier sequence.

This is the right call even though it burns numbers on throwaway explorations:
`<SUP><NNNN>` codes are documented as stable external references used in email
and paperwork ([CONTCONFIG.md](CONTCONFIG.md) "Container codes"). Two live
containers sharing a code is a far worse failure than a gap in the sequence.
9,999 codes per supplier is not a scarce resource.

Lineage is preserved via `copied_from_container_id` so "this is Plan B's version
of AP0007" is answerable.

### What is not copied

Locks, presence, and any transient UI state. A copy is data only.

---

## Commit and promotion

Commit remains **admin / internal only** and works exactly as it does today —
it is a global act regardless of which view it is invoked from. The container
flips to committed, master `committed_quantity` moves, and it becomes visible in
every view's Committed section.

After a commit from an exploration, sibling views may go unrealizable. Nothing
is corrected automatically.

### Promotion

When a variation wins, offer **Promote to baseline**:

1. The exploration becomes the baseline.
2. The former baseline becomes an exploration.
3. Prompt to archive the now-superseded siblings.

Promotion is a relabel, not a data migration — nothing moves. This is also the
main cleanup moment, which is why the archive prompt belongs here.

---

## Permissions

Views are shared, so the write rules are deliberately permissive; the
restrictions are only where damage is irreversible.

| Capability | Admin | Internal | Factory |
|---|---|---|---|
| See all views | Yes | Yes | Yes |
| Switch views | Yes | Yes | Yes |
| Create / copy a view | Yes | Yes | Yes |
| Edit drafts inside any view | Yes | Yes | Own supplier's containers only |
| Rename a view | Yes | Yes | Creator only |
| Archive / delete an exploration | Yes | Yes | Creator only |
| Delete the baseline | No | No | No |
| Promote a view to baseline | Yes | Yes | No |
| Commit a container (from any view) | Yes | Yes | No |
| Uncommit | Yes | No | No |

Unchanged from today: commit is admin/internal, uncommit is admin-only, and
factory write access is scoped to their own supplier.

### The factory empty-view trap

A factory sees only their own supplier's containers *within* each view. An
exploration containing no containers for their supplier will render as an empty
tray — which reads as "broken," not "nothing here for you."

Mitigation: label each view in the switcher with the count of containers
**visible to the current user**, and show an explicit empty state:
*"Plan B has no Apple Paper containers."*

---

## Locks and presence

Two changes to [CONTCONFIG.md](CONTCONFIG.md) "Live editing & presence":

1. **Lock keys become view-scoped**: `view:<viewId>:master:<masterItemId>`.
   Two users editing the same PO line in different views is not a conflict —
   they are editing independent hypotheticals. Keeping the current global
   `master:<id>` key would produce constant false-positive lock denials.

2. **Add a who's-in-which-view indicator.** With parallel worlds, "Jordan is
   working in Plan B" is load-bearing context. This is Supabase Realtime
   *Presence* (roster state), distinct from the lock protocol which rides
   *Broadcast* — as already noted in [MOCKDEPLOY.md](MOCKDEPLOY.md).

Commit / uncommit events must broadcast **globally**, not per view, since they
invalidate across views.

---

## Lifecycle and cleanup

The known cost of this feature, acknowledged up front: **secondary views
accumulate and nobody deletes them.** This is the observed failure mode of
every scenario feature in every planning tool. The app already has a related
smell — nothing ever leaves the container tray, shipped containers included.

Three mitigations, all cheap and behavioral rather than structural:

1. **Hard cap: 3 explorations** besides the baseline. The real need is two,
   occasionally three. A cap is a feature — it forces a decision instead of
   accumulating `test`, `Plan B`, `new idea`, `Plan B final`.
2. **Archive prompt on promotion.** The moment a variation wins is the moment
   its siblings became irrelevant, and the only moment anyone is thinking about
   cleanup.
3. **Stale badge.** A view untouched for 14 days, or holding an unrealizable
   container for more than a few days, gets a badge and an archive suggestion.
   Suggest, don't auto-delete.

Archive is soft (`archived_at`), not destructive. Archived views are hidden from
the switcher and readable from a "show archived" toggle.

---

## Schema

```sql
create table draft_views (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  is_baseline         boolean not null default false,
  created_by          uuid references profiles(id),
  copied_from_view_id uuid references draft_views(id),
  created_at          timestamptz not null default now(),
  last_touched_at     timestamptz not null default now(),
  archived_at         timestamptz
);

-- Exactly one baseline, ever.
create unique index draft_views_single_baseline
  on draft_views (is_baseline) where is_baseline;

alter table planner_containers
  add column view_id uuid not null references draft_views(id),
  add column copied_from_container_id uuid references planner_containers(id);

create index on planner_containers(view_id);
```

Migration path: create the baseline row first, backfill every existing container
with its id, then apply `not null`.

**RLS:** `draft_views` is readable by everyone with a profile. Insert by anyone.
Update/delete gated per the permissions table above (`created_by = auth.uid()`
for factory, admin/internal otherwise; `is_baseline` rows never deletable).

### The cheap hedge (worth doing before this is decided)

If the Phase 12 migration in [MOCKDEPLOY.md](MOCKDEPLOY.md) is still being
written, add a **nullable `view_id`** to `containers` now, defaulting everything
to a single implicit baseline. No UI, no store change, no concept exposed to
users. If this feature is later built, the migration becomes data-only instead
of structural. This costs nothing today.

---

## UI sketch

- **View switcher** in the global header, left of the supplier filter. Not a
  bare dropdown — persistent, high-contrast view identity is the main defense
  against the "I edited the wrong plan" failure. Baseline visually distinct
  from explorations (filled vs. outlined), with a coral dot on any view holding
  an unrealizable container.
- **Copy button** on the switcher: *"Copy this view →"*, prompts for a name,
  lands you inside the copy.
- **Exploration banner.** While in a non-baseline view, a slim persistent bar
  across the top of the tray: *"Exploration: Plan B — not the plan of record."*
  It should be impossible to forget where you are.
- **Master grid.** The Available column becomes view-relative. Add a secondary
  signal — column or tooltip — for *"allocated in other views: N"*, so a planner
  is never blindsided by cases that look free but are spoken for elsewhere.
  Committed remains absolute and unchanged.

---

## Cost estimate

Files that change (from the current tree):

| Area | Files |
|---|---|
| Types | `src/types/draftView.ts` (new), `src/types/container.ts` |
| Store | `src/store/plannerStore.ts` — `activeViewId`, view CRUD + copy, **`availableQty` becomes view-scoped**, `eligibleContainersForMasterItem`, realizability selectors, view-scoped lock keys |
| Repos | `src/data/repos/types.ts`, `LocalDraftViewRepo.ts` (new), `LocalContainerRepo.ts`, `index.ts` |
| Tray | `ContainerTray.tsx` (filter by view), `ContainerCard.tsx` (unrealizable state) |
| Allocation | `AllocationCard.tsx` (over-allocation flag), `AllocationDialog.tsx` (view-scoped caps) |
| Commit | `CommitConfirmDialog.tsx` (block unrealizable), `ContainerCard.tsx` |
| Grid | `OpenPoStatusReport.tsx` (view-relative Available, other-views column) |
| Layout | `AppLayout.tsx`, `ViewSwitcher.tsx` (new), `ExplorationBanner.tsx` (new) |
| Presence | `presenceChannel.ts`, `PresenceManager.tsx` — view-scoped keys + roster |
| Phase 12 | `draft_views` table, RLS, realtime subscription, commit RPC cross-view invalidation |

Roughly half the work is the realizability rendering, not the view plumbing —
budget accordingly. See "Preparing for this without building it" below for why
the plumbing half is smaller than it looks.

---

## Preparing for this without building it

Verified against the current tree (2026-07-28): **views change the answer in
exactly two places in the store.** Nine of the eleven `status` checks in the
codebase are unaffected — [plannerStore.ts:220](src/store/plannerStore.ts#L220),
[:298](src/store/plannerStore.ts#L298), [:327](src/store/plannerStore.ts#L327),
[:520](src/store/plannerStore.ts#L520) are mutability guards ("is this container
still editable"), and the component-side ones are presentation. The two that
matter:

- [plannerStore.ts:709](src/store/plannerStore.ts#L709) — the draft filter inside `availableQty`
- [plannerStore.ts:748](src/store/plannerStore.ts#L748) — the draft filter inside `eligibleContainersForMasterItem`

All four `availableQty` call sites pass only an id and read from the store, so
no consumer changes if that shape is protected. Four preparatory moves, all
behavior-neutral, roughly 40 lines total:

1. **Extract "which drafts count against availability" into one selector.**
   That question is inlined at `:709` and independently re-derived at `:748`.
   Name it (`plannableDraftContainers()`) and have both call it. Under views it
   becomes the single function that gains `&& c.viewId === activeViewId`.
   Highest leverage item on this list.

2. **Never add a `viewId` parameter to `availableQty`.** Standing rule. View
   scope is *ambient store state* — never an argument, never a prop. Threading
   it through is what turns a two-line change into a forty-file change.

3. **Move the tray's scoping into a store selector.**
   [ContainerTray.tsx:26-37](src/components/containers/ContainerTray.tsx#L26-L37)
   computes supplier scoping, filtering and sorting inside a component `useMemo`.
   Pull the scoping half into `visibleContainers()`; leave the draft/committed
   split in the component.

4. **Give commit-eligibility a single home with a reason.** Currently inline at
   [ContainerCard.tsx:326](src/components/containers/ContainerCard.tsx#L326) as
   `canCommit && allocations.length > 0`, which silently hides the button on an
   empty draft. A `commitBlockedReason(containerId): string | null` selector
   improves that today and is the seam for the realizability rendering — the
   expensive half becomes one added branch in a function whose output the UI
   already renders.

### Already correct — leave alone

- `masterLockId()` is a single function in [lock.ts](src/types/lock.ts#L17).
  View-scoping the key is a one-line change there. Nothing to prepare.
- Allocations reference containers and carry no scope of their own, so
  "allocations in view V" is a join. **Never denormalize `viewId` onto
  allocations** — the one structural mistake that would actually hurt.
- The repo interfaces are already the right seam; views ride the existing pattern.

### Do not do in advance

- **No `activeViewId` state.** It would be a constant, and dead state invites
  premature threading.
- **No `viewId` on the TS `Container` type.** TypeScript makes adding a required
  field a compiler-guided refactor — it finds every construction site for you.
  Pre-adding buys almost nothing. The *Postgres* nullable column above is
  different and still worth taking, because SQL migrations are not
  compiler-guided.
- No UI, no views table, no speculative bulk repo methods.

### One thing to know

`containerCodeSequences` mints codes client-side today, and
[MOCKDEPLOY.md](MOCKDEPLOY.md) already flags that it must move into
`next_container_code` under Supabase. A view copy mints N codes at once — so
whenever that RPC is written, make sure it can be called in a loop inside a
transaction or takes a count.

---

## When to build this

Do **not** build on intuition. The trigger is observed behaviour during or after
the operational dry run ([MOCKDEPLOY.md](MOCKDEPLOY.md) Phase 7):

**Build it if:**

- Someone empties and rebuilds a container to try an alternative **more than
  twice in a working session**, and says they lost an arrangement they wanted
  back.
- Two people describe competing arrangements in email or chat because the app
  can only hold one.
- A decision gets delayed because the alternatives could not be seen together.

**Don't build it if:**

- Rebuilding happens rarely, or is cheap enough that nobody complains.
- The variations people want are single-container ("what if this were a 40HC?")
  rather than plan-wide. That is a much smaller feature — a per-container
  what-if — and this design is the wrong tool for it.

The dry run is the instrument. Let it answer the question.

---

## What this design does not do (intentionally)

- **No per-user private views.** Views are environment-level. Private views
  reintroduce the coordination failure the product exists to remove.
- **No merge between views.** You promote a whole view or you don't. Cherry-
  picking one container from Plan B into the baseline is not supported —
  cross-view merge is where scenario systems become unmaintainable. If a single
  container is wanted, rebuild it in the baseline.
- **No versioning or history of a view over time.** A view is a live mutable
  plan, not a snapshot. Plan version history remains a separate future idea.
- **No unlimited views.** The cap is part of the design, not a limitation to be
  lifted on request.
- **No automatic repair of unrealizable views.** The app flags; a human decides.

---

## Open questions

- **Should factories be able to create views at all?** The permissions table
  says yes, for consistency with "anyone can arrange." But the risk is a factory
  building an exploration nobody internal ever looks at. Worth revisiting with
  real usage — restricting creation to admin/internal is a one-line change and
  the more conservative default.
- **Should the baseline be commit-only?** i.e. force promotion before committing
  from an exploration. It is a cleaner mental model ("only the plan of record
  ships") at the cost of an extra step. Current design allows direct commit from
  any view; revisit if people commit from explorations by accident.
- **Does the master grid need an "other views" column, or is a tooltip enough?**
  A column is honest but costs horizontal space on an already-wide grid.
- **View-scoped locks vs. a soft cross-view warning.** Strictly, editing PO X in
  two views is not a conflict. But a planner might still want to know. A passive
  indicator (no block) may be better than silence.
