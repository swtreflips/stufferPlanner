# CLAUDE.md

## Project Overview

Build a **Stuffer Planner** web application using:

* React
* Vite
* TypeScript
* Tailwind CSS
* dnd-kit (drag and drop)
* AG Grid Community (Excel-like data grid)
* Zustand (state management)

The goal is to replace the current workflow of emailing Excel files back and forth.

There are three user roles. **Admin and Internal share the full planning view**
(scenarios + draft and committed containers on the left, open PO status report on
the right) and are the only roles that can commit. **Factories participate in the
planning loop with strict siloing**: a factory sees its own scenarios/drafts and
the slices of internal's drafts that touch its own POs -- never another factory's
POs, allocations, scenarios, or drafts. The planning model (containers, scenarios,
allocations, commit-per-container = one OFQ) is specified in
[CONTCONFIG.md](CONTCONFIG.md).

* **Admin** -- the developer/maintainer of the app (a single role-holder -- the
  user). Owns the deployment, schema, and master data ingestion (backend API push,
  Phase 11). Full read/write authority in the UI. Distinct from Internal because
  the user is one developer, not a team of planners.
* **Internal** -- planners at the organization (the people who currently send
  emails to factories). View the full plan across all scenarios and factories,
  create/delete containers, create and fork scenarios, allocate PO lines into draft
  containers, and **commit individual containers** (each commit produces an OFQ).
  Cannot edit open PO data fields (those come from admin's master push and the
  factories' own updates) and cannot export -- export remains an admin-only
  action.
* **Factory** -- external vendors supplying the POs. Factories **can** create
  scenarios, draft containers, and allocations -- restricted to their own PO
  lines -- as proposals to internal. They cannot commit; only internal decides
  what ships. RLS enforces total siloing: factory A never sees factory B's POs
  or allocations, even when both appear in the same internal-owned container
  (each factory sees only her own slice). Factories also edit **Cargo Ready Date**
  and the **CBM fields** (`cbmPerCase`, `cbmTotal`) on their own lines -- they own
  the manufacturing data and enter both CBM values themselves (the app does not
  derive one from the other). Two ways to update those: edit interactively in the
  grid, **or** upload the same CSV they currently email us (Phase 10.5) -- a
  seamless transition from the existing workflow.

## Permissions Matrix

| Capability                                  | Admin | Internal | Factory                              |
|---------------------------------------------|-------|----------|--------------------------------------|
| View committed containers (OFQs)            | Yes   | Yes      | Yes (only those containing own POs)  |
| View draft containers                       | Yes   | Yes      | Yes (own drafts + drafts containing own POs; other factories' allocations hidden within shared drafts) |
| View scenarios                              | Yes   | Yes      | Yes (own scenarios + scenarios containing own POs) |
| View open PO status report                  | Yes   | Yes      | Yes (own lines only)                 |
| Create / fork scenarios                     | Yes   | Yes      | Yes                                  |
| Create draft containers                     | Yes   | Yes      | Yes                                  |
| Delete draft containers                     | Yes   | Yes      | Own drafts only, and only if all allocations inside belong to the factory |
| Allocate rows into a draft container        | Yes   | Yes      | Yes (own PO lines only; draft containers only) |
| Remove allocations                          | Yes   | Yes      | Own allocations only; draft containers only |
| Commit a container (create OFQ)             | Yes   | Yes      | No                                   |
| Uncommit a container                        | Yes   | No       | No                                   |
| Edit Cargo Ready Date                       | Yes   | No       | Yes (own lines only)                 |
| Edit CBM fields (`cbmPerCase`, `cbmTotal`)  | Yes   | No       | Yes (own lines only)                 |
| Edit any other open PO field                | Yes   | No       | No                                   |
| Upload own factory CSV (partial update)     | No    | No       | Yes (own lines only)                 |
| Export stuffing plan                        | Yes   | No       | No                                   |

Master data ingestion (`master_items` table) is separate from the UI permission
model: admin pushes master data system-to-system via the Phase 11 API path, not
through any in-app upload action.

For the MVP / development phase, the CSV data from `stufferplannertemplate.csv` should be **hardcoded as sample data** so the app can be built and tested without requiring a file upload flow. In production, data ingestion will eventually move to an API push.

---

# Product Vision

The screen is divided into two sections:

## Left Panel: Container Planning Area

* Vertical scrollable tray of container cards.
* A **scenario switcher** at the top selects the current scenario; committed
  containers (OFQs) are pinned above and always visible regardless of scenario.
* Each container is bound to a single destination and exists in one of two states:
  **draft** (under a scenario, editable) or **committed** (an OFQ; read-only).
* Internal/Admin users add containers, allocate PO lines into drafts, fork
  scenarios to explore alternatives, and commit drafts one at a time. Full model
  in [CONTCONFIG.md](CONTCONFIG.md).

## Right Panel: Open PO Status Report

* Displays open PO items (hardcoded sample data for MVP).
* Supports sorting, filtering, and search.
* Rows display **derived** remaining quantities scoped to the current scenario:
  `original - committed - sum(drafts in current scenario)` (see
  [CONTCONFIG.md](CONTCONFIG.md)). Switching scenarios re-renders the view.
* Dragging a row onto a draft container opens an allocation modal asking how many
  cases to assign; the row is not directly attached to the container.

---

# Core Functional Requirements

## Data Ingestion

* **MVP:** Sample data is hardcoded from `stufferplannertemplate.csv` (Phase 2).
* **Production paths:**
  * **Admin:** master data pushed via backend API (Phase 11) -- system-to-system,
    no admin-facing CSV upload UI.
  * **Factory:** updates their own rows interactively in the grid (Phase 10) or
    by uploading the same CSV they currently email (Phase 10.5).

## Data Grid

* Excel-like grid.
* Sort and filter columns.
* Search.
* Row selection.
* Drag source support.

## Container Tray

* Scrollable list of containers, each bound to a destination at creation time.
* Containers exist in one of two states: **draft** (in a scenario, editable) or
  **committed** (an OFQ; read-only, globally pinned at the top).
* A **scenario switcher** selects which draft containers are visible.
* Internal/Admin: add draft containers (destination + type), allocate, fork
  scenarios, empty/delete drafts, commit a draft (with OFQ reference).
  See [CONTCONFIG.md](CONTCONFIG.md).

## Drag and Drop

* Smooth animations.
* Drag overlay to prevent clipping.
* Reorder allocations within a draft container.
* Dropping a grid row onto a draft container opens the allocation modal
  (destination must match the row's `shipTo`). Committed containers are not drop
  targets. See [CONTCONFIG.md](CONTCONFIG.md).

## State Management

* Track all open PO items (`master_items`; only `committed_quantity` mutates, on
  container commit).
* Track scenarios, containers (draft and committed in one collection), and
  allocations.
* Track UI state (current scenario, focused container, modal state).
* Use derived selectors -- never store computed quantities. The availability
  formula and the cross-scenario `stale` flag are derived at runtime. See
  [CONTCONFIG.md](CONTCONFIG.md).

## Export

* Export current stuffing plan to CSV.

---

# Sample Data Schema

The hardcoded sample data comes from `stufferplannertemplate.csv` with these columns:

| Column              | Description                                      |
|---------------------|--------------------------------------------------|
| Name                | Factory / vendor name (e.g. "Ditar S.A")         |
| Date Issued         | Date the PO was issued (Excel serial number)     |
| Document Number     | Purchase order number (e.g. "PO155049")          |
| Ship To             | Destination address (e.g. "Simi Valley, CA")     |
| Requested Ship By   | Requested shipping date (Excel serial number)    |
| Status              | Order status                                     |
| Line ID             | Line item number within the PO                   |
| Name_1              | SKU / product code (e.g. "CFLF-WT10712")         |
| Quantity Remaining  | Units remaining to ship                          |
| CBM                 | Cubic meters (may be empty)                      |
| Cargo Ready         | Date cargo is ready (Excel serial -- editable by factory) |
| ETD                 | Estimated transit days                           |
| ETA                 | Estimated arrival                                |
| CBM per case        | CBM per individual case                          |
| CBM total           | Total CBM for the line (Quantity * CBM per case) |
| Container           | Container assignment (empty until assigned)      |
| Column1             | Illustrative tag (`core`, `configA`, `configB`) showing two alternative scenarios for one container: Scenario A pairs `core` with `configA` rows, Scenario B pairs `core` with `configB` rows. Not consumed by the app -- present only to demonstrate the scenario / fork concept (see [CONTCONFIG.md](CONTCONFIG.md)). |

**Note:** Date fields stored as Excel serial numbers must be converted to human-readable dates when displayed.

---

# Recommended Libraries

## Grid

### AG Grid Community

Reason:

* Best Excel-like experience.
* Free for community features.
* Handles large datasets.

## Drag and Drop

### dnd-kit

Reason:

* Smooth animations.
* DragOverlay prevents hidden elements.
* Highly customizable.

## State Management

### Zustand

Reason:

* Minimal boilerplate.
* Excellent for React apps.

## File Import (Phase 10.5)

### Papa Parse

* CSV parsing for the **factory CSV upload** flow (Phase 10.5) -- partial update
  of the factory's own rows; preserves the email-an-Excel workflow.
* Admin master data does **not** use Papa Parse -- it arrives via backend API
  push (Phase 11), not browser upload.
* Not required for MVP since Phase 2 data is hardcoded.

## Modal / Dialog

### @radix-ui/react-dialog

Reason:

* Accessible, headless primitive (~5 KB).
* Used for the allocation modal (Phase 5.5) and commit confirmation modal (Phase 7.5).

## Immutable Updates

### immer (via Zustand middleware)

Reason:

* Allocations nested inside containers nested inside scenarios are painful to
  update without it.

## Toasts

### sonner

Reason:

* ~3 KB, no setup overhead.
* Commit and uncommit feedback (Phase 7.5).

---

# Suggested Project Structure

```text
src/
  components/
    layout/
      AppLayout.tsx
      SplitPane.tsx

    grid/
      OpenPoStatusReport.tsx

    containers/
      ContainerTray.tsx
      ContainerCard.tsx
      AllocationCard.tsx              # row inside a draft container
      AddContainerDialog.tsx          # destination + type picker (Phase 4)
      AllocationDialog.tsx            # quantity prompt (Phase 5.5)
      ScenarioSwitcher.tsx            # scenario picker + fork (Phase 5.6)
      CommitConfirmDialog.tsx         # commit prompt + OFQ ref (Phase 7.5)

    drag/
      DragOverlayRenderer.tsx
      DroppableContainer.tsx
      SortableRow.tsx

  store/
    plannerStore.ts

  types/
    openPoItem.ts
    container.ts                      # Container { status, scenarioId, ... }
    scenario.ts                       # Scenario (Phase 5.6)
    allocation.ts                     # Allocation (Phase 5.5)

  utils/
    dateHelpers.ts
    exportPlanner.ts

  hooks/
    usePlannerMetrics.ts

  data/
    sampleData.ts
    repos/                            # Phase 2.5
      types.ts                        # OpenPoRepo + ContainerRepo interfaces
      LocalOpenPoRepo.ts
      LocalContainerRepo.ts
      index.ts

  auth/
    AuthProvider.tsx                  # Phase 1 placeholder; real Supabase in Phase 12

  lib/
    supabase.ts                       # Phase 12 (singleton client)

  App.tsx
  main.tsx
```

---

# Data Models

## Open PO Item

```ts
interface OpenPoItem {
  id: string;
  name: string;
  dateIssued: string;
  documentNumber: string;
  shipTo: string;
  requestedShipBy: string;
  status: string;
  lineId: number;
  sku: string;
  quantityRemaining: number;
  cbm: number | null;
  cargoReady: string;
  etd: number | null;
  eta: string | null;
  cbmPerCase: number;
  cbmTotal: number;
  container: string;
  configGroup: string;
  assignedContainerId: string | null;
  raw: Record<string, any>;
}
```

## Scenario, Container, Allocation

The planning model uses three entities. The full schema lives in
[CONTCONFIG.md](CONTCONFIG.md) "Schema". Summary:

* `Scenario` -- a folder for draft containers. A lightweight branch; no commit
  semantics of its own. The default scenario "Main" always exists.
* `Container` -- bound to a single `destination` and a `type` (20GP/40GP/40HC/45HC).
  Has a `status`: `'draft'` (scoped to one scenario) or `'committed'` (an OFQ;
  global, has `ofq_reference`). Commit is per-container.
* `Allocation` -- `{ containerId, masterItemId, quantity }`. The qty is splittable
  across multiple containers.

**Derived, never stored:** `availability(scenario, item)`, the `stale` flag on
drafts after a cross-scenario commit, and the container's effective Cargo Ready
Date (`max(cargoReady)` across its allocations). All update live from the source
data -- do not denormalize them onto stored rows.

---

# UI Layout Requirements

## Main Layout

* Full-screen application.
* Two-column split.
* Left panel: 50% width.
* Right panel: 50% width.

## Responsive Behavior

* On smaller screens, stack vertically.

---

# Drag-and-Drop Requirements

Use `DragOverlay` from dnd-kit.

Requirements:

* Drag preview should float above all UI.
* No clipping by overflow containers.
* Smooth transform animations.
* Visible drop targets, with disabled styling on containers whose destination
  doesn't match the dragged row's `shipTo`.
* Drop opens the allocation modal -- it does not directly assign the row. See
  [CONTCONFIG.md](CONTCONFIG.md).
* Allocations are removed by reopening the modal and setting quantity to 0, not by
  dragging back to the grid.

---

# Container Metrics

Each container card shows metrics computed from its current allocations:

* Number of allocated lines.
* Total CBM (sum of `cbmPerCase * allocation.quantity` across allocations).
* Total quantity (sum of allocation quantities).
* **Effective Cargo Ready Date** -- the `max(cargoReady)` across all allocated
  rows. Drives the container's earliest possible ship date; updates live as
  factories edit Cargo Ready Date on their lines and as users allocate/empty.
* Status badge: `draft` (with scenario name) or `committed` (with OFQ reference).
* For drafts: a **stale** badge if any allocation now exceeds global availability
  (because another scenario's container committed and consumed the same PO).

Potential future enhancement:

* Capacity utilization percentage based on container type capacity.

---

# Phase-Based Development Workflow

Claude must only work on the current phase.

Do not implement future phases unless explicitly instructed.

Before writing code:

1. Explain what will be built.
2. List files to be created or modified.
3. Wait for approval if requested.

After completing a phase:

1. Summarize completed work.
2. Provide testing instructions.
3. Stop.

---

# Development Phases

## Phase 1 -- Project Setup

Goal:

* Initialize Vite React TypeScript project.
* Install dependencies.
* Configure Tailwind.
* Create folder structure.
* Create placeholder layout.

Deliverables:

* Two empty panels.
* App renders successfully.

---

# Deployment Considerations

This project deploys to **Vercel** (frontend) and **Supabase** (database, auth, realtime).
The items below are scaffolding that should be in place **before Phase 2 begins**, not
deferred until Phases 10-12. They cost little to add now and prevent expensive rewrites
later. They are placed here, before Phase 2, because Phase 2's design decisions (where
sample data lives, how the store reads it, how the app routes) directly determine
whether the eventual Supabase swap is a one-day task or a one-week refactor.

## Vercel

1. **Add `vercel.json` with an SPA rewrite.** Once routes like `/admin` and `/factory`
   exist, refreshing a non-root URL will 404. The rewrite
   `{ "source": "/(.*)", "destination": "/" }` sends all requests to `index.html` so
   React Router handles them.

2. **Pin a Node version in `package.json` via the `engines` field.** Prevents drift
   between local development and Vercel's build environment.

3. **Add `typecheck` and `lint` scripts.** The current `build` script runs `tsc -b`, so
   the build fails on TS errors -- good. A separate `typecheck` script makes Vercel
   preview failures easier to diagnose in isolation.

4. **Lazy-load AG Grid.** Per the `bundle-dynamic-imports` rule in
   `.agents/skills/vercel-react-best-practices`, wrap the open PO status report in
   `React.lazy()`. The factory view does not need AG Grid at all
   (~300-400 KB saved on that route).

5. **Add Vercel preview URLs to the Supabase Auth allowlist.** Each PR gets a unique
   preview URL; Supabase will reject auth callbacks to URLs not on its allowlist. Plan
   a wildcard pattern (e.g. `https://*.vercel.app`).

## Supabase Scaffolding

6. **Environment variables.** Vite only exposes `VITE_*` vars to the client. Required:
   * `.env.example` checked in with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
   * `ImportMetaEnv` type declaration in `vite-env.d.ts` so
     `import.meta.env.VITE_SUPABASE_URL` is typed.
   * `.env.local` already gitignored.

7. **Singleton Supabase client.** Plan for `src/lib/supabase.ts` that creates one
   client. Components must not instantiate their own.

8. **Repository abstraction in the store.** The store should talk to a `OpenPoRepo`
   interface (`fetchAll`, `updateCargoReady`, `assignToContainer`, ...), not raw
   arrays. Start with a `LocalRepo` returning hardcoded data; Phase 12 adds a
   `SupabaseRepo`. No UI changes required at swap time. See Phase 2.5.

9. **Schema decisions before Phase 12.** The current `OpenPoItem` uses string dates
   and a `raw: Record<string, unknown>` blob. For Postgres:
   * Dates: store as `timestamptz`, not strings.
   * `raw` becomes a `jsonb` column.
   * Tables: `master_items` (the renamed `open_po_items`), `scenarios`,
     `containers`, `container_allocations`, `profiles` (with
     `role: 'admin' | 'internal' | 'factory'` and `factory_name` for RLS).
     Full schema in [CONTCONFIG.md](CONTCONFIG.md) "Schema".

10. **RLS is the security boundary, not the UI.** The three-role split is
    meaningless without Row Level Security policies in Postgres. Factories
    participate in planning but are **siloed**: a factory sees its own scenarios
    and drafts plus internal's drafts that touch one of its POs, and only its
    own allocations within those drafts -- never another factory's data.
    Editable fields for factories on `master_items`: `cargo_ready`,
    `cbm_per_case`, `cbm_total`. Plan policies before any factory UI is written
    -- see Phase 12 sub-task 2 and [CONTCONFIG.md](CONTCONFIG.md) "RLS /
    multi-role" for the canonical spec.

## Application Structure

11. **Add a router now.** `App.tsx` currently renders `AppLayout` directly. Two roles
    + auth = `react-router-dom`. Scaffold routing before Phase 2 features ship so the
    app does not need to be restructured later.

12. **Auth gate placeholder.** Wrap routes in an `AuthProvider` that, for now,
    hardcodes `{ role: 'admin' }`. Components that branch on role can be written
    correctly today; the provider's internal implementation gets swapped for Supabase
    Auth in Phase 12.

13. **Move the sample CSV to a real seed.** `stufferPlannertemplate.csv` is fine as
    the source of truth for Phase 2 sample data. Plan for `supabase/seed.sql` (or a
    Node import script) so the same data can populate a real DB without copy-paste.

---

## Phase 2 -- Hardcoded Sample Data

Goal:

* Create `sampleData.ts` with rows from `stufferplannertemplate.csv`.
* Convert Excel serial dates to readable dates.
* Store data in Zustand.

Deliverables:

* Sample data available in store, visible in console or JSON preview.

---

## Phase 2.5 -- Repository Abstraction

Goal:

* Define a `OpenPoRepo` interface (and a `ContainerRepo` interface) in
  `src/data/repos/`.
* Implement `LocalRepo` against the hardcoded sample data from Phase 2.
* Make the Zustand store call the repo, not the raw data array.

Why this phase exists:

The store should not know whether data comes from memory, a CSV, or Supabase. Without
this layer, the Supabase swap in Phase 12 touches every component that reads or writes
state. With it, the swap is a single new file (`SupabaseRepo`) and a one-line provider
switch. This is the single change that turns a one-week refactor into a one-day task.

Deliverables:

* Store calls `repo.fetchAll()` on init instead of importing sample data directly.
* All mutations (`updateCargoReady`, `assignToContainer`, etc.) route through repo
  methods.
* Tests or a console check confirm the store works identically against `LocalRepo`.

---

## Phase 3 -- Open PO Status Report Grid

Goal:

* Render AG Grid with sample data.
* Sorting/filtering.

Deliverables:

* Functional spreadsheet-like grid.

---

## Phase 4 -- Container Tray (with Destinations)

Goal:

* Render the scrollable container tray (left panel) under the default scenario
  "Main".
* "Add Container" button opens a dialog asking for **destination** (selected from
  the distinct `shipTo` values in the loaded open PO items) and container **type**
  (`20GP` / `40GP` / `40HC` / `45HC`).
* A container is bound to one destination at creation. Only PO rows with matching
  `shipTo` can be allocated into it (enforced in Phase 5.5).
* New containers start as empty drafts in the current scenario.
* Admin/Internal: delete a draft container (drafts only -- committed containers
  cannot be deleted, only uncommitted).

Deliverables:

* Scrollable tray of draft container cards, each labeled with destination and type.
* Add-container dialog populated from the distinct destinations in the data.

---

## Phase 5 -- Drag from Grid to Containers

Goal:

* Drag rows into containers.

Deliverables:

* Rows assigned to containers.

---

## Phase 5.5 -- Quantity Allocation Modal

Goal:

* When a row is dropped onto a **draft** container, open a modal asking how many
  cases to allocate. Full flow specified in [CONTCONFIG.md](CONTCONFIG.md).
* Modal shows: total quantity, `committed_quantity` globally, quantity already
  allocated by drafts in the **current scenario**, and a numeric input bounded
  by `1 <= n <= available_in(currentScenario, item)`.
* Reject the drop if the container's destination does not match the row's `shipTo`
  (hard block, not soft warning). Reject drops onto committed containers.
* On confirm, write an `Allocation` to the target draft container.
* Editing an existing allocation: clicking a row inside a draft container reopens
  the modal with the current quantity pre-filled. Setting to 0 removes the
  allocation.

Stack additions:

* `@radix-ui/react-dialog` for the modal (accessible, headless, ~5 KB).
* Zustand `immer` middleware for nested allocation updates.

Deliverables:

* Drag-and-drop onto a draft container opens the modal.
* Allocations persist in the store and re-render the grid via derived selectors
  scoped to the current scenario.

---

## Phase 5.6 -- Scenarios and Exploration

Goal:

* Introduce the **Scenario** entity (see [CONTCONFIG.md](CONTCONFIG.md) "The model").
  A scenario is a folder for draft containers; "Main" is the default and cannot be
  deleted.
* **Scenario switcher** at the top of the container tray: dropdown of all
  non-archived scenarios, with `forked from X` lineage labels on non-Main entries.
* **Fork** action: deep-copies all draft containers (and their allocations) from
  the current scenario into a new scenario with a user-supplied name.
* **Empty container** action on each draft card: clears all allocations on that
  container (in the current scenario only). Confirm before destroying.
* Switching scenarios re-renders the grid availability via the derived selector:
  ```
  available_in(scenario, item) =
      item.originalQuantity
    - item.committedQuantity
    - sum(allocations.quantity for draft containers IN scenario targeting item)
  ```
  Rows where availability == 0 are hidden (collapsed) for that scenario.
* Multiple scenarios are alternatives; their drafts never affect each other's
  availability. Only commit (Phase 7.5) reduces master availability globally.

Deliverables:

* User can create scenarios via fork.
* User can empty draft containers.
* Flipping between scenarios re-renders the grid; no mutation to open PO data.

---

## Phase 6 -- Reordering and Cross-Container Moves

Goal:

* Move rows between containers.
* Reorder within a container.

---

## Phase 7 -- Metrics and Summaries

Goal:

* Show CBM and quantity totals per container.

---

## Phase 7.5 -- Commit Flow (per-container OFQ creation)

Goal:

* "Commit Container" button on each **draft** container card (**admin and
  internal** per the permissions matrix; hidden for factory users).
* Confirmation modal prompts for the **OFQ reference** (free-text; the freight
  forwarder's number) and lists exactly what will be consumed:
  *"Committing N cases across M PO lines as OFQ-XYZ. Continue?"*
* On commit (one transaction):
  * Flip container `status = 'committed'`, set `scenario_id = NULL`,
    `ofq_reference`, and `committed_at`. It's now globally visible (pinned at top
    of every scenario view, read-only).
  * Increment `master_items.committed_quantity` per allocation.
  * Draft containers in other scenarios whose allocations now exceed global
    availability are flagged **stale** -- derived at runtime via the
    `scenario_item_availability` view. Never auto-mutated.
* Uncommit (admin-only): reverses the commit. Decrements
  `master_items.committed_quantity`, flips the container back to `draft` and
  reattaches it to a scenario (the originating one if it still exists, else
  "Main"). Requires a reason string for the audit log.

Stack additions:

* `sonner` for toast feedback (~3 KB).
* Reuse the Phase 5.5 Radix Dialog for the confirmation modal.

Deliverables:

* Commit produces an OFQ; the master grid baseline shifts globally.
* Stale indicators visible on affected drafts in other scenarios.
* Admin can uncommit a container with an audited reason.

---

## Phase 8 -- Export Stuffing Plan

Goal:

* Export final plan to CSV.

---

## Phase 9 -- UI Polish

Goal:

* Improve visuals.
* Add animations.
* Add loading and empty states.

---

## Phase 10 -- Role-Based Permissions Enforcement

Goal:

All three roles render the **same** `AppLayout` (scenarios + container tray on the
left, open PO grid on the right). The difference between roles lives in what each
role can **see** and **do**, enforced by `useAuth()` checks on the UI side and by
RLS on the data side. RLS is the security boundary -- the UI checks are for
usability, not security.

### Internal role

* Scenario switcher + container tray: full access -- create / delete draft
  containers, fork scenarios, empty drafts, allocate any PO line, **commit a
  container** to create an OFQ. Cannot uncommit (admin-only).
* Open PO grid: all rows visible; **all columns `editable: false`** (Internal owns
  planning, not data).
* No "Upload Excel" toolbar (factory-only feature, Phase 10.5).

### Factory role

* Scenario switcher + container tray: visible, scoped to scenarios and drafts
  that **either** the factory created **or** contain at least one allocation
  against one of the factory's POs (RLS-driven; UI just renders what it gets).
* Inside any visible draft container, the factory sees **only her own
  allocations** -- other factories' allocations in the same container are
  filtered out by RLS and never reach the client. Internal-created allocations
  for the factory's own POs are visible (so the factory knows what internal is
  proposing for her).
* Can create scenarios, draft containers, and allocations -- but the allocation
  modal is gated to PO lines where `item.name === factoryName`. Drag-and-drop
  hides ineligible rows for the factory.
* Cannot commit, uncommit, or delete a container that holds another factory's
  allocations.
* Open PO grid: filter to rows where `item.name === factoryName`. Mark all
  columns as `editable: false` *except* `cargoReady`, `cbmPerCase`, and
  `cbmTotal`. Both CBM values are entered manually -- the app does **not**
  auto-derive one from the other.
* Bulk-update path for the editable fields: see Phase 10.5 (CSV upload).

### Admin role

* Full UI authority (matches the matrix). Can uncommit a container (with reason).
* Master data ingestion happens out-of-band via Phase 11's API push -- no UI
  surface for it.

### Provenance display

Every scenario, container, and allocation displays its `created_by` signature
(factory name or internal user). On internal's review of a mixed draft, this
makes "who suggested what" visible at a glance. Committed containers also display
`committed_by` and the OFQ reference.

### Header

Show a role badge: "Admin" / "Internal" / "Factory" plus the current scenario
name. Drop any legacy "Read-only" badge -- all roles now have write access to at
least their own slice.

Changes to factory data, factory-created drafts, and Internal/Admin commits all
propagate to the other roles' views in real time (Phase 12 realtime
subscriptions). RLS filters the event stream so each session only receives events
for rows it's allowed to see -- siloing holds for live updates.

---

## Phase 10.5 -- Factory CSV Upload

Goal:

Preserve the existing factory workflow (email an Excel file with updated Cargo
Ready Dates and CBM values) by accepting that same CSV as a bulk-update alternative
to the interactive grid editing from Phase 10. Factories choose either path on any
given update -- both produce the same result in the store.

### Visual placement

* A `<FactoryToolbar />` renders **above the open PO status report** (right panel only,
  factory role only -- gated via `useAuth()`).
* Right-aligned within a slim toolbar bar (~40px tall, navy-50 background, navy-200
  bottom border to match the existing palette).
* Single button: **"Upload Excel"** with `lucide-react.Upload` icon to the left
  of the label. Compact (h-8, px-3), navy-700 background, navy-100 text, hover to
  amber-accent border. Does not dominate the grid header.
* Admin role does **not** see this toolbar; admin uses the full upload from
  Phase 11.

### Dialog (Radix Dialog -- reuse the modal system from Phase 5.5)

* File input (`accept=".csv"`) plus a drag-drop area covering the same bounds.
* Parse via Papa Parse (`header: true`).
* **Validation pass before any state change**:
  * Only rows where `name === factoryName` are processed; others counted and
    surfaced as "X rows skipped (other factories)".
  * Only `cargoReady`, `cbmPerCase`, `cbmTotal` are applied -- other columns
    silently ignored.
  * Row matching by composite key `` `${documentNumber}-${lineId}` `` (same id
    the store uses). Unmatched rows surface as "no matching PO line".
  * Required headers: `Document Number`, `Line ID`, plus at least one of the
    editable columns. Missing required headers reject the upload with an inline
    error in the dialog (no state change).
* **Preview table** before commit: N rows to be updated with current vs new values
  side by side. Confirm / Cancel.

### Apply path

* Updates route through repo methods on `OpenPoRepo`:
  * Existing: `updateCargoReady(id, isoDate)` (Phase 2.5).
  * New in this phase: `updateCbmPerCase(id, value)`, `updateCbmTotal(id, value)`.
* Toast (sonner): `"Updated X lines from <filename>"`.

### Future enhancement

* `.xlsx` support via SheetJS (`xlsx` package) so factories don't need to "Save as
  CSV" first. Not MVP -- CSV proves the workflow.

### Deliverables

* Factory user sees the "Upload Excel" button only when role is factory.
* Uploading a valid CSV updates only their own rows' editable fields.
* Other rows and other columns unaffected; counts shown in the toast.

---

## Phase 11 -- Admin Master Data Ingestion (API Push)

Goal:

Replace the Phase 2 hardcoded data with a backend push path that the admin's
existing systems (whatever generates the source Excel today) can call. **No
admin-facing CSV upload UI** -- the admin role's data ingestion is
system-to-system. The admin user (single developer/maintainer) does not upload
files through the app.

### Mechanism (depends on Phase 12)

Once Supabase is in place, master data lives in the `master_items` table. Pushes
arrive via:

* **PostgREST upsert** with the service role key -- suitable for scheduled
  pushes from the user's existing data pipeline.
* **Supabase Edge Function** -- suitable if the source needs schema mapping
  (Excel/CSV -> row objects) before insert.

Upsert key: composite `(documentNumber, lineId)`. Existing rows update; new
rows insert; rows missing from a push are **not** auto-deleted (avoid
destructive default).

### Conflict policy with factory edits

Factory wins on `cargoReady`, `cbmPerCase`, `cbmTotal` if the factory has
touched those fields since the last push. Other fields are admin-authoritative
and overwritten on each push.

### Deliverables

* Documented row payload shape (matches `OpenPoItem` minus client-only fields
  like `id`, `raw`, `assignedContainerId`).
* Push endpoint (PostgREST table or Edge Function) reachable with admin
  credentials / service role key.
* `scripts/seed.ts` (Node) that reads `stufferPlannertemplate.csv` and emits
  the JSON the endpoint accepts -- exercises the same path for dev/staging
  reproducibility.

### Out of scope (intentionally)

* Admin-facing CSV upload UI -- replaced by this push mechanism.
* `.xlsx` parsing in the browser.

---

## Phase 12 -- Supabase Integration

This phase is **required for production deployment, not optional**. Labeling it as
optional earlier invited design choices (string dates, no repository layer, no auth
gate) that would block the swap. The deployment considerations above and Phase 2.5
prevent that.

Sub-tasks:

1. **Schema migration.** Create `supabase/migrations/0001_init.sql` with
   `master_items`, `scenarios`, `containers`, `container_allocations`, and
   `profiles` tables, plus the `scenario_item_availability` view. Dates as
   `timestamptz`, `raw` as `jsonb`. Full DDL in
   [CONTCONFIG.md](CONTCONFIG.md) "Schema".

2. **RLS policies (siloed collaboration).** Enable RLS on `master_items`,
   `scenarios`, `containers`, `container_allocations`, and `profiles`. Full
   policy spec in [CONTCONFIG.md](CONTCONFIG.md) "RLS / multi-role". Summary:
   * `admin` and `internal`: full read/write across all tables; only they can
     commit/uncommit containers.
   * `factory` on `master_items`: `SELECT` and `UPDATE` (only `cargo_ready`,
     `cbm_per_case`, `cbm_total`) where `name = profiles.factory_name`.
   * `factory` on `scenarios`: `SELECT` where `created_by = self` OR the
     scenario contains an allocation against a factory PO. INSERT own scenarios.
   * `factory` on `containers`: `SELECT` where `created_by = self` OR the
     container has at least one allocation referencing a factory PO. INSERT
     draft containers. DELETE only own drafts that contain only own allocations.
     No commit/uncommit.
   * `factory` on `container_allocations`: `SELECT` where `master_item_id` is a
     factory PO. INSERT own allocations into draft containers. DELETE own
     allocations from draft containers. **Each allocation row is independently
     filtered** -- a factory inside a mixed container sees only her own rows;
     other factories' allocations in the same container are not returned.
   * Cross-factory leakage is structurally impossible: a factory never sees
     another factory's master rows, allocations, scenarios, or containers
     unless that container also contains one of her own allocations (and even
     then she only sees her own rows within it).

3. **Auth wiring.** Replace the placeholder `AuthProvider` from the deployment
   scaffolding with a real Supabase session. Email or magic-link login. Role read
   from the `profiles` table.

4. **`SupabaseRepo` implementation.** New files implementing the Phase 2.5 repo
   interfaces (`MasterItemRepo`, `ScenarioRepo`, `ContainerRepo`, `AllocationRepo`)
   using `@supabase/supabase-js`. Toggle between local and remote via an env var
   (e.g. `VITE_DATA_SOURCE=local|supabase`).

5. **Realtime subscriptions.** Admin and internal sessions subscribe to
   `master_items`, `scenarios`, `containers`, and `container_allocations` so
   factory edits and commit events propagate without a refresh. Factory sessions
   subscribe only to `master_items` (their own rows) and committed `containers`
   affecting them. Realtime events are filtered by RLS automatically.

6. **RPC functions.** Three Postgres functions: `fork_scenario`,
   `commit_container`, `uncommit_container`. Bodies sketched in
   [CONTCONFIG.md](CONTCONFIG.md) "Backend RPCs".

7. **Seed data.** Port `stufferPlannertemplate.csv` into `supabase/seed.sql` so
   dev/staging databases are populated reproducibly.

Deliverables:

* App works against Supabase with no code changes outside the new repo file and the
  auth provider.
* Factory users authenticated and restricted by RLS.
* Admin sees factory edits in real time.

---

# Coding Rules for Claude

## General

* Use TypeScript strictly.
* Use functional React components.
* Keep components focused.
* Avoid large files.
* Prefer composition.

## Styling

* Tailwind CSS only.
* Clean professional UI.

## State

* Use Zustand.
* No prop drilling for global state.

## Drag and Drop

* Use dnd-kit only.

## Grid

* Use AG Grid Community.

## Performance

* Memoize expensive calculations.
* Avoid unnecessary re-renders.

## Error Handling

* Validate CSV uploads (when implemented).
* Handle malformed files.

---

# Definition of Done for Each Phase

A phase is complete only when:

1. App compiles with no TypeScript errors.
2. No runtime errors.
3. Functionality works as specified.
4. Code is organized.
5. Brief testing steps are provided.

---

# Commands Claude Should Suggest

## Start Project

```bash
npm create vite@latest stuffer-planner -- --template react-ts
cd stuffer-planner
npm install
```

## Install Dependencies

```bash
npm install tailwindcss @tailwindcss/vite
npm install zustand
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install ag-grid-community ag-grid-react
npm install lucide-react
```

## Run Development Server

```bash
npm run dev
```

---

# Preferred UX Details

## Container Cards

* Rounded corners.
* Soft shadows.
* Sticky header.
* Capacity summary.

## Grid Rows

* Assigned rows should appear muted.
* Optional badge showing container assignment.

## Drag Experience

* Slight scale-up on drag.
* Drop target highlight.
* Smooth transitions.

---

# Future Enhancements

* Excel `.xlsx` support.
* Undo/redo.
* Auto container optimization.
* Capacity validation.
* User accounts.
* Multi-user collaboration.
* Plan version history.
* API-based data push to replace CSV upload.

---

# Critical Instruction to Claude

When asked to work on this project:

1. Read this CLAUDE.md.
2. Implement only the requested phase.
3. Do not jump ahead.
4. Keep changes minimal and focused.
5. Explain what was done.
6. Stop after completing the phase.
