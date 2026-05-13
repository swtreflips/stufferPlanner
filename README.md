# Stuffer Planner

A web application for planning container stuffing assignments. Replaces the manual workflow of emailing Excel spreadsheets back and forth by providing a visual drag-and-drop interface for assigning shipment rows to shipping containers.

## How It Works

- **Admin** views all shipment data in an Excel-like grid, drags rows into container cards, and exports the final stuffing plan.
- **Factory** users interact only to provide Cargo Ready Dates for their assigned lines.

## Tech Stack

- **React** + **TypeScript** (Vite)
- **AG Grid Community** -- Excel-like data grid
- **dnd-kit** -- drag and drop
- **Zustand** -- state management
- **Tailwind CSS** -- styling

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
src/
  components/
    layout/       # AppLayout, SplitPane
    grid/         # Shipment data grid
    containers/   # Container tray and cards
    drag/         # Drag overlay and sortable rows
  store/          # Zustand store
  types/          # TypeScript interfaces
  utils/          # Date helpers, export utilities
  hooks/          # Custom hooks
  data/           # Hardcoded sample data (MVP)
```

## Development

This project follows a phased development approach. See [CLAUDE.md](CLAUDE.md) for the full plan and coding guidelines.
