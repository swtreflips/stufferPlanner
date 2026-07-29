# STUFFER — the planner's backend

The tables, RLS, and ingest flow that give Stuffer Planner a backend, in the **shared rates
Supabase project** where RatesApp and Schedules already live.

Companion to [CLAUDE.md](CLAUDE.md), [CONTCONFIG.md](CONTCONFIG.md), [RLS.md](RLS.md) and
[MOCKDEPLOY.md](MOCKDEPLOY.md). **Where this file disagrees with those two, this one wins** —
they were written before the shared database existed. Every disagreement is listed and
explained rather than silently applied.

Upstream context: `RatesApp/HUB2.md` (the estate plan) and `RatesApp/MIGRATION.md` (how
Schedules was folded in — the same exercise, one app earlier).

---

## Why now

The planner has **no backend at all**: `VITE_DATA_SOURCE=local`, everything behind
`LocalContainerRepo` / `LocalMasterItemRepo` / `LocalProfileRepo`, with `plannerData.csv`
hardcoded as sample data.

**That is the opportunity, and it is closing.** RatesApp and Schedules were retrofitted onto
the shared identity model after the fact. The planner can be built against it from the first
line — which costs an edit to a design doc instead of a migration of a second live schema,
with a table-name collision in the middle.

### The business it has to support

| | |
|---|---|
| **Shared board** | Internal and factories look at the same planning surface |
| **Scoping** | A factory sees only its own POs and containers. Internal sees everything |
| **Internal pushes** | Open PO lines and quantities — `plannerInput.csv` weekly, a NetSuite API later |
| **Factories return** | Cargo ready dates and CBM — `plannerEnrichdata.xlsx`, or typed into the grid |
| **The app shows** | The latest value per PO line |
| **The point** | **Cargo ready dates move. How far, how often, and who moved them must be recorded.** Planning is the reason this app exists, and dates slipping is the thing planning is against |

---

## Step 0 — `organizations` must exist first

**Checked against the live database: it does not.** `public` today holds `forwarders`; there is
no `organizations` and no `organization_services`.

HUB2 names this as the single ordering constraint in the entire estate plan:

> *"When the planner's schema is written, `profiles` and `organizations` must already exist in
> their shared form. Otherwise the planner creates `suppliers` and a second `profiles`, and you
> migrate twice — re-testing the RLS you had just finished verifying."*

**The planner is what forces expand to land.** Nothing else needed it; RatesApp runs happily on
`forwarder_id`.

- [ ] **Expand** — `organizations`, `organization_services`, `profiles.organization_id`
      nullable beside `forwarder_id`, backfilled
- [ ] **Create `organizations` rows carrying the existing `forwarders.id` values unchanged.**
      Every `forwarder_id` already stored is then already a valid `organization_id` — a copy,
      not a remap, and each step verifies with a query returning zero
- [ ] `organizations.code` — the 2-letter supplier code (`DT`, `TP`). **`forwarders` has no
      `code` column**; it is used for container numbering and is genuinely useful, so it lands
      here rather than in a planner-private table
- [ ] `organizations.type` must permit **`customer`** — factories
- [ ] `profiles.role`'s check currently allows only `internal | forwarder`. Either widen it or
      let `organizations.type` carry the distinction and stop writing `role`

`profiles.org_role` (`admin | member`) **already exists** — added with the helper facade.

### What already exists and must be used

```sql
my_org()        -- uuid: whose data this is. NULL for internal users.
my_org_type()   -- 'internal' | 'forwarder' (later 'customer'). NULL if no profile row.
my_org_role()   -- 'admin' | 'member' within your own organization.
```

Deployed, `security definer`, `search_path` pinned. When expand lands, **only their bodies
change** and every policy written against them keeps working.

---

## What this supersedes in MOCKDEPLOY.md and RLS.md

Seven conflicts. All load-bearing, none cosmetic.

| Those documents say | This one says | Why |
|---|---|---|
| Create a **`suppliers`** table | **No.** Factories are `organizations` with `type='customer'` | HUB2 non-negotiable. Two apps invented the same concept twice |
| **`profiles` keyed by email**, no FK to `auth.users` | Use the shared `profiles`, keyed `id → auth.users(id)` | There is one `profiles`. Its "seed before first login" motivation is solved by creating the auth user first, then the profile — which is what onboarding already does |
| Helper **`current_profile()`** | `my_org()` / `my_org_type()` / `my_org_role()` | Two RLS idioms in one database means every identity change is edited twice, in two styles |
| `role check(admin\|internal\|factory)` | `organizations.type` + `profiles.org_role` | `admin` vs `internal` is *standing within an org*, orthogonal to *what kind of org*. Conflating them is why the matrix and RLS.md disagreed |
| **`container_sequences(supplier_code)`** | `planner_sequences`, keyed on `organizations.code` | One place owns the code |
| Table names `master_items`, `containers` | **`planner_` prefix** — see below | |
| **Cloudflare Zero Trust for factories** | **Drop it.** Factories get no Access account | Administering external identities in two systems scales badly, and RLS is already the real boundary |

### On naming — a deliberate deviation from HUB2

HUB2 says `containers`, `container_allocations`, `master_items` are *"distinct, keep"*. That
predates the `ports → world_ports` rename, which established the working rule: a table name
must be globally unique **and self-evidently app-scoped**.

In a database that already holds ocean rates, drayage, and sailing schedules, a bare
`containers` is exactly the ambiguity that rename removed. Prefix them, matching
`sched_vessels` and `drayage_rates`:

```
planner_po_lines         (was master_items)
planner_po_line_events   (new — the history)
planner_containers       (was containers)
planner_allocations      (was container_allocations)
planner_sequences        (was container_sequences)
planner_import_batches   (was import_batches)
```

Every table gets a `COMMENT ON` in the `TIER | OWNER | READ BY | purpose` format, so it
announces itself in the Supabase dashboard.

---

## ⚠️ Open question — the two files do not share a join key

**This must be answered before any SQL is written**, or the first real supplier upload silently
matches nothing and reports success.

```
plannerInput.csv       Internal ID, Document Number, Item, Main Line Name, Quantity,
   (internal)          Quantity Available, Due Date/Receive By, Origin, POL, Destination
                       └─ keyed on (Document Number, Item).  NO Line ID.

plannerEnrichdata.xlsx Name, Date Issued, Document Number, Ship To, Requested Ship By,
   (factory)           Status, Line ID, Quantity Remaining, CBM, Cargo Ready, ETD, ETA,
                       Shipping Agent
                       └─ keyed on (Document Number, Line ID).  NO SKU column.
```

`plannerData.csv`, which the frontend renders today, carries **both** — `Document Number`,
`Line ID`, *and* `Name_1` (the SKU). So the app's own sample data resolves it; the two
production files do not.

- [ ] **Decide the canonical line key.** `(document_number, line_id)` is the natural choice —
      it is what the enrich file and the frontend already use
- [ ] **Then state how `plannerInput.csv` produces a `line_id`**, since it has none. Either
      NetSuite exposes it and the export needs the column added, or it is derived from row
      order within a PO — which breaks the moment a line is removed upstream
- [ ] Until resolved, `sku` is the only shared field, and `(document_number, sku)` is not
      unique when a PO orders the same item on two lines

---

## Schema

### `planner_po_lines` — one row per PO line

Internal owns most of it. Factories own exactly two fields.

```
id                     uuid pk
organization_id        uuid not null → organizations     -- WHOSE DATA THIS IS. the scoping column.
document_number        text not null
line_id                integer not null
sku                    text
                       unique (document_number, line_id)  -- the upsert target for re-pushes

-- internal, from plannerInput.csv
internal_id            text
quantity               numeric
quantity_available     numeric
due_date               date
origin                 text
pol                    text
destination            text

-- factory-owned
cargo_ready            date
cbm_per_case           numeric(12,6)   -- INPUT: one of these two. see "CBM: give either" below
cbm_total              numeric(12,3)   -- INPUT: the other

-- resolved — GENERATED, never written by anyone
cbm_per_case_eff       numeric(12,6) generated
cbm_total_eff          numeric(12,3) generated

-- planning
original_cargo_ready   date        -- stamped on FIRST set, never updated
committed_quantity     numeric default 0
                       check (committed_quantity <= quantity)

raw                    jsonb       -- every unmapped column, so a CSV shape change loses nothing
created_at, updated_at timestamptz
```

**`original_cargo_ready` is not redundant with the event log.** Total slippage is the question
asked on every screen, and a subtraction beats walking a log for it. The log answers *how it
got there*; this answers *how bad is it*, cheaply enough to sort a grid by.

**`organization_id` means whose data this is, not who typed it.** An internal user editing a
factory's line on their behalf leaves `organization_id` pointing at the factory.

### CBM: give either, get both

Suppliers do not agree on how to express volume. Some know the per-case figure from the carton
spec; some only compute a total for the shipment. **Accept whichever they have and derive the
other in the database** — never in the app, and never asking the user to convert.

This is exactly the shape RatesApp's drayage fuel surcharge already uses: two nullable input
columns, two `GENERATED ALWAYS … STORED` columns, no trigger. See `RatesApp/DRAY.md` §6d.

```sql
-- INPUTS: the supplier fills in ONE. Both nullable; neither is authoritative alone.
cbm_per_case numeric(12,6),
cbm_total    numeric(12,3),

-- resolved per-case: per-case wins if given; else derive from total; guard quantity > 0
cbm_per_case_eff numeric(12,6) generated always as (
  case
    when cbm_per_case is not null then cbm_per_case
    when cbm_total is not null and quantity > 0 then round(cbm_total / quantity, 6)
    else 0
  end
) stored,

-- resolved total: total wins if given; else derive from per-case
cbm_total_eff numeric(12,3) generated always as (
  coalesce(cbm_total, round(cbm_per_case * quantity, 3), 0)
) stored,
```

Worked through the user's example: `quantity = 1550`, `cbm_total = 66` →
`cbm_per_case_eff = round(66 / 1550, 6) = 0.042581`. Given `cbm_per_case = 0.042581` instead →
`cbm_total_eff = round(0.042581 × 1550, 3) = 66.001`.

**Each `_eff` column prefers its own direct input** — the same rule as `fuel_surcharge_amount`
(nominal wins) and `fuel_surcharge_pct_eff` (percentage wins). The app reads only the `_eff`
columns and does **no client math**: one source of truth for the grid, capacity calculations
and export alike.

Three consequences worth stating, because two are traps:

- **Generated columns are writable by nobody**, including a service-role push. That is a
  feature: the derivation cannot be bypassed or disagreed with. It also means the column-write
  trigger and the history log both operate on the *input* columns only
- **A generated column may not reference another generated column** in Postgres. If a total-CBM
  rollup per container is ever wanted as a generated column, the expression has to be repeated,
  not referenced — the same footnote `DRAY.md` carries for `total_rate`
- ⚠️ **`quantity` is the divisor, and unlike drayage's `rate` it changes.** Internal re-pushes
  quantities weekly. If a supplier supplied `cbm_per_case`, that is intrinsic to the carton and
  `cbm_total_eff` correctly re-scales. **If they supplied `cbm_total`, a later quantity change
  silently moves `cbm_per_case_eff`** while the stored total stays put

That last point argues for **treating `cbm_per_case` as the preferred input** — nudge it in the
upload template and the grid, since it is the quantity-independent one. Worth deciding whether
the app should persist the derived per-case value when only a total is supplied, which would
make it stable against re-pushes. That is an app decision, not a schema one; generated columns
cannot write back.

- [ ] **Decide the divisor.** `quantity` or `quantity_available`? The enrich file's column is
      *Quantity Remaining*, and the worked example above uses it — but `plannerInput.csv`
      supplies both `Quantity` and `Quantity Available`. Total CBM measured against ordered
      quantity and against remaining quantity are different numbers
- [ ] Consider a check constraint rejecting the case where **both** are supplied and disagree
      beyond a tolerance. Without one, `cbm_per_case_eff × quantity` need not equal
      `cbm_total_eff` — the same latent inconsistency drayage accepts for fuel

### Historic CBM — estimating what was never measured

Suppliers often return a cargo ready date and nothing else, because nobody measured the
cartons. But an item a factory has shipped before **has been measured before**. That history is
worth keeping and worth querying — not to make the app work, but to plan with a number instead
of a blank.

**This is a view, not a table.** The observations already exist in `planner_po_lines` and in
`planner_po_line_events`; a separate reference table would need syncing and would drift. HUB2's
anti-redundancy rule applies to derived data too: *is this data another table already owns?*

```sql
create view planner_cbm_reference as
select
  organization_id,
  sku,
  count(*)                                      as observations,
  round(avg(cbm_per_case), 6)                   as avg_cbm_per_case,
  percentile_cont(0.5) within group (order by cbm_per_case) as median_cbm_per_case,
  min(cbm_per_case)                             as min_cbm_per_case,
  max(cbm_per_case)                             as max_cbm_per_case,
  max(updated_at)                               as last_observed_at
from planner_po_lines
where cbm_per_case is not null          -- SUPPLIED only, never an estimate
group by organization_id, sku;
```

Two tiers are useful, and the fallback order matters:

1. **`(organization_id, sku)`** — this factory has made this item before. The best estimate:
   the same people packing the same product
2. **`(sku)` across all organizations** — someone has made it. Weaker, because packing differs
   by factory, but far better than nothing

> **Median, not average.** One mis-keyed decimal — `0.42` instead of `0.042` — drags an average
> by an order of magnitude and quietly poisons every estimate for that SKU. The median shrugs it
> off. `min`/`max` are carried precisely so a wide spread is visible rather than hidden inside
> a single number.

#### The rule: an estimate must never look like a measurement

**Never write an estimated value into `cbm_per_case`.** That column means *a supplier told us
this*. Estimates go beside it, never into it:

```
cbm_per_case         supplied by the factory        ← the only thing they may write
cbm_per_case_eff     supplied, or derived from total (generated)
cbm_cbm_estimated    from planner_cbm_reference     ← a JOIN, never a column
```

Reasons this boundary is load-bearing:

- **Provenance survives.** *"We are planning this container on a guess"* is a materially
  different sentence from *"the factory measured it"*, and only one of them should let someone
  commit a container without a second look
- **The history log stays honest.** Writing an estimate into `cbm_per_case` fires the
  `AFTER UPDATE` trigger and records a supplier edit that never happened
- **Estimates improve.** A view recomputes as new measurements arrive; a value written into the
  row is frozen at the moment someone guessed

The grid should render an estimated figure visibly differently — greyed, italic, with the
observation count on hover (*"estimated from 4 past shipments, 0.041–0.044"*). A planner
should be able to see at a glance which containers are packed on measurements and which on
inference.

- [ ] Decide whether an estimate may be *promoted* to supplied. Recommendation: **no**, and if
      it ever is, do it as an explicit user action with `source = 'estimate_accepted'` in the
      event log — never silently
> **The two-input design already solves the contamination problem, for free.** A per-case
> figure *derived* from a total is only as good as the quantity it was divided by — and
> quantities get re-pushed. Feeding those back into the reference would let one bad quantity
> corrupt an item's history.
>
> No flag is needed to prevent it. `cbm_per_case IS NOT NULL` means **the supplier typed a
> per-case figure**; a line where only a total was given has `cbm_per_case IS NULL` and
> `cbm_per_case_eff` populated. So the view's `where cbm_per_case is not null` admits measured
> values and excludes derived ones **by construction**. Filtering on `cbm_per_case_eff` instead
> would silently include them — the one-word difference is the whole safeguard.

### `planner_po_line_events` — append-only history

```
id             bigint identity pk
po_line_id     uuid not null → planner_po_lines on delete cascade
organization_id uuid not null                    -- denormalised so RLS needs no join
field          text check (field in ('cargo_ready','cbm_per_case','cbm_total'))
old_value      text
new_value      text
changed_by     uuid → profiles                   -- NULL for a service-role push
source         text check (source in ('csv','grid','api'))
created_at     timestamptz default now()
```

Written by an **`AFTER UPDATE` trigger on `planner_po_lines`**, one row per changed field.

Putting it in a trigger rather than in application code is the whole design:

- **A CSV upload and a single-cell grid edit produce identical history**, with no cooperation
  from the frontend and no way to forget
- **An update that changes nothing writes nothing.** Re-uploading last week's file is a no-op
  in both tables — which matters, because that will happen
- It cannot be bypassed by a future second write path

`source` is what makes *"who keeps moving this date?"* answerable — a bulk push slipping a date
is a supply problem; a person moving it by hand three times is a different conversation.

**The log records the INPUT columns only** — `cargo_ready`, `cbm_per_case`, `cbm_total`. The
`_eff` columns are generated and can never be updated, so they can never generate an event.
That is the right boundary: history should record *what a person supplied*, not what the
database computed from it. A per-case figure that shifts because internal re-pushed a quantity
is not a supplier changing their mind, and logging it as one would be misleading.

Queries it enables:

```sql
-- how far has this line slipped, and in how many moves?
select count(*) as moves,
       max(new_value::date) - min(old_value::date) as net_days
from planner_po_line_events
where po_line_id = $1 and field = 'cargo_ready';
```

### `planner_containers`, `planner_allocations`, `planner_sequences`

Mirror the TypeScript so the repo swap is mechanical — [src/types/container.ts](src/types/container.ts)
and [src/types/allocation.ts](src/types/allocation.ts).

- `planner_containers`: `code` unique, `organization_id` not null, `capacity_cbm`,
  `display_order`, `ofq_reference`, `committed_at/by`, plus the whole post-commit lifecycle
  shipped today — `logistics_status`, `booking jsonb`, `schedule jsonb`,
  `booked_at/by`, `scheduled_at/by`, `shipped_at/by`
- `planner_allocations`: `container_id`, `po_line_id`, `quantity`, `display_order`
- `planner_sequences`: keyed on `organizations.code`, `next_number int not null default 1`
- `planner_import_batches`: `pushed_at`, `source`, `row_count` — ops tracking for the weekly push

> `planner_containers.ofq_reference` is the forwarder's number on a committed container.
> RatesApp's `OFQID` is a column in its rates-input CSV. **Same word, different things.** No
> join, no shared handling.

---

## Security

### The invariant

> Every row in `planner_po_lines`, `planner_containers` and `planner_allocations` carries one
> `organization_id`. A factory only ever sees or writes rows where
> `organization_id = my_org()`. Internal sees everything. **This is enforced by RLS, not by the
> UI** — the UI is for usability.

### Policies

Every policy uses the shared helpers. **Never** an inlined `exists (select 1 from profiles me …)`.

```sql
-- read: internal sees all, factory sees its own
create policy planner_po_lines_read on planner_po_lines
  for select to authenticated
  using (my_org_type() = 'internal' or organization_id = my_org());
```

Two rules that are easy to get wrong:

- **"Internal sees everything" is always `my_org_type() = 'internal'`, never a `my_org()`
  comparison.** `my_org()` is NULL for internal users, so a comparison denies them
- **Both layers are required.** `grant select … to authenticated` lets the role touch the table
  at all; the policy narrows it. **RLS narrows a grant — it cannot create one.** Miss the grant
  and internal users see an empty table, which looks like missing data rather than a
  permissions bug

`anon` gets **nothing**. The app signs in, so its callers are `authenticated`.

### Column-level writes need a trigger — RLS cannot do it

RLS grants access to *rows*, not *columns*. Without this, a factory could rewrite quantities on
its own lines.

```sql
-- BEFORE UPDATE on planner_po_lines
-- A factory may change ONLY cargo_ready, cbm_per_case, cbm_total.
-- Everything else must be identical to the old row, or the update is rejected.
```

The `_eff` columns need no mention: **generated columns are writable by nobody**, so the
derivation is safe from every write path including a service-role push. The trigger only ever
has to reason about the three input columns.

For the MVP **internal may write those same three fields too** — internal fills them in on a
factory's behalf while the process beds in. That is a deliberate relaxation of CLAUDE.md's
permissions matrix, which currently says internal cannot edit Cargo Ready or CBM.

### Commit / uncommit stay RPCs

`SECURITY DEFINER`, `search_path` pinned, identity stamped server-side:

- `commit_container` — requires `my_org_type() = 'internal'`
- `uncommit_container` — additionally requires `my_org_role() = 'admin'`
- `next_container_code(org_code)` — atomic upsert+increment on `planner_sequences`

A `SECURITY DEFINER` function without `set search_path` is a privilege-escalation shape. Pin it
on all three.

### `planner_po_line_events`

Readable by internal and the owning organization. **Insert only via the trigger** — no direct
insert grant to anyone. History nobody can write by hand is history you can trust.

---

## Ingest

Both roles write **in-app**, through `supabase-js`. No Edge Function, no service key in the
browser, and the existing [MasterCsvUploadDialog](src/components/grid/MasterCsvUploadDialog.tsx)
is the seam.

```
internal ──plannerInput.csv──▶ upsert planner_po_lines on (document_number, line_id)
factory  ──enrich file────────▶ update cargo_ready, cbm_per_case, cbm_total
both     ──MUI grid edit──────▶ same columns, same trigger, source='grid'
```

RLS decides what each side may touch, so the *same code path* is safe for both. The trigger
records both identically.

Later, the NetSuite API replaces the internal CSV. That path runs server-side with the service
key, which bypasses RLS — so it must set `organization_id` correctly itself. It is the one
writer with no policy protecting it.

---

## Front end

The repository abstraction is already the right seam. Each `Local*Repo` gains a `Supabase*Repo`
sibling and [src/data/repos/index.ts](src/data/repos/index.ts) flips on `VITE_DATA_SOURCE` —
**migrate one repo at a time; the app stays shippable at every step.**

- [ ] `AuthProvider` mirrors RatesApp's: `profiles` as the only source of identity,
      `undefined` = loading, `null` = no access, fail closed, never `user_metadata`. Two apps
      differing at the auth boundary is how one of them ends up wrong
- [ ] Point at the **rates** project. One person, one login, all three apps
- [ ] Presence and locking work unchanged — but **a presence channel is a side channel.** If
      factories cannot see each other's containers, make sure they cannot see each other's
      avatars either
- [ ] Confirm Realtime connection limits on the current tier before onboarding several
      factories at once

---

## Mock deployment

Same pattern as RatesApp, and MOCKDEPLOY.md's seed table — with organizations instead of
`suppliers`, and **no Cloudflare Access for factories**.

- [ ] **Two customer organizations minimum** in `supabase/seed.sql`. An isolation test with one
      tenant is vacuous — there is nothing to leak
- [ ] Mock accounts are partner-scoped logins you hold. Handover is data-only and all history
      survives, because the UUID never changes
- [ ] Deploys standalone to Vercel exactly as it does today. **The hub is DNS and a card
      later — the app never moves into a container**
- [ ] Its origin goes in the geo brain's `ALLOWED_ORIGINS` only if it ever geocodes. It does
      not today

---

## Verification

Not "it runs" — these each have a failing case.

1. `supabase db reset` rebuilds the whole database including the planner tables
2. **Factory A sees only A's PO lines. Factory B sees zero of A's. Internal sees both.**
   Seeded from two organizations, or the test cannot fail
3. A factory `update` touching `quantity` is **rejected** by the column trigger
4. Changing a cargo ready date writes **exactly one** `planner_po_line_events` row
5. **Re-uploading the same CSV is a no-op** — no table change, no log rows
6. `anon`, using the key pulled from the built bundle, reads **zero** from every planner table
7. Slippage per line matches `cargo_ready - original_cargo_ready`
8. `commit_container` called by a factory is rejected; `uncommit_container` called by a
   non-admin internal user is rejected
9. **CBM derives both ways.** Insert `cbm_total = 66` with `quantity = 1550` →
   `cbm_per_case_eff = 0.042581`. Insert `cbm_per_case = 0.042581` instead →
   `cbm_total_eff = 66.001`. Supply neither → both read `0`, not NULL
10. An `update … set cbm_total_eff = 99` is **rejected by Postgres** — generated columns cannot
    be written, by anyone, including the service role
11. Changing `quantity` on a line whose supplier gave only `cbm_total` moves
    `cbm_per_case_eff` and writes **no** history row — confirming the log records supplied
    values, not computed ones
12. **`planner_cbm_reference` counts only measured values.** A line where the supplier gave a
    total (so `cbm_per_case IS NULL`, `cbm_per_case_eff` populated) contributes **nothing** to
    the reference — derived figures never feed the estimator
13. The view is subject to RLS through its base table: a factory querying it sees only its own
    SKUs, internal sees every organization's

---

## Ordering

```
expand: organizations + organization_services + profiles.organization_id
   └─ planner tables + triggers
        └─ RLS + RPCs
             └─ seed with two customer organizations
                  └─ isolation tests green
                       └─ Supabase*Repo, one at a time
                            └─ mock accounts
```

**Nothing above the line it depends on.** The planner tables cannot reference `organizations`
before it exists, and the RLS cannot be tested before two organizations are seeded.

---

## Keep this file honest

Every state claim here should carry a date and a method, or a command that proves it. The
`organizations` check above was run against the live database on **2026-07-28**; `MOCKDEPLOY.md`
and `RLS.md` drifted precisely because they were written as instructions and never re-checked.
