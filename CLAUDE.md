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

There are three user roles. **All three see the same shared planning view** — one
live tray of draft and committed containers + the master PO grid. Anyone can drag
rows into containers and arrange the plan; the social convention is that internal
has priority for arrangement and factories only rearrange when necessary. **Only
internal/admin can commit** a container (turn a draft into an OFQ that reduces
master availability). Each user is linked to a `supplier_id` via the `profiles`
table (factory users only); RLS scopes the master grid to that supplier. The
planning model is specified in [CONTCONFIG.md](CONTCONFIG.md); the identity /
RLS model is in [CONTCONFIG.md](CONTCONFIG.md) "Identity & RLS".

* **Admin** -- the developer/maintainer of the app (a single role-holder -- the
  user). Owns the deployment, schema, and master data ingestion (backend API
  push, Phase 11). Full read/write authority in the UI. Only admin can
  **uncommit** a committed container.
* **Internal** -- planners at the organization (the people who currently send
  emails to factories). Full read/write on draft arrangement. Can **commit** a
  container (creates an OFQ with explicit line items + quantities; reduces
  master availability globally). Cannot edit open PO data fields (those come
  from admin's master push and the factories' own updates) and cannot export --
  export remains an admin-only action.
* **Factory** -- external vendors supplying the POs. Can drag and arrange like
  anyone else (with the social convention noted above). Cannot commit or
  uncommit. The factory's primary write surface is on master items: edit
  **Cargo Ready Date** and the **CBM fields** (`cbmPerCase`, `cbmTotal`) on
  their own lines -- they own the manufacturing data and enter both CBM values
  themselves (the app does not derive one from the other). Two update paths:
  edit interactively in the grid, **or** upload the same CSV they currently
  email us (Phase 10.5).

## Permissions Matrix

| Capability                                  | Admin | Internal | Factory |
|---------------------------------------------|-------|----------|---------|
| View all containers (draft + committed)     | Yes   | Yes      | Yes     |
| View open PO status report                  | Yes   | Yes      | Yes (own lines only) |
| Create / delete draft containers            | Yes   | Yes      | Yes     |
| Allocate rows into a draft container        | Yes   | Yes      | Yes     |
| Empty a draft container                     | Yes   | Yes      | Yes     |
| Remove / edit individual allocations        | Yes   | Yes      | Yes     |
| Commit a container (create OFQ)             | Yes   | Yes      | No      |
| Uncommit a container                        | Yes   | No       | No      |
| Edit Cargo Ready Date                       | Yes   | No       | Yes (own lines only) |
| Edit CBM fields (`cbmPerCase`, `cbmTotal`)  | Yes   | No       | Yes (own lines only) |
| Edit any other open PO field                | Yes   | No       | No      |
| Upload own factory CSV (partial update)     | No    | No       | Yes (own lines only) |
| Export stuffing plan                        | Yes   | No       | No      |

Master data ingestion (`master_items` table) is separate from the UI permission
model: admin pushes master data system-to-system via the Phase 11 API path, not
through any in-app upload action.

For the MVP / development phase, the CSV data from `plannerData.csv` should be **hardcoded as sample data** so the app can be built and tested without requiring a file upload flow. In production, data ingestion will eventually move to an API push.

---

# Product Vision

The screen is divided into two sections:

## Left Panel: Container Planning Area

* Vertical scrollable tray of container cards. One shared view for all roles.
* Committed containers (OFQs) pinned at the top, read-only with their OFQ
  reference visible. Drafts below, editable by anyone.
* Each container is bound to a single destination at creation. Allocations only
  succeed when the row's `shipTo` matches.
* Anyone can drag, allocate, empty, and delete drafts. Only internal/admin can
  commit; only admin can uncommit. Full model in
  [CONTCONFIG.md](CONTCONFIG.md).

## Right Panel: Open PO Status Report

* Displays open PO items (hardcoded sample data for MVP).
* Supports sorting, filtering, and search.
* Shows derived `Available` per row: `original − committed − sum(drafts)`. Rows
  with `available = 0` dim. Rows where `committed = original` (fully shipped)
  disappear entirely.
* Dragging a row onto a draft container opens an allocation modal asking how
  many cases to assign; the row is not directly attached to the container.

---

# Core Functional Requirements

## Data Ingestion

* **MVP:** Sample data is hardcoded from `plannerData.csv` (Phase 2).
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
* Containers exist in one of two states: **draft** (editable) or **committed**
  (an OFQ; read-only, pinned at the top).
* Anyone can add draft containers (destination + type), allocate, empty, delete
  drafts. Only internal/admin can commit (with OFQ reference). Only admin can
  uncommit. See [CONTCONFIG.md](CONTCONFIG.md).

## Drag and Drop

* Smooth animations.
* Drag overlay to prevent clipping.
* Reorder allocations within a draft container (Phase 6).
* Dropping a grid row onto a draft container opens the allocation modal
  (destination must match the row's `shipTo`). Committed containers are not drop
  targets. See [CONTCONFIG.md](CONTCONFIG.md).

## State Management

* Track all open PO items (`master_items`; only `committed_quantity` mutates, on
  container commit/uncommit).
* Track containers (draft and committed in one collection) and allocations.
* Track UI state (focused container, modal state).
* Use derived selectors -- never store computed quantities. `availableQty(item)`
  is derived from `original − committed − draft allocations`. See
  [CONTCONFIG.md](CONTCONFIG.md).

## Export

* Export current stuffing plan to CSV.

---

# Sample Data Schema

The hardcoded sample data comes from `plannerData.csv`. The CSV contains 20+ raw
columns; only the ones below are surfaced on the planning grid. Everything else
flows through to `MasterItem.raw` for forward-compat with future API ingestion.

**Displayed columns** (in order):

| Column              | Source field          | Notes |
|---------------------|-----------------------|-------|
| Name                | `name`                | Supplier / vendor (e.g. "Ditar S.A", "Tejaswi Plastic Pvt Ltd."). One PO is issued to one supplier; suppliers have no relationship with each other. |
| Document Number     | `documentNumber`      | Purchase order number (e.g. "PO155276"). |
| Ship To             | `shipTo`              | Destination (e.g. "Orlando, FL", "Simi Valley, CA"). |
| Item                | `sku`                 | SKU / product code. Maps to the CSV's `Name_1` column. |
| Quantity Remaining  | `originalQuantity`    | Master quantity at app boot. Only `Commit` mutates the balance via `committedQuantity`. |
| Committed           | `committedQuantity`   | Derived from commit operations across containers. |
| Available           | (derived selector)    | `originalQuantity − committedQuantity − sum(allocations in drafts)`. |
| CBM per Case        | `cbmPerCase`          | Cubic meters per case. |
| Total CBM           | `cbmTotal`            | Total CBM for the line. Taken **directly** from the CSV — does **not** always equal `cbmPerCase × quantity` due to source rounding. Treat CSV as authoritative. |
| Cargo Ready         | `cargoReady`          | Factory-editable in Phase 10. |

**Other columns ignored on the grid** but preserved in `raw`: Date Issued, Requested Ship By, Status, Line ID, ETD, ETA, Due Date/Receive By, Estimated delivery date, days late, EXPO, Container, Notes.

**Note on dates:** the CSV mixes formats — m/d/yyyy strings (Ditar rows) and Excel serial numbers (Tejaswi rows) in the same `Date Issued` column. The sample-data parser normalizes the displayed dates to ISO. For the columns we surface today, only `Cargo Ready` is shown and it is m/d/yyyy across the dataset.

**Note on Line ID:** most rows have a blank `Line ID` (single-line POs). The parser defaults missing line IDs to `1` so that `${documentNumber}-${lineId}` remains a stable unique key.

**Companion seeds:** [src/data/sampleData.ts](src/data/sampleData.ts) also exports `sampleSuppliers` (Ditar + Tejaswi) and `sampleProfiles` (Mike admin, Internal, Michelle/Ditar, Prasad/Tejaswi). Every master item is linked to a supplier via `supplierId`. These drive both the placeholder `AuthProvider` and the supplier-scoped grid filter for factory users. The shape mirrors the Phase 12 `suppliers` and `profiles` tables — the swap is one-for-one.

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

* Allocations nested inside containers are painful to update without it.

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
      CommitConfirmDialog.tsx         # commit prompt + OFQ ref (Phase 7.5)

    drag/
      DragOverlayRenderer.tsx
      DraggableRowHandle.tsx

  store/
    plannerStore.ts

  types/
    masterItem.ts                     # MasterItem (renamed from openPoItem in Phase 4)
    container.ts                      # Container { status, ofqReference, ... }
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

## Master Item

```ts
interface MasterItem {
  id: string;
  name: string;
  dateIssued: string;
  documentNumber: string;
  shipTo: string;
  requestedShipBy: string;
  status: string;
  lineId: number;
  sku: string;
  originalQuantity: number;
  committedQuantity: number;
  cbm: number | null;
  cargoReady: string;
  etd: number | null;
  eta: string | null;
  cbmPerCase: number;
  cbmTotal: number;
  raw: Record<string, any>;
}
```

## Container, Allocation

The planning model uses two entities (plus master items). Full schema in
[CONTCONFIG.md](CONTCONFIG.md) "Schema". Summary:

* `Container` -- bound to a single `destination` and a `type` (20GP/40GP/40HC/45HC).
  Has a `status`: `'draft'` (editable) or `'committed'` (an OFQ; has
  `ofqReference`). Commit is per-container.
* `Allocation` -- `{ containerId, masterItemId, quantity }`. The qty is
  splittable across multiple containers. Stays attached after commit as the
  historical record of what shipped.

**Derived, never stored:** `availableQty(item) = original − committed −
sum(draft allocations)`, container metrics (line count, total CBM, total qty),
and the container's effective Cargo Ready Date (`max(cargoReady)` across its
allocations). All update live from the source data — do not denormalize them
onto stored rows.

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
* Status badge: `draft` or `committed` (with OFQ reference + commit date).

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

9. **Schema decisions before Phase 12.** The current `MasterItem` uses string dates
   and a `raw: Record<string, unknown>` blob. For Postgres:
   * Dates: store as `timestamptz`, not strings.
   * `raw` becomes a `jsonb` column.
   * Tables: `suppliers`, `profiles`, `master_items` (renamed from
     `open_po_items`; gains `supplier_id` FK), `containers` (gains
     `committed_by` FK to `auth.users`), `container_allocations`.
     Full DDL in [CONTCONFIG.md](CONTCONFIG.md) "Identity & RLS".

10. **RLS is the security boundary, not the UI.** Suppliers are a first-class
    entity (`suppliers` table). Each profile carries `supplier_id` for
    factory users; admin/internal have `supplier_id IS NULL`. Factory RLS is a
    uuid join, not a string match — Tejaswi's user on `prasad.tejaswiplastic@gmail.com`
    is one reason domain-based mapping isn't viable. Editable fields for
    factories on `master_items`: `cargo_ready`, `cbm_per_case`, `cbm_total` on
    rows where `supplier_id = profile.supplier_id`. Commit/uncommit gated to
    internal/admin (uncommit admin-only). See [CONTCONFIG.md](CONTCONFIG.md)
    "Identity & RLS" for the canonical spec.

## Application Structure

11. **Add a router now.** `App.tsx` currently renders `AppLayout` directly. Two roles
    + auth = `react-router-dom`. Scaffold routing before Phase 2 features ship so the
    app does not need to be restructured later.

12. **Auth gate placeholder.** Wrap routes in an `AuthProvider` that, for now,
    hardcodes `{ role: 'admin' }`. Components that branch on role can be written
    correctly today; the provider's internal implementation gets swapped for Supabase
    Auth in Phase 12.

13. **Move the sample CSV to a real seed.** `plannerData.csv` is fine as
    the source of truth for Phase 2 sample data. Plan for `supabase/seed.sql` (or a
    Node import script) so the same data can populate a real DB without copy-paste.

---

## Phase 2 -- Hardcoded Sample Data

Goal:

* Create `sampleData.ts` with rows from `plannerData.csv`.
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
* New containers start as empty drafts. All users can delete drafts; committed
  containers cannot be deleted, only uncommitted (admin only).

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
* Modal shows: original quantity, committed (OFQs), allocated in drafts, and the
  available cap for this draft. Numeric input bounded by `1 <= n <= available(item)`.
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
* Allocations persist in the store and re-render the grid's Available column
  via the derived selector.

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
  * Flip container `status = 'committed'`, set `ofq_reference`, `committed_at`.
    Pinned at the top of the tray, read-only.
  * Increment `master_items.committed_quantity` per allocation.
* Uncommit (admin-only): reverses the commit. Decrements
  `master_items.committed_quantity`, flips the container back to `draft`, nulls
  `ofq_reference` and `committed_at`.

Stack additions:

* `sonner` for toast feedback (~3 KB).
* Reuse the Phase 5.5 Radix Dialog for the confirmation modal.

Deliverables:

* Commit produces an OFQ; the master grid availability column shifts globally
  and fully-committed rows disappear from the grid.
* Admin can uncommit a container; quantities return to the grid.

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

All three roles render the **same** `AppLayout` (container tray on the left,
open PO grid on the right). Everyone sees the same shared planning world. The
difference between roles is what they can **do**, enforced by `useAuth()` checks
on the UI side and (in Phase 12) by RLS on the data side.

### Internal role

* Container tray: full access -- create / delete draft containers, allocate any
  PO line, empty drafts, **commit a container** to create an OFQ. Cannot
  uncommit (admin-only).
* Open PO grid: all rows visible; **all columns `editable: false`** (internal
  owns planning, not data).
* No "Upload Excel" toolbar (factory-only feature, Phase 10.5).

### Factory role

* Container tray: same shared view. Can drag rows in / out, create draft
  containers, empty drafts. **Cannot commit or uncommit.** Social convention:
  internal has priority for arrangement; factories rearrange only when
  necessary.
* Open PO grid: filter to rows where `item.name === factoryName`. Mark all
  columns as `editable: false` *except* `cargoReady`, `cbmPerCase`, and
  `cbmTotal`. Both CBM values are entered manually -- the app does **not**
  auto-derive one from the other.
* Bulk-update path for the editable fields: see Phase 10.5 (CSV upload).

### Admin role

* Full UI authority (matches the matrix). Can uncommit a container.
* Master data ingestion happens out-of-band via Phase 11's API push -- no UI
  surface for it.

### Header

Show a role badge: "Admin" / "Internal" / "Factory" and the open-PO count. Drop
any legacy "Read-only" badge -- all roles have write access to drafts.

Changes propagate to other roles' views in real time once Phase 12 realtime
subscriptions are wired.

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

* Documented row payload shape (matches `MasterItem` minus client-only fields
  like `id`, `raw`, `assignedContainerId`).
* Push endpoint (PostgREST table or Edge Function) reachable with admin
  credentials / service role key.
* `scripts/seed.ts` (Node) that reads `plannerData.csv` and emits
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
   `suppliers`, `profiles`, `master_items` (with `supplier_id` FK),
   `containers` (with `committed_by` FK), and `container_allocations` tables.
   Dates as `timestamptz`, `raw` as `jsonb`. Full DDL in
   [CONTCONFIG.md](CONTCONFIG.md) "Identity & RLS".

2. **RLS policies.** Enable RLS on all tables. Full policy spec in
   [CONTCONFIG.md](CONTCONFIG.md) "Identity & RLS". Summary:
   * `admin` and `internal`: full read/write; both can commit, only admin can
     uncommit.
   * `factory` on `master_items`: `SELECT` and `UPDATE` only rows where
     `supplier_id = profile.supplier_id`; updatable columns restricted to
     `cargo_ready`, `cbm_per_case`, `cbm_total` via a BEFORE UPDATE trigger.
   * `factory` on `containers`: `SELECT` all; INSERT / DELETE / UPDATE on
     drafts only; no commit / uncommit.
   * `factory` on `container_allocations`: `SELECT` all; full CRUD on rows
     attached to draft containers.

3. **Auth wiring.** Replace the placeholder `AuthProvider` (which currently
   resolves the placeholder profile by URL: `/admin`, `/internal`,
   `/factory/:supplierSlug`) with a real Supabase session. Email or magic-link
   login. Profile row fetched on session; the `AuthContextValue` shape is
   identical, so consumers don't change.

4. **`SupabaseRepo` implementation.** New files implementing the Phase 2.5 repo
   interfaces (`MasterItemRepo`, `ContainerRepo`, `AllocationRepo`) using
   `@supabase/supabase-js`. Toggle between local and remote via an env var
   (e.g. `VITE_DATA_SOURCE=local|supabase`).

5. **Realtime subscriptions.** All sessions subscribe to `master_items`,
   `containers`, and `container_allocations`. Edits propagate live -- that's
   the whole point of replacing the Excel ping-pong. RLS filters write-paths,
   not the read stream (everyone reads everything).

6. **RPC functions.** Two Postgres functions: `commit_container`,
   `uncommit_container`. Bodies sketched in [CONTCONFIG.md](CONTCONFIG.md)
   "Backend operations".

7. **Seed data.** Port `plannerData.csv` into `supabase/seed.sql` so
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
