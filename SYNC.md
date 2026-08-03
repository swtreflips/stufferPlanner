# SYNC — the weekly ERP snapshot

How PO data gets from NetSuite into the planner, what the system decides on its own, what it
refuses to decide, and where to reach in when it does something you did not want.

> **The SQL for this lives in the RatesApp repo**, not here — `RatesApp/supabase/migrations/`.
> One Supabase project (`sfozxpibfpqsdlxoheyl`) serves RatesApp, Schedules and the planner, and
> its migrations have one home. This repo holds the client. See [STUFFER.md](STUFFER.md).

---

## 1. The mental model

**The file is a photograph, not a list of instructions.**

Every Monday's export is a complete picture of what is open right now. It does not say "add
these, remove those" — it just shows you the world. The sync's whole job is to make the table
match the photograph and to describe, in writing, what changed.

That single decision explains almost everything else:

```
in the file, not in the table   →  INSERT     a PO line you have not seen before
in the file and in the table    →  UPDATE     quantities, dates, destination moved
in the table, not in the file   →  CLOSE      it stopped being open. never DELETE.
```

You never compute a delta. You never tell it what changed. You hand it the photograph.

### Why this rather than "additive"

An additive model — append new rows, subtract removed ones — requires something to work out
what was added and subtracted, and that something has to hold last week's file to compare
against. Miss a week, upload out of order, or upload the same file twice and it drifts.

A snapshot cannot drift. The table either matches the photograph or it does not. Uploading the
same file twice is a no-op by construction, not by a guard someone remembered to write.

### The one thing the export never tells you

**Why a line left.** It appears one week and is absent the next; the file is silent about the
reason. Fulfilled, cancelled, or typed in wrong and deleted — all three look identical from the
outside.

The system therefore guesses, says out loud that it is guessing, and gives you one click to
replace the guess with what you know. That distinction is carried in separate database columns
and separate visual treatment all the way to the screen — see §5.

---

## 2. The weekly ritual

1. Export the PO report from NetSuite.
2. Account menu (top right) → **Settings** → drop the file on **PO data**.
3. Read the five counts and the notes beneath them.
4. **Apply**, or **Cancel** and go fix the export.
5. If anything closed, glance at **Closed lines** and confirm the ones you know about.

Nothing is written until you press Apply. The preview is safe to run as often as you like.

**Only internal and admin see any of this.** Suppliers get the same inert `Settings` placeholder
they had before, `/settings` redirects them to the board, and the functions refuse them even if
they call them directly. The redirect is a convenience; the refusal is the boundary.

---

## 3. The flow, end to end

```
  plannerInput.csv
        │
        │  parsePlannerInput()                 src/utils/plannerInputParser.ts
        │  · reads columns BY POSITION
        │  · M/D/YYYY → ISO
        │  · unmapped, non-empty columns → raw
        ▼
  SnapshotRow[]                                src/utils/plannerInputParser.ts
        │
        │  previewSync()  ──▶ planner_sync_preview(rows)   READ ONLY
        │  applySync()    ──▶ sync_po_lines(rows, 'csv', force)
        │                                      src/data/repos/SupabaseMasterItemRepo.ts
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  planner_po_line_diff(rows)      ← the ONLY place that       │
  │  decides insert/update/close/reopen/unchanged                │
  └─────────────────────────────────────────────────────────────┘
        │                                    │
        │ preview: summarise and stop        │ apply: summarise, then write
        ▼                                    ▼
    SyncSummary                    planner_po_lines          (rows)
                                   planner_po_line_status_events (the arc)
                                   planner_import_batches    (the receipt)
                                        │
                                        ▼
                                   SyncSummary   ← same shape, same numbers
```

**Preview and apply are not two implementations.** They call one diff function. The preview is
that calculation with the writing half left off. This is why the confirm screen can promise what
Apply will do — the numbers on it *are* Apply's arithmetic, shown early.

> A `dry_run` flag would not have achieved this. A Postgres function cannot roll back its own
> transaction, so "do it then undo it" was never available. The preview had to *be* the read-only
> half rather than a discarded write.

### Where each piece lives

| Piece | Path |
|---|---|
| Column mapping, date parsing | `src/utils/plannerInputParser.ts` |
| Upload UI, preview, apply | `src/features/sync/PoSyncPanel.tsx` |
| Closure review, confirming | `src/features/sync/ClosedLinesPanel.tsx` |
| Reason wording, guess vs fact | `src/features/sync/reasons.ts` |
| Page shell, internal-only gate | `src/pages/SettingsPage.tsx` |
| RPC calls, row mapping | `src/data/repos/SupabaseMasterItemRepo.ts` |
| Types | `src/types/sync.ts` |
| Columns, triggers, view | `RatesApp/supabase/migrations/20260802120000_planner_po_line_sync.sql` |
| Diff, sync, confirm functions | `RatesApp/supabase/migrations/20260802130000_planner_sync_functions.sql` |

---

## 4. Closed, never deleted

This is not a preference. Three facts in the schema had already settled it:

| Fact | Consequence |
|---|---|
| `planner_allocations.po_line_id` is `NO ACTION` | A line sitting in **anyone's** container cannot be deleted. The delete raises and takes the whole batch with it. |
| `planner_po_line_events` is `ON DELETE CASCADE` | Deleting a line destroys its cargo-ready history **and** its CBM observations. `planner_cbm_reference` is built on those; deleting fulfilled lines erodes the estimator a little every week. |
| There is no `DELETE` policy on `planner_po_lines` | Nothing can delete today regardless. |

Plus one operational fact: **lines come back.** A reopened PO, or a row dropped by a filter
glitch, would lose every bit of supplier enrichment — cargo ready, CBM, all of it — on the way
out. Closing keeps it, so reopening is free and lossless.

**What closing does:** `status='closed'`, `closed_at` stamped, a reason inferred, a row in
`planner_po_line_status_events`. Nothing else moves. Quantities, dates, cargo ready and CBM all
freeze exactly as the last export left them, which is what makes the closure readable later.

**What closing does NOT do:** touch allocations, containers, or committed quantities. If cases
were planned into a container, they stay there and the card is flagged. See §7.

---

## 5. Why a line closed — three columns, not one

A cancelled line and a mis-entered line both vanish with quantity still available. They are
indistinguishable by their final numbers. So the system does not pretend to know:

| Layer | Column | Written by | Certainty |
|---|---|---|---|
| **Observed** | the frozen row, `snapshots_seen`, `reopen_count` | the sync | fact |
| **Inferred** | `closed_reason_inferred` | the sync | **a guess** |
| **Confirmed** | `closed_reason_confirmed`, `closed_note` | **a person only** | fact |

`planner_po_line_closures` exposes `reason` (confirmed if present, else inferred) travelling
alongside `reason_is_confirmed`, so no consumer can mistake one for the other.

### The inference rules, in order

```
quantity_available = 0                          → fulfilled
quantity > quantity_available (shipped some)    → cancelled
snapshots_seen = 1 and nothing ever shipped     → withdrawn      ← the data-entry case
otherwise                                        → unknown
```

**`snapshots_seen` is what makes `withdrawn` separable at all.** It counts the Mondays a line
appeared in. A line seen in exactly one export that never moved a case, gone by the next, is the
signature of a correction — not a decision someone made. One integer, and the only signal
available.

`unknown` is a real answer and is shown as one. It is not rounded up to the nearest guess.

### Confirming never overwrites the guess

`confirm_po_line_closure()` writes only the confirmed columns. `closed_reason_inferred` stays
exactly as the sync left it — permanently — so *"what did the system think, and was it right?"*
stays answerable. That is the only way to find out whether the withdrawn rule is any good:

```sql
select closed_reason_inferred, closed_reason_confirmed, count(*)
  from planner_po_lines
 where closed_reason_confirmed is not null
 group by 1, 2 order by 3 desc;
```

If `withdrawn → cancelled` dominates that table after a few months, the rule is wrong and §9
tells you where to change it.

### On screen

| | Renders as |
|---|---|
| Inferred | *muted italic*, `?` icon, hover explains the evidence |
| Confirmed | **plain bold**, ✓ icon |

A reopen is evidence too: `reopen_count > 0` shows as "came back N times before", because a line
that has returned once retroactively discredits any confident reading of the next closure.

---

## 6. What the sync refuses, and why

| Situation | Behaviour | Reasoning |
|---|---|---|
| Vendor name matches no organization | **Abort.** Names the vendors. Nothing written. | Skipping those rows would make that supplier *absent from the file*, and close-detection would then close every line they own. A renamed vendor would wipe a factory off the board. |
| `(document_number, sku)` repeated in the file | **Abort.** Names the offenders. | That pair is the natural key. Two rows claiming it means the export is not what this assumes; picking a winner would silently discard real quantity. |
| Empty file | **Abort.** | Otherwise it closes everything. |
| A supplier missing from the file entirely | **None of their lines close.** Silent. | Far more likely a filter left on the export than every one of their POs completing at once. |
| Would close >25% of open lines in scope | **Preview shows it. Apply refuses** unless you tick the box. | A truncated download looks exactly like this. |

The blast-radius floor is `greatest(5, 25% of open lines in scope)`, so a small legitimate week
is never blocked by a percentage.

> **The preview always shows the damage even when Apply would refuse it.** Refusing to *show* you
> what a suspicious file would do is how someone ends up guessing. You see "this closes 208 of
> 258", then decide.

---

## 7. Conflicts — where the ERP disagrees with a plan

A conflict is never an error and never blocks the sync. The ERP is the source of truth; a
planner who disagrees needs to *see* the disagreement, not be stopped by it.

| Conflict | Means | The sync does | You do |
|---|---|---|---|
| `closed_while_allocated` | A line stopped being open while its cases sit in a container | Closes the line. **Leaves the allocation alone.** Tags the allocation `closed`, counts it on the container card | Decide: pull it out, or ship it anyway because it is already made |
| `over_committed` | New quantity is below what is already committed | Writes the ERP's number. Committed stays | Reduce the allocation, or find out why the ERP dropped |
| `supplier_changed` | The vendor on an allocated line changed | Writes the new organization | Check the container — it belongs to the old supplier |

**`over_committed` is why a database constraint had to move.** `check (committed_quantity <=
quantity)` used to abort the *entire batch* the first time the ERP revised a partially-shipped
line downward — one supplier's arithmetic stopping Monday for all eighteen. It is now a trigger
that refuses an **increase in the commitment** rather than a **decrease in the quantity**. The
invariant belongs to the allocation path; the source of truth must stay free to tell the truth.

### Where conflicts surface

- **In the preview and result** — named, with the quantity involved
- **On the container card** — "N closed" under the case count, visible without opening it
- **On the allocation row** — a coral `closed` tag beside the SKU
- **In `planner_import_batches.conflicts`** — the permanent record, per run

---

## 8. What the sync will never touch

**`cargo_ready`, `cbm_per_case`, `cbm_total`.** These are supplier-owned. They are not in the
export, not in the update statement, and survive a close→reopen round trip untouched. Internal
never overwrites what a factory measured.

The column guard enforces the mirror image: a factory cannot write `status`, `closed_at`, either
reason column, the note, the counters, or `last_seen_*`. Without that, a supplier could
resurrect a cancelled PO onto the board or rewrite why their own line closed.

---

## 9. Knobs — where to reach in when it misbehaves

Written for exactly the case you described: you start using it, something feels wrong, you adjust.

| If you want to change… | Go to | Notes |
|---|---|---|
| **Which CSV columns map where** | `plannerInputParser.ts` → `COLUMNS` | Keys are lowercased header text. A renamed column should fail loudly, not arrive as NULL |
| **Which columns are required** | `plannerInputParser.ts` → `REQUIRED` | Controls the "does not look like the PO export" message |
| **Accepted date formats** | `plannerInputParser.ts` → `toIsoDate` | Currently `M/D/YYYY` and ISO. Never fall back to `new Date()` — it reads by locale |
| **The 25% blast radius / floor of 5** | `20260802130000` → `planner_sync_summary` → `blast_radius_exceeded` | Raise if Mondays legitimately close a lot; lower if you want more friction |
| **The inference rules** | `20260802130000` → `planner_po_line_diff`, the `case` in the close branch | The single most likely thing to want to tune. Check it against confirmations first (§5) |
| **Reason wording, hover text** | `src/features/sync/reasons.ts` | `plain` = confirmed, `likely` = inferred. **Keep them different** |
| **Which reasons a person can pick** | `reasons.ts` → `CONFIRMABLE` | `unknown` is excluded on purpose — confirming means stating what you know |
| **Unknown vendor: abort vs skip** | `20260802130000` → `planner_po_line_diff`, the `bad_suppliers` raise | Read §6 before softening this one |
| **What counts as a conflict** | `20260802130000` → `planner_po_line_diff`, the `case` producing `conflict` | |
| **Whether closed lines show on the board** | `OpenPoStatusReport.tsx` → `visibleRows`, `showClosed` | Toggle only appears when something is actually closed |
| **How a closed row looks** | `OpenPoStatusReport.tsx` → `getRowClass` | Currently faded **and** struck through — fading alone already means "fully committed" |
| **How many past runs Settings lists** | `PoSyncPanel.tsx` → `fetchImportBatches(5)` | |

### Adding a column to the sync

Five places, in this order — miss one and the symptom is silent:

1. `planner_po_lines` — the column itself (migration)
2. `planner_guard_po_line_columns` — or a factory can write it
3. `planner_po_line_diff` — the return table, the change detection, and the passthrough
4. `sync_po_lines` — the insert, the update, **and** the reopen update
5. `plannerInputParser.ts` — `COLUMNS`

---

## 10. Things that will surprise you

**`snapshots_seen` advances on an unchanged row.** It counts appearances, not edits, so an
upload that changes nothing still moves `updated_at` on every row. That is deliberate — the
counter is the whole basis of the `withdrawn` inference, and a row stuck at 1 forever would look
like a data-entry error the day it finally closes. Nothing downstream reads `updated_at` for
meaning; the CBM observation dates that *do* matter come from the event log.

**The 315 baseline rows start at `snapshots_seen = 2`, not 1.** They were loaded by hand and
never went through a sync, so the default of 1 would have described each as a one-shot entry —
and the first to close would have been labelled `withdrawn` on no evidence. Setting them to 2
says the honest thing: seen more than once, arrival not observed. They infer `unknown` instead,
which is correct.

**A reopen clears the confirmed reason too.** If a line comes back, whatever anyone concluded
about its departure is void. `reopen_count` increments so the history is not lost.

**Closed lines stay loaded in the browser.** They are hidden by the grid, not dropped by the
repository — a container built last week can hold a PO that closed on Monday, and dropping the
row would leave that card unable to name what is inside it.

**A line can close, reopen, and close again.** The columns hold only the latest state;
`planner_po_line_status_events` holds the whole arc, with the batch that caused each transition.

**`amber-accent` is green in this skin.** The token name is left over from the old palette (see
`src/index.css`). Do not reach for it to mean "warning" — a warning drawn in the module's own
accent reads as success. Use `coral-accent`.

---

## 11. When NetSuite is wired directly

An Edge Function fetches the rows and calls:

```sql
select sync_po_lines(rows_from_netsuite, 'api', false);
```

Same function, same guards, same conflict reporting, same audit trail. `auth.uid()` is null for
`service_role`, which is how it gets past the internal check; `planner_import_batches.source`
records `'api'` instead of `'csv'` so the two are distinguishable in history.

**Nothing in this document changes.** That is the reason the reconcile lives in the database
rather than in the upload dialog: the CSV path was always meant to be one caller of it, not the
thing itself.

---

## 12. Checking it yourself

```sql
-- what closed lately, and how sure are we
select supplier, document_number, sku, closed_at, reason, reason_is_confirmed,
       snapshots_seen, reopen_count, was_allocated
  from planner_po_line_closures
 order by closed_at desc;

-- was the guess any good
select closed_reason_inferred, closed_reason_confirmed, count(*)
  from planner_po_lines
 where closed_reason_confirmed is not null
 group by 1, 2;

-- the arc of one line
select from_status, to_status, inferred_reason, created_at
  from planner_po_line_status_events e
  join planner_po_lines l on l.id = e.po_line_id
 where l.document_number = 'PO156364'
 order by created_at;

-- every run
select pushed_at, source, row_count, inserted_count, updated_count,
       closed_count, reopened_count, jsonb_array_length(conflicts) as conflicts
  from planner_import_batches
 order by pushed_at desc;
```

### Verified before shipping

Each of these has a failing case; "it runs" is not one of them.

1. Same file twice → 315 unchanged, nothing written (`snapshots_seen` advancing is the one
   intended exception)
2. Dropped row → closes, keeps cargo ready and CBM, reopens intact on the next upload with
   `reopen_count = 1` and both transitions logged
3. Quantity below committed → **succeeds** and reports a conflict (this aborted the batch before)
4. Closed line in a container → allocation untouched, card flagged
5. Supplier dropped from the file → none of their lines close
6. 50-row truncation → preview shows 208 closures, apply refuses
7. Unknown vendor, duplicate key, empty file → each aborts, nothing written
8. Preview counts equal apply counts for the same file
9. Confirming a reason leaves the inference intact underneath
10. `withdrawn` fires on a line seen once that never shipped, and on nothing else
11. Applying from the browser records `pushed_by` from the session
12. `confirm_po_line_closure` refuses `service_role` — confirming is a human act by definition

---

## Keep this file honest

If you change a rule, change the row in §9 that points at it. A knob list that has drifted from
the code is worse than no knob list, because it sends you to the wrong file with confidence.
