# SEMANTICS.md -- Mental Model

This document captures **what things mean and how they interact** in the Stuffer
Planner. It is the conceptual layer:

* [CLAUDE.md](CLAUDE.md) -- *what* gets built and *when* (phases, scope, rules).
* [CONTCONFIG.md](CONTCONFIG.md) -- *how* the container / configuration model is
  implemented and persisted (types, RLS, schema).
* **SEMANTICS.md** (this file) -- *what these concepts mean*, how they affect each
  other, and what the grid shows when. Read this first if you want the mental
  model; read the others for execution detail.

---

## 1. The two-layer model

The system has exactly two layers of state. Most confusion in this kind of app
comes from conflating them. Don't.

| Layer            | What it is                                                | Who can change it                          | Persists across sessions? |
|------------------|-----------------------------------------------------------|--------------------------------------------|---------------------------|
| **Master truth** | The set of open PO items with their *real* remaining quantities. | Admin (push) and commits (consume). Never edited freely. | Yes |
| **Hypothetical** | What the grid *displays right now* under the currently-explored configuration. | Anyone navigating between configurations. | No -- derived at render time |

The hypothetical layer is a **lens** over the master truth. Switching lenses
changes what you see but not what is.

> **One rule to remember:** the only thing that ever moves the master truth is a
> **commit** (or an admin push, which replaces master data wholesale). Everything
> else is a hypothetical view -- a "what if we committed *this* plan?" preview.

---

## 2. Containers: vessels of proposals

A **container** is a physical shipping unit (20GP, 40GP, 40HC, 45HC) bound to a
**single destination** at the moment it is created.

* The destination is locked at creation. You cannot retarget a container.
* A container starts empty. Any open PO item whose `shipTo` matches the
  container's destination is eligible to be allocated into it.
* A container holds N configurations -- one **active**, at most one **committed**,
  and any number of drafts in between.
* A container is not the thing you commit; **a configuration on the container is.**

Think of a container as a slot waiting for a packing plan, with several drafts
of that plan pinned to it.

---

## 3. Configurations: snapshots of intent

A **configuration** is a named proposal for how to fill a single container.
It is a *snapshot of intent*, nothing more.

* It belongs to exactly one container.
* It contains zero or more **allocations** (see next section).
* It has a state: **draft** (not yet committed) or **committed** (finalized).
* It can be **active** (the user is currently looking at it) or **inactive**
  (sitting in the background).
* Multiple configurations on the same container are **alternatives**, not
  additions. Only one can ever be committed.

A factory's configurations contain only their own PO items. Internal/Admin can
mix lines from multiple factories in their own configurations. Factories never
see Internal's configurations (RLS). See [CONTCONFIG.md](CONTCONFIG.md)
"Visibility & RLS" for the canonical spec.

### The worked example, semantically

The sample CSV's `Column1` field encodes two example configurations on one
container:

```
Config A = (rows tagged "core")  ∪  (rows tagged "configA")
Config B = (rows tagged "core")  ∪  (rows tagged "configB")
```

The `core` rows appear in **both** configurations -- the container will always
carry them; they are not the variable. The `configA` / `configB` rows are the
**optional fill** the user is comparing. Switching the active configuration on
this container swaps which optional rows are shown as allocated; committing
one of them consumes those PO quantities from the master truth and discards the
other proposal.

---

## 4. Allocations: the atom of planning

An **allocation** is the smallest unit of intent. It says:

> "In this configuration, X cases of open PO item Y are going into this container."

Three things to remember:

1. **Quantity is per-allocation, not per-row.** A PO line item with 285 cases
   total can have 100 allocated to Container A's Config A and 185 allocated to
   Container B's Config A. Two allocations, two configurations, two containers,
   one PO line.
2. **Destination match is a hard constraint.** An allocation's PO item `shipTo`
   must equal the container's `destination`. Drag-and-drop hard-blocks
   mismatches.
3. **An allocation can never reduce a PO line's effective remaining below zero
   at commit time.** Until commit, the math is hypothetical; at commit the
   constraint is enforced.

---

## 5. The grid as a derived view

This is the section the rest of the document leads to. **The right-panel grid
never shows raw stored quantities** (except in the trivial case where no
configuration on any container has any allocations). It always shows a derived
projection.

For each open PO item, the **displayed remaining quantity** is computed as:

```
displayed = totalQuantity
          − sum of committed allocations of this item across all containers
          − sum of allocations of this item in the focused container's active configuration
```

Three terms, three meanings:

| Term                                  | What it represents                                                                   | Comes from              |
|---------------------------------------|--------------------------------------------------------------------------------------|-------------------------|
| `totalQuantity`                       | The original `quantityRemaining` from the master truth.                              | Admin push / seed       |
| `sum of committed allocations`        | The **real** consumption -- what's already been finalized.                           | Past commits            |
| `sum of active-config allocations`    | The **hypothetical** consumption -- what would also be consumed if you committed *this* config. | Current view |

> **If `displayed = 0`, the row is hidden in the grid for that snapshot.** The
> row still exists in the master truth -- it just has nothing left to show
> under this lens. Switch to a different active configuration and it may
> reappear.

### Visual breakdown

```
              ┌─────────────────────────────────────────────┐
totalQuantity │█████████████████████████████████████████████│  e.g. 285 cases
              └─────────────────────────────────────────────┘
                       ↑                       ↑           ↑
                  committed                hypothetical   displayed
                  consumed                  consumed      remaining
                (real, baked in)        (would happen if  (what the grid
                                         this config        shows)
                                         committed)
```

The grid is showing the user: *"if you committed the configuration you're
currently looking at, this is what would be left."*

### Two derivations users will care about

* **Available quantity** = `totalQuantity − committedConsumed`.
  This is the "real" remaining -- what could still be allocated to a future
  configuration. The allocation modal uses this as the upper bound.
* **Displayed remaining** = `available − activeConfigAllocation`.
  This is what the grid shows when previewing a configuration.

Don't confuse the two. The first is reality; the second is a what-if.

---

## 6. Active vs Committed: the lifecycle of a configuration

A configuration moves through three lifecycle states:

```
   created                                                committed
      ↓                                                       ↓
  ┌──────┐    allocations    ┌──────┐   user clicks   ┌────────────┐
  │ draft│ ────────────────▶ │ draft│ ─── commit ───▶ │ committed  │
  │empty │   one at a time   │filled│                 │ (frozen)   │
  └──────┘                   └──────┘                 └────────────┘
                                ↑
                                │ user navigates
                                │ via container's
                                │ < > arrows
                                ↓
                          (becomes "active"
                           when visible)
```

* **Draft** is the normal working state. A draft can gain or lose allocations
  freely. Drafts can also be deleted.
* **Active** is not a separate state -- it's a per-container *focus* indicator.
  Each container has exactly one active configuration at any time (the one the
  user is currently viewing in the navigation). The active configuration is
  what feeds into the grid formula above.
* **Committed** is terminal (with one escape hatch -- admin uncommit). A
  committed configuration is locked: no more allocation changes. Its
  allocations now contribute to `committedConsumed` for the rows they touched.

---

## 7. What commit does

A commit is the *only* event (other than admin push) that moves the master
truth. Specifically, committing configuration `C` on container `K`:

1. **Marks `C` as committed** with a `committedAt` timestamp.
2. **Adds `C`'s allocations to `committedConsumed`** for every PO item it
   references. This shifts the master baseline -- `available` quantity goes
   down for those items everywhere in the app.
3. **Flags other draft configurations on container `K` as stale.** They no
   longer matter -- their slot has been taken.
4. **Flags draft configurations on *other* containers as over-allocated** if
   they reference any PO items whose new `available` quantity is now below
   what those drafts were proposing.

The mirror operation, **uncommit**, undoes all four steps. It restores
`committedConsumed` to its prior level, un-stales the sibling drafts, and
reconsiders over-allocation flags on other containers.

Uncommit is an **admin privilege** -- a deliberate escape hatch for mistakes,
not a regular workflow.

---

## 8. State labels (cheat sheet)

### For an open PO item (a row in the grid)

| Label                  | Meaning                                                                  |
|------------------------|--------------------------------------------------------------------------|
| `available`            | Has uncommitted quantity remaining; can be allocated to new configurations. |
| `partially committed`  | Some quantity is in committed configurations; some is still available.   |
| `fully committed`      | All quantity is in committed configurations; row hides in active-config views. |
| `over-allocated in proposal` | Appears in some draft configuration that proposes more than `available`. |

### For a configuration

| Label             | Meaning                                                                       |
|-------------------|-------------------------------------------------------------------------------|
| `draft`           | Working state; editable; no consumption of master truth.                      |
| `active`          | Currently visible in its container's navigation (one per container).          |
| `committed`       | Finalized; consumes master truth; locked from edits (except uncommit by admin). |
| `stale`           | Another configuration on the same container got committed; no longer viable. |
| `over-allocated`  | References PO items whose `available` is now below what this config proposes. |

### For a container

| Label                   | Meaning                                                                   |
|-------------------------|---------------------------------------------------------------------------|
| `empty`                 | No configurations have allocations.                                        |
| `with proposals`        | Has at least one draft configuration with allocations.                     |
| `committed`             | Has exactly one committed configuration.                                   |

---

## 9. The container's effective `cargoReady`

A container has its own **effective Cargo Ready Date**, derived live from its
allocations:

```
container.cargoReady = max( cargoReady ) across rows allocated in active configuration
```

This date is not stored anywhere -- it is computed on every render. It changes
when:

* A factory edits the `cargoReady` field on one of its rows.
* A user adds, removes, or resizes an allocation.
* The user switches which configuration is active on this container.

The effective `cargoReady` answers: *"What is the earliest day this container
can leave?"* Even if 99% of cases are ready next Monday, one straggler ready
two weeks later sets the date. That's what `max` enforces.

Same derivation works on committed configurations (giving the *real* ready
date) and on drafts (giving a *hypothetical* ready date for planning).

---

## 10. Invariants (the unbreakable rules)

These never change, in any state, ever:

1. **Container destination is immutable** after creation.
2. **All allocations in a configuration must share the container's destination.**
   No mixed-destination containers.
3. **A container has at most one committed configuration at a time.** Committing
   a second one is impossible until the first is uncommitted.
4. **Total committed quantity for a PO item across all containers cannot exceed
   its `totalQuantity`.** This is the commit-time check. Drafts can temporarily
   propose more than this; commits cannot finalize it.
5. **Master open PO item quantities are immutable except by admin push or by
   commit.** Internal users never edit them. Factories edit `cargoReady`,
   `cbmPerCase`, `cbmTotal` only.
6. **Factories see and act only on their own PO items, allocations, and
   configurations.** Enforced by RLS, not by the UI. See CONTCONFIG.md.
7. **Internal commits; factories propose.** Factories cannot commit
   configurations even on configurations they created.

---

## 11. Event-driven transitions

The following events drive everything users do. Each event has a small set of
effects; the rest is derivation.

### Drag a row onto a container

1. Destination check. If mismatch -> reject silently.
2. Open the allocation modal.
3. User confirms a quantity in the valid range
   `[1, available − alreadyInThisConfig]`.
4. **Effect:** an allocation is added to the container's active configuration.
5. **Derivation:** the grid re-renders. The dropped row's `displayed`
   decreases by the allocated quantity; if it reaches zero, the row hides.

### Click an existing allocation (inside a container)

1. Reopen the allocation modal with the current quantity pre-filled.
2. User changes the quantity (or sets it to 0 to remove).
3. **Effect:** the allocation in the active configuration is updated or
   removed.
4. **Derivation:** grid re-renders, container metrics re-derive.

### Switch active configuration on a container (click `<` or `>`)

1. **Effect:** that container's `activeConfigId` changes.
2. **Derivation:** if the user's focused container is this one, the grid
   re-renders using the new active configuration's allocations in the formula.
   Rows that were hidden may reappear; rows that were visible may hide. The
   container's effective `cargoReady`, total CBM, and total quantity all
   update.

### Add a new configuration on a container

1. **Effect:** a new empty draft configuration is created and becomes active.
2. **Derivation:** grid re-renders with `activeConfigAllocation = 0` for all
   rows. All rows that have any `available > 0` become visible again.

### Commit the active configuration

1. Confirmation modal lists what will be consumed.
2. **Effect 1:** configuration's `committed` flips to true.
3. **Effect 2:** `committedConsumed` increases for each affected PO item.
4. **Effect 3:** sibling drafts on the same container get the `stale` flag.
5. **Effect 4:** drafts on other containers referencing the same items get
   re-evaluated for `over-allocated`.
6. **Derivation:** the master baseline shifts everywhere in the app -- every
   grid view (admin, internal, *and the factory views whose lines were
   consumed*) reflects the new `available` quantities. Other users see the
   change in realtime via Phase 12 subscriptions; factories see their
   `quantityRemaining` decrease without seeing the winning configuration.

### Uncommit (admin only)

The inverse of all four commit effects. Restores the prior baseline.

---

## 12. Why nothing in the master truth gets denormalized

A common temptation is to write `committedConsumed` or `available` or
`container.cargoReady` directly onto stored rows. **Don't.** Two reasons:

1. **Concurrency.** Factories edit `cargoReady` continuously. Internal commits
   periodically. If `container.cargoReady` were stored, every CRD edit would
   need to chase down every container the row is in and update them. With live
   derivation, the next render computes the right value automatically.
2. **Truth has one shape.** `totalQuantity` is the master truth. Everything
   else is a view of it. Storing a view alongside the truth invites them to
   drift. The Zustand selectors + the formula keep them aligned by definition.

This is why CONTCONFIG.md's data model has zero derived fields, and why both
`committedConsumed(row)` and `container.cargoReady` are explicitly called out
as runtime-computed.

---

## 13. What this model is *not*

A few things this app deliberately does **not** model -- helpful to know what's
out of scope:

* **Shipment objects.** A committed configuration is the closest we have to a
  shipment, but no separate "Shipment" entity exists. The booking process that
  would turn a committed configuration into a real shipment lives outside this
  app for now.
* **Lot tracking.** An allocation says "100 cases from PO line Y" but does not
  identify *which* 100 cases. The system treats cases as fungible within a PO
  line.
* **Time-based forecasting.** The system doesn't predict future PO arrivals or
  optimize over a time window. It plans against the current master truth only.
* **Containers re-targeting.** Once a container is created at destination D,
  it's at D forever. Deletion and re-creation is the only way to change.
* **Conflict resolution across factories.** Because each PO item has exactly
  one factory owner, there's no inter-factory conflict to resolve. Conflicts
  can only happen between *configurations* (on the same or different
  containers) all consuming the same line -- and the resolution is "internal
  commits the winner."

If any of those become real concerns, they're new concepts that get added to
the model, not retrofitted into existing terms.
