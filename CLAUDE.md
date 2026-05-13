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

There are two user roles:

* **Admin** -- manages the overall stuffing plan, uploads data, assigns rows to containers, and exports the final plan.
* **Factory** -- interacts with the app only to provide **Cargo Ready Dates** for their assigned lines. Factories do not upload files or modify container assignments.

For the MVP / development phase, the CSV data from `stufferplannertemplate.csv` should be **hardcoded as sample data** so the app can be built and tested without requiring a file upload flow. In production, data ingestion will eventually move to an API push.

---

# Product Vision

The screen is divided into two sections:

## Left Panel: Container Planning Area

* Vertical scrollable tray.
* Contains one or more container cards.
* Each container displays assigned rows.
* Users can drag rows between containers.
* Users can add or remove containers.

## Right Panel: Shipment Data Grid

* Displays shipment rows (hardcoded sample data for MVP).
* Supports sorting, filtering, and search.
* Rows can be dragged into containers.
* Assigned rows are visually marked.

---

# Core Functional Requirements

## Data Ingestion

* **MVP:** Sample data is hardcoded from `stufferplannertemplate.csv`.
* **Future:** Admin uploads CSV, or data is pushed via API.
* Factory users do **not** upload data -- they only update Cargo Ready Dates.

## Data Grid

* Excel-like grid.
* Sort and filter columns.
* Search.
* Row selection.
* Drag source support.

## Container Tray

* Scrollable list of containers.
* Add container button.
* Remove empty containers.
* Container summary metrics.

## Drag and Drop

* Smooth animations.
* Drag overlay to prevent clipping.
* Reorder items.
* Move rows between grid and containers.

## State Management

* Track all rows.
* Track assigned rows.
* Track container contents.
* Track UI state.

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
| Column1             | Configuration group (core, configA, configB)     |

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

## File Import (Future / Admin Only)

### Papa Parse

* Only needed when admin CSV upload is implemented.
* Not required for MVP since data is hardcoded.

---

# Suggested Project Structure

```text
src/
  components/
    layout/
      AppLayout.tsx
      SplitPane.tsx

    grid/
      ShipmentGrid.tsx

    containers/
      ContainerTray.tsx
      ContainerCard.tsx
      ContainerRowCard.tsx
      AddContainerButton.tsx

    drag/
      DragOverlayRenderer.tsx
      DroppableContainer.tsx
      SortableRow.tsx

  store/
    plannerStore.ts

  types/
    shipment.ts
    container.ts

  utils/
    dateHelpers.ts
    exportPlanner.ts

  hooks/
    usePlannerMetrics.ts

  data/
    sampleData.ts

  App.tsx
  main.tsx
```

---

# Data Models

## Shipment Row

```ts
interface ShipmentRow {
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

## Container

```ts
interface Container {
  id: string;
  name: string;
  type: '20GP' | '40GP' | '40HC' | '45HC';
  rowIds: string[];
}
```

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
* Visible drop targets.
* Ability to move rows back to grid.

---

# Container Metrics

Each container should show:

* Number of rows.
* Total CBM.
* Total quantity.

Potential future enhancement:

* Capacity utilization percentages.

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

## Phase 2 -- Hardcoded Sample Data

Goal:

* Create `sampleData.ts` with rows from `stufferplannertemplate.csv`.
* Convert Excel serial dates to readable dates.
* Store data in Zustand.

Deliverables:

* Sample data available in store, visible in console or JSON preview.

---

## Phase 3 -- Shipment Grid

Goal:

* Render AG Grid with sample data.
* Sorting/filtering.

Deliverables:

* Functional spreadsheet-like grid.

---

## Phase 4 -- Container Tray

Goal:

* Display one default container.
* Add/remove containers.

Deliverables:

* Scrollable tray of container cards.

---

## Phase 5 -- Drag from Grid to Containers

Goal:

* Drag rows into containers.

Deliverables:

* Rows assigned to containers.

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

## Phase 10 -- Factory Cargo Ready Date Entry

Goal:

* Factory users can view their assigned lines.
* Factory users can edit only the Cargo Ready Date field.
* Changes are reflected in the admin view.

---

## Phase 11 -- Admin CSV Upload (Replace Hardcoded Data)

Goal:

* Admin can upload CSV via file input.
* Parse with Papa Parse.
* Replace hardcoded sample data with uploaded data.

---

## Phase 12 -- Supabase Persistence (Optional)

Goal:

* Save/load plans.
* Authentication.

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
