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

There are three user roles. **All three roles see the same planning view**
(containers on the left, open PO status report on the right) so everyone watches the plan
evolve in real time. **All three can propose configurations** (see
[CONTCONFIG.md](CONTCONFIG.md)); only **Admin** and **Internal** can commit them.

* **Admin** -- the developer/maintainer of the app (a single role-holder -- the
  user). Owns the deployment, schema, and master data ingestion (backend API push,
  Phase 11). Full read/write authority in the UI. Distinct from Internal because
  the user is one developer, not a team of planners.
* **Internal** -- planners at the organization (the people who currently send
  emails to factories). View the full plan, create/delete containers, propose
  configurations, and **commit** configurations as the finalized plan. Cannot
  edit open PO data fields (those come from admin's master push and the
  factories' own updates) and cannot export -- export remains an admin-only
  action.
* **Factory** -- external vendors supplying the POs. Each factory user views the
  full plan and proposes configurations by allocating their own assigned PO lines
  into existing containers. Factories edit **Cargo Ready Date** and the **CBM
  fields** (`cbmPerCase`, `cbmTotal`) on their own lines -- they own the
  manufacturing data and enter both CBM values themselves (the app does not derive
  one from the other). Two ways to update: edit interactively in the grid, **or**
  upload the same CSV they currently email us (Phase 10.5) -- a seamless
  transition from the existing workflow. Factories cannot create containers,
  cannot commit configurations, and cannot edit any other open PO column.

## Permissions Matrix

| Capability                                  | Admin | Internal | Factory                  |
|---------------------------------------------|-------|----------|--------------------------|
| View container assignments & configurations | Yes   | Yes      | Yes                      |
| View open PO status report                          | Yes   | Yes      | Yes (own lines only)     |
| Create / delete containers                  | Yes   | Yes      | No                       |
| Create configurations on a container        | Yes   | Yes      | Yes                      |
| Allocate rows into a configuration          | Yes   | Yes      | Yes (own lines only)     |
| Commit a configuration                      | Yes   | Yes      | No                       |
| Edit Cargo Ready Date                       | Yes   | No       | Yes (own lines only)     |
| Edit CBM fields (`cbmPerCase`, `cbmTotal`)  | Yes   | No       | Yes (own lines only)     |
| Edit any other open PO field               | Yes   | No       | No                       |
| Upload own factory CSV (partial update)     | No    | No       | Yes (own lines only)     |
| Export stuffing plan                        | Yes   | No       | No                       |

Master data ingestion (`open_po_items` table) is separate from the UI permission
model: admin pushes master data system-to-system via the Phase 11 API path, not
through any in-app upload action.

For the MVP / development phase, the CSV data from `stufferplannertemplate.csv` should be **hardcoded as sample data** so the app can be built and tested without requiring a file upload flow. In production, data ingestion will eventually move to an API push.

---

# Product Vision

The screen is divided into two sections:

## Left Panel: Container Planning Area

* Vertical scrollable tray of container cards.
* Each container is bound to a single destination and holds one or more
  **configurations** (proposals). The full model lives in [CONTCONFIG.md](CONTCONFIG.md).
* Users navigate between a container's configurations, add new ones, and (admin only)
  commit one as final.
* Admin can add or remove containers; both roles can propose configurations.

## Right Panel: Open PO Status Report

* Displays open PO items (hardcoded sample data for MVP).
* Supports sorting, filtering, and search.
* Rows display **derived** remaining quantities -- the view shifts as configurations
  are explored or committed (see [CONTCONFIG.md](CONTCONFIG.md)).
* Dragging a row onto a container opens an allocation modal asking how many cases to
  assign; the row is not directly attached to the container.

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
* Each container holds one or more configurations (proposals); navigation controls
  let users explore alternatives or add new ones.
* Container summary metrics reflect the **active configuration**, not the container
  as a whole.
* Admin-only: add containers (with destination + type), remove containers that have
  no committed configuration, commit a configuration. See [CONTCONFIG.md](CONTCONFIG.md).

## Drag and Drop

* Smooth animations.
* Drag overlay to prevent clipping.
* Reorder allocations within a container's active configuration.
* Dropping a grid row onto a container opens the allocation modal (destination must
  match the row's `shipTo`). See [CONTCONFIG.md](CONTCONFIG.md).

## State Management

* Track all open PO items (immutable until commit or data refresh).
* Track containers, their configurations, and the allocations within each
  configuration.
* Track which configuration is **active** (visible) and which is **committed** per
  container.
* Track UI state (focused container, modal state).
* Use derived selectors -- never store computed quantities like `committedConsumed`.
  See [CONTCONFIG.md](CONTCONFIG.md) for the formula.

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
| Column1             | Illustrative tag (`core`, `configA`, `configB`) showing two example configurations on one container: Config A = `core` ∪ `configA` rows, Config B = `core` ∪ `configB` rows. Not consumed by the app -- present only to demonstrate the configurations concept (see [CONTCONFIG.md](CONTCONFIG.md)). |

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

* Allocations nested inside configurations nested inside containers are painful to
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
      AllocationCard.tsx              # row inside a configuration
      AddContainerDialog.tsx          # destination + type picker (Phase 4)
      AllocationDialog.tsx            # quantity prompt (Phase 5.5)
      ConfigurationNav.tsx            # arrows + add / delete (Phase 5.6)
      CommitConfirmDialog.tsx         # commit prompt (Phase 7.5)

    drag/
      DragOverlayRenderer.tsx
      DroppableContainer.tsx
      SortableRow.tsx

  store/
    plannerStore.ts

  types/
    openPoItem.ts
    container.ts
    configuration.ts                  # Configuration + Allocation (Phase 5.5)

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

## Container and Configuration

The container model holds configurations rather than rows directly. The full model
(`Container`, `Configuration`, `Allocation`) lives in [CONTCONFIG.md](CONTCONFIG.md);
see "Data Model" there. Summary:

* `Container` -- bound to a single `destination`; holds an array of configurations,
  with one `activeConfigId` (currently displayed) and at most one `committedConfigId`
  (finalized). The container's effective `cargoReady` is **derived** at runtime as
  `max(cargoReady)` across rows in the active configuration -- not stored.
* `Configuration` -- a snapshot/proposal containing allocations; can be committed at
  most once.
* `Allocation` -- `{ openPoItemId, quantity }` within a configuration.

**Important:** Both `committedConsumed(row)` and `container.cargoReady` are derived
at runtime. Do **not** denormalize either onto stored data -- they update live as
factories edit Cargo Ready Date and as allocations change.

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

Each container card shows metrics for its **active configuration**:

* Number of allocated lines.
* Total CBM (sum of `cbmPerCase * allocation.quantity` across allocations).
* Total quantity (sum of allocation quantities).
* **Effective Cargo Ready Date** -- the `max(cargoReady)` across all rows allocated
  in the active configuration. Drives the container's earliest possible ship date;
  updates live as factories edit Cargo Ready Date on their lines and as users add
  or remove allocations.
* A clear indicator when the active configuration is the committed one.

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
   * Tables: `open_po_items`, `containers`, `configurations`, `allocations`, `profiles`
     (with `role: 'admin' | 'internal' | 'factory'` and `factory_name` for RLS).
     See [CONTCONFIG.md](CONTCONFIG.md) "Visibility & RLS" for the siloing columns.

10. **RLS is the security boundary, not the UI.** The three-role split is meaningless
    without Row Level Security policies in Postgres. Total siloing applies:
    factories see/edit only their own open PO items (`name = profiles.factory_name`),
    only the editable fields (`cargoReady`, `cbmPerCase`, `cbmTotal`), and only
    their own configurations (`factory_name = profiles.factory_name`). Plan
    policies before any factory UI is written -- see Phase 12 sub-task 2 and
    [CONTCONFIG.md](CONTCONFIG.md) "Visibility & RLS (Total Siloing)" for the
    canonical spec.

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

* Render the scrollable container tray (left panel).
* "Add Container" button opens a dialog asking for **destination** (selected from
  the distinct `shipTo` values in the loaded open PO items) and container **type**
  (`20GP` / `40GP` / `40HC` / `45HC`).
* A container is bound to one destination at creation. Only PO rows with matching
  `shipTo` can be allocated into it (enforced in Phase 5.5).
* Each container card displays its destination, type, and starts with one empty
  default configuration.
* Admin-only: remove containers that have no committed configuration.

Deliverables:

* Scrollable tray of container cards, each labeled with destination and type.
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

* When a row is dropped onto a container, open a modal asking how many cases to
  allocate. Full flow specified in [CONTCONFIG.md](CONTCONFIG.md).
* Modal shows: total quantity, quantity committed elsewhere, quantity already in
  this configuration, and a numeric input bounded by `1 <= n <= maxAllocatable`
  where `maxAllocatable = totalQty - committedConsumed - alreadyInThisConfig`.
* Reject the drop if the container's destination does not match the row's `shipTo`
  (hard block, not soft warning).
* On confirm, write an `Allocation` to the active configuration of the target
  container.
* Editing an existing allocation: clicking a row inside a container reopens the
  modal with the current quantity pre-filled. Setting to 0 removes the allocation.

Stack additions:

* `@radix-ui/react-dialog` for the modal (accessible, headless, ~5 KB).
* Zustand `immer` middleware for nested allocation updates.

Deliverables:

* Drag-and-drop opens the modal.
* Allocations persist in the store and re-render the grid via derived selectors.

---

## Phase 5.6 -- Configurations and Active Snapshot Navigation

Goal:

* Each container holds an array of `Configuration` objects (see [CONTCONFIG.md](CONTCONFIG.md)).
* Container card has navigation controls at the bottom: `<` previous, `>` next, `+`
  add, trash icon delete (disabled if the configuration is committed).
* Switching the active configuration on the focused container re-renders the master
  grid via the derived selector:
  ```
  displayed = totalQty - committedConsumed - activeConfigAllocation
  ```
  Rows where `displayed == 0` are hidden in that snapshot (collapsed, not deleted --
  the underlying open PO data is unchanged).
* Multiple configurations on the same container are alternatives. Only one can be
  committed (Phase 7.5).

Deliverables:

* User can create multiple configurations per container.
* User can navigate between them and watch the grid view change.
* No mutation to the underlying open PO data -- all visual changes are derived.

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

## Phase 7.5 -- Commit Flow

Goal:

* "Commit Configuration" button on the container card (**admin and internal**
  per the permissions matrix; hidden for factory users).
* Confirmation modal listing exactly what will be consumed.
* On commit:
  * Mark configuration `committed = true, committedAt = now()`.
  * `committedConsumed(row)` is derived at runtime as the sum of committed
    allocations across all containers -- no denormalized field is stored.
  * Other uncommitted configurations on the same container are flagged "stale".
  * Other uncommitted configurations on different containers that allocated the
    same rows may become "over-allocated" -- they get a warning indicator and
    cannot be committed until revised.
* Uncommit support: admin can reverse a commit. The previous baseline is restored.
  Toasts confirm both commit and uncommit.

Stack additions:

* `sonner` for toast feedback (~3 KB).
* Reuse the Phase 5.5 Radix Dialog for the confirmation modal.

Deliverables:

* Commit consumes PO quantities; the master grid baseline shifts.
* Stale and over-allocated indicators visible on affected configurations.
* Uncommit restores the previous baseline.

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

All three roles render the **same** `AppLayout` (containers + grid) so the evolving
plan is visible to everyone. This phase wires the role-based restrictions inside
the shared components via `useAuth()` per the permissions matrix in this document.

### Internal role

* Container tray + configuration nav: full access -- create / delete containers,
  create configurations, **commit** configurations.
* Open PO grid: all rows visible; **all columns `editable: false`** (Internal owns
  planning, not data).
* No "Upload Excel" toolbar (factory-only feature, Phase 10.5).

### Factory role

* Container tray: hide "Add Container" / "Delete Container" buttons. Hide the
  "Commit Configuration" button.
* Open PO grid: filter to rows where `item.name === factoryName`. Mark all
  columns as `editable: false` *except* `cargoReady`, `cbmPerCase`, and `cbmTotal`.
  Both CBM values are entered manually -- the app does **not** auto-derive one
  from the other.
* Allocation modal (Phase 5.5): only allow allocations from rows the factory owns;
  cap quantity at the factory's available quantity on that line.
* Bulk-update path: see Phase 10.5 for the CSV upload alternative.

### Admin role

* Full UI authority (matches the matrix). No restrictions applied.
* Master data ingestion happens out-of-band via Phase 11's API push -- no UI
  surface for it.

### Header

Show a role badge: "Admin" / "Internal" / "Factory". Drop the "Read-only" badge
from the Phase 1 scaffolding -- factories now have write access to their own
lines.

Changes to factory data and to anyone's proposed/committed configurations are
reflected in the other roles' views (real-time once Phase 12 realtime
subscriptions are wired).

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

Once Supabase is in place, master data lives in the `open_po_items` table. Pushes
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

1. **Schema migration.** Create `supabase/migrations/0001_init.sql` with `open_po_items`,
   `containers`, `configurations`, `allocations`, and `profiles` tables. Dates as
   `timestamptz`, `raw` as `jsonb`, foreign keys for container assignment, and
   `factory_name` columns where required for siloing (see CONTCONFIG.md).

2. **RLS policies (total siloing).** Enable RLS on `open_po_items`, `containers`,
   `configurations`, `allocations`, and `profiles`. Each PO has exactly one factory
   owner, so the `open_po_items` filter is the foundation; allocations and
   configurations cascade from it. The full policy spec lives in
   [CONTCONFIG.md](CONTCONFIG.md) "Visibility & RLS (Total Siloing)". Summary:
   * `admin` and `internal`: full read/write across all tables.
   * `factory` on `open_po_items`: `SELECT` and `UPDATE` (only `cargoReady`,
     `cbmPerCase`, `cbmTotal`) where `name = profiles.factory_name`.
   * `factory` on `configurations`: `SELECT` and `INSERT` where
     `factory_name = profiles.factory_name`. No `UPDATE` (cannot commit).
   * `factory` on `allocations`: `SELECT` and `INSERT` only via own
     configurations and own open PO items (transitive from the two filters above).
   * Cross-factory leakage is structurally impossible: a factory never sees
     another factory's open PO items, allocations, or configurations -- proposed or
     committed.

3. **Auth wiring.** Replace the placeholder `AuthProvider` from the deployment
   scaffolding with a real Supabase session. Email or magic-link login. Role read from
   the `profiles` table.

4. **`SupabaseRepo` implementation.** New file implementing the Phase 2.5
   `OpenPoRepo` / `ContainerRepo` interfaces using `@supabase/supabase-js`. Toggle
   between local and remote via an env var (e.g. `VITE_DATA_SOURCE=local|supabase`).

5. **Realtime subscriptions.** Admin and internal sessions subscribe to
   `open_po_items`, `configurations`, and `allocations` so factory edits and
   configuration changes propagate without a refresh. Realtime events are
   filtered by RLS automatically -- each session only receives events for rows
   it can see, so siloing holds for live updates as well.

6. **Seed data.** Port `stufferPlannertemplate.csv` into `supabase/seed.sql` so
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
