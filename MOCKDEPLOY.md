# Mock deployment: Supabase backend + RLS + audit + Python push + Cloudflare SSO

## Context

Before the real launch, stand up a **mock deployment** with real colleagues acting
as suppliers/internal so we can perform real planning actions and surface
technical + operational gaps. Requirements:

- **DB-enforced isolation (RLS)** so each supplier sees only their own POs and
  containers — not a UI nicety, a real boundary.
- **Update history** for the factory-editable fields (who changed cargo-ready /
  CBM, and **when**) — CONTCONFIG currently says "no audit trail"; this adds one.
- **Weekly Monday Python push** of new POs (with org names) into Supabase.
- **One email login** gated by **Cloudflare Zero Trust**; no second password.
- Decisions: build **full end-to-end**; audit **all three** factory fields; host
  on **Vercel behind a Cloudflare-proxied domain**; identity = **Cloudflare
  Access bridged into Supabase** (no separate Supabase login).

Most of the target schema/RLS/RPCs already live in [CONTCONFIG.md](CONTCONFIG.md)
"Identity & RLS" / "Backend operations"; this plan adapts them to email-based
Cloudflare identity and adds the audit trail, the users, the push, and CF.

## Identity & login — why Cloudflare alone isn't enough, and the bridge

Cloudflare Access authenticates the person (email) and gates the network, issuing
a signed JWT. Supabase RLS executes in Postgres and must resolve `auth.uid()` /
`auth.jwt()` to scope rows — it cannot see Cloudflare's session. Bridge them so
there's **one login**:

1. Register **Cloudflare Access as a Supabase third-party auth provider**
   (issuer `https://<team>.cloudflareaccess.com`, its JWKS, the Access app `aud`).
2. A tiny same-origin **`/api/cf-token`** Vercel function (sitting behind the same
   Access app) echoes back the `Cf-Access-Jwt-Assertion` request header that
   Cloudflare injects. The SPA fetches it and hands it to supabase-js via
   `createClient(url, anon, { accessToken: async () => cfJwt })`.
3. RLS resolves the user by **email claim**: `auth.jwt()->>'email'` → `profiles`.
   No Supabase `auth.users`, no magic-link redirect allowlist to manage.

Fallback if the token bridge proves fiddly during the mock: keep CF Access as the
network gate **and** add Supabase magic-link (two passwordless steps, same email).

## Users & orgs (seed)

`suppliers`: **Silvia Paper Inc.** (code `SP`), **Luis Paper Inc.** (code `LP`).

`profiles` (keyed by `email`, used by RLS):

| email | display | role | supplier | org |
|---|---|---|---|---|
| *(your admin email — set this)* | Admin | admin | — | ptp |
| silvian@primetimepackaging.com | Silvia | factory | Silvia Paper Inc. | Silvia Paper Inc. |
| Luismht@primetimepackaging.com | Luis | factory | Luis Paper Inc. | Luis Paper Inc. |
| Jordan@ptpbags.com | Jordan | internal | — | ptp |

Silvia & Luis **share `@primetimepackaging.com`** → proves identity must be
per-email `profile.supplier_id`, never domain mapping.

## 1. Schema — `supabase/migrations/0001_init.sql`

Base tables per CONTCONFIG ("Schema" + "Identity & RLS"), with these concrete
choices/additions:

- `suppliers(id uuid pk, name unique, code text unique check 2-letter, created_at)`.
- `profiles(id uuid pk default gen_random_uuid(), email citext unique not null,
  display_name, role check(admin|internal|factory), supplier_id fk null,
  org_name text, created_at, constraint factory_has_supplier)`. **No FK to
  auth.users** (identity comes from CF email).
- `master_items` per CONTCONFIG: `supplier_id` FK **not null**, dates as
  `timestamptz`, `raw jsonb`, `original_quantity`/`committed_quantity` with the
  `committed_le_original` check. Add `cargo_ready_factory_set boolean default
  false`, `cbm_factory_set boolean default false` to drive the push conflict policy.
- `containers` per CONTCONFIG: `code unique`, `supplier_id` FK, `committed_by`,
  `capacity_cbm`, plus the logistics columns we ship today — `logistics_status`,
  `booking jsonb`, `schedule jsonb`, `booked_at/by`, `scheduled_at/by`,
  `shipped_at/by` (mirrors [container.ts](src/types/container.ts)).
- `container_allocations` per CONTCONFIG.
- `container_sequences(supplier_code text pk, next_number int not null default 1)`.
- **NEW** `master_item_field_history(id bigint identity pk, master_item_id fk,
  field check(cargo_ready|cbm_per_case|cbm_total), old_value text, new_value text,
  changed_by text, changed_at timestamptz default now())`.
- `import_batches(id uuid pk, pushed_at timestamptz default now(), source text,
  row_count int)` — anchors the conflict policy and ops tracking.

## 2. Audit history (the "when did they update cargo ready" ask)

`AFTER UPDATE ON master_items` trigger: for each of `cargo_ready`,
`cbm_per_case`, `cbm_total` that changed, insert a `master_item_field_history`
row with `changed_by = auth.jwt()->>'email'` (null for the service-role push) and
`changed_at = now()`. The same trigger sets `*_factory_set = true` when the
caller is a factory, so the Python push can preserve factory edits.

## 3. RLS (adapt CONTCONFIG to email identity)

- Helper `current_profile()` → the `profiles` row for `auth.jwt()->>'email'`
  (SQL `stable`). Used by every policy.
- Policies per the CONTCONFIG permissions matrix:
  - `master_items`: admin/internal read all; factory reads/updates only
    `supplier_id = current_profile().supplier_id`. A **BEFORE UPDATE** trigger
    rejects factory writes to any column other than
    `cargo_ready / cbm_per_case / cbm_total`.
  - `containers` / `container_allocations`: factory scoped to own supplier (read +
    draft CRUD, no commit/uncommit); admin/internal full; only admin uncommits.
  - `master_item_field_history`: read by admin/internal and the owning factory;
    insert only via the trigger.

## 4. RPCs (`SECURITY DEFINER`, stamp identity from `current_profile()`)

- `next_container_code(supplier_code)` — atomic upsert+increment of
  `container_sequences`, returns `<SUP><NNNN>`.
- `commit_container(container_id, ofq_ref)` / `uncommit_container(container_id)` —
  sum allocations, move `committed_quantity`, flip status + stamps, in one tx
  (admin/internal commit; admin-only uncommit).
- Logistics transitions (`mark_booked`, `set_booking`, `unmark_booked`,
  `set_schedule`, `clear_schedule`, `mark_shipped`, `unmark_shipped`) — stamp
  `*_by`, enforce sequential order.

## 5. Front-end integration (full end-to-end)

- Add `@supabase/supabase-js`; create **`src/lib/supabase.ts`** singleton with the
  `accessToken` bridge above.
- **`api/cf-token.ts`** (Vercel function) returning the Cloudflare Access JWT.
- **`SupabaseRepo` set** implementing the 5 interfaces in
  [repos/types.ts](src/data/repos/types.ts), with a snake_case↔camelCase +
  `timestamptz`↔ISO mapping layer; wire the `'supabase'` branch in
  [repos/index.ts](src/data/repos/index.ts) (seam already exists).
- **Refactor the commit path** in [plannerStore.ts](src/store/plannerStore.ts):
  today `commitContainer` calls `containerRepo.commit` then loops
  `masterItemRepo.commitQuantity` — that double-counts against a single RPC. Make
  `containerRepo.commit/uncommit` return the updated container **plus the master
  deltas**, and have the store apply both (LocalRepo returns them too, so both
  backends stay identical). The container-code sequence likewise moves into
  `SupabaseContainerRepo.create` via the RPC (local `containerCodeSequences`
  becomes a no-op under Supabase).
- **AuthProvider**: replace the URL resolver with: read the CF email, fetch the
  `Profile` via `profileRepo` by email, expose the same `AuthContextValue`
  (consumers unchanged) + a loading state.
- **Realtime**: subscribe to `master_items`, `containers`,
  `container_allocations`; upsert-by-id into the store (idempotent, so optimistic
  local writes + realtime echoes don't duplicate).
- **Presence/locks**: swap [presenceChannel.ts](src/data/presenceChannel.ts) from
  `BroadcastChannel` to **Supabase Realtime Presence** so locks work
  cross-user (Silvia vs Jordan), not just cross-tab.

## 6. Python push — `scripts/push_pos.py`

- Uses the **service-role key** (server/CI env only — never `VITE_`, never
  client). Bypasses RLS by design.
- Resolve each row's org name → `supplier_id` (suppliers seeded first; optionally
  upsert unknown orgs).
- **Upsert `master_items` on `(document_number, line_id)`**: admin-authoritative
  columns always overwritten; `cargo_ready / cbm_per_case / cbm_total` preserved
  when `*_factory_set = true` (factory wins since last push). New rows insert with
  all fields. Writes an `import_batches` row each run.
- `scripts/seed.ts`/SQL mirrors `plannerData.csv` → same path for dev/staging.

## 7. Cloudflare Zero Trust

- Deploy to Vercel; add custom domain **planner.primetimepackaging.com** on
  Cloudflare DNS (proxied / orange-cloud).
- Zero Trust → Access → self-hosted application on that hostname; policy **allow**
  the four emails (or the two domains). `/api/cf-token` lives behind the same app
  so CF injects the assertion header.
- Supabase: configure the third-party auth provider (CF issuer + JWKS + `aud`).
  No magic-link redirect allowlist needed.

## Execution roadmap — what must be ready before what

Sequenced so each layer is **proven before the next depends on it**. Cheap checks
first (SQL), infra last (Cloudflare). Don't advance past a phase until its **gate**
passes.

### Phase 0 — Accounts & decisions (no code)
- **Ready before anything:** Supabase project (grab URL, anon key, service-role
  key); Vercel project linked to the repo; a domain already on **Cloudflare DNS**
  (e.g. `primetimepackaging.com`); the **admin email** you'll use chosen.
- **Gate:** you can log into all three dashboards and have the Supabase keys in a
  password manager (service-role key never leaves server side).

### Phase 1 — Database layer (pure SQL, no app)
- **Depends on:** Phase 0.
- **Do, in order:** (1) `0001_init.sql` schema → (2) `seed.sql` (suppliers, the 4
  profiles, sample `master_items` from `plannerData.csv`) → (3) RLS policies +
  the factory BEFORE-UPDATE column-restriction trigger + the AFTER-UPDATE audit
  trigger → (4) RPCs (`next_container_code`, `commit_container`,
  `uncommit_container`, logistics transitions).
- **Gate (Verification #1 + #2):** impersonate each user via
  `request.jwt.claims` and confirm scoping, the factory write restriction, commit
  vs uncommit permissions, and that the audit trigger writes a history row with
  email + timestamp. **No app code until this is green** — RLS is the boundary and
  SQL is the cheapest place to catch a leak.

### Phase 2 — Python push (independent of the app)
- **Depends on:** Phase 1 (schema + suppliers seeded + factory-edit flags/trigger).
- **Do:** `scripts/push_pos.py` (service-role) — org→supplier resolution, upsert on
  `(document_number, line_id)`, factory-wins conflict policy, `import_batches` row.
- **Gate (Verification #4):** push a batch → new lines appear, a factory-edited
  cargo-ready survives the push, an `import_batches` row is written.

### Phase 3 — App data layer against Supabase (still local, dev identity)
- **Depends on:** Phase 1 green. **Key unblock:** a **dev identity shim** so you can
  exercise RLS locally before Cloudflare exists — either Supabase magic-link for
  the 4 emails, or a short-lived dev JWT (signed with the Supabase JWT secret)
  carrying a chosen `email` claim. Build this first in this phase.
- **Do:** add `@supabase/supabase-js`; `src/lib/supabase.ts` with a **pluggable
  `accessToken` source** (dev shim now, CF later); the 5 `SupabaseRepo`s + mapping
  layer; the **commit-path refactor** in `plannerStore.ts`; `AuthProvider` resolves
  `Profile` by email; flip `VITE_DATA_SOURCE=supabase`.
- **Gate (Verification #3, run locally):** log in as each user via the shim →
  correct scope, commit works and moves `committed_quantity` atomically, a
  cargo-ready edit lands an audit row. Local-only; no Cloudflare yet.

### Phase 4 — Realtime + cross-user presence
- **Depends on:** Phase 3 (working data layer + identity).
- **Do:** enable Realtime on `master_items`, `containers`, `container_allocations`
  and subscribe (id-idempotent upserts); swap `presenceChannel.ts` to **Supabase
  Realtime Presence**.
- **Gate (Verification #5, two local browsers):** an action by one user shows live
  for the other; one editing a row blocks the other with the lock UI.

### Phase 5 — Deploy to Vercel (no gating yet)
- **Depends on:** Phase 3 (4 optional but recommended).
- **Do:** deploy; set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_DATA_SOURCE=supabase` in Vercel; ship the `/api/cf-token` function.
- **Gate:** the app loads on the `*.vercel.app` URL and reaches Supabase. Full auth
  is *expected to be incomplete* here — `/api/cf-token` only works once Cloudflare
  is in front (Phase 6).

### Phase 6 — Cloudflare Zero Trust + the identity bridge (go-live gate)
- **Depends on:** Phase 5 deployed.
- **Do, in order:** (1) custom domain `planner.primetimepackaging.com` on
  Cloudflare, proxied to Vercel → (2) Zero Trust Access app on that hostname +
  policy allowing the four emails → (3) Supabase third-party auth provider (CF
  issuer + JWKS + `aud`) → (4) switch the app's `accessToken` source from the dev
  shim to the real CF token from `/api/cf-token`.
- **Gate (Verification #3, now end-to-end):** open the domain as each email →
  **single login**, correct scope; admin full, internal commit-not-uncommit,
  factory own-supplier only. Anyone outside the four emails can't even reach the app.

### Phase 7 — Operational dry run
- **Depends on:** Phase 6 green.
- **Do:** a Monday-style `push_pos.py` run, then a live multi-user planning session
  (allocate, commit OFQs, advance logistics, edit cargo-ready) across the real
  people. Confirm the audit history reads back correctly and the weekly runbook
  feels right.
- **Gate:** the team can plan a container end-to-end without you intervening, and
  every isolation/audit expectation holds in production.

### Dependency at a glance
```
Phase 0 (accounts)
   └─▶ Phase 1 (DB + RLS + RPCs)  ──gate: SQL isolation + audit──┐
          ├─▶ Phase 2 (Python push)                              │
          └─▶ Phase 3 (SupabaseRepo + dev identity) ─────────────┤
                 └─▶ Phase 4 (realtime + presence)               │
                        └─▶ Phase 5 (Vercel deploy)              │
                               └─▶ Phase 6 (Cloudflare + bridge) ┘ ──▶ Phase 7 (dry run)
```

## Risks & revised slice order

**Keep the full build.** The mock *is* the production infrastructure dress
rehearsal — the whole point is that flipping to real suppliers later is
**data-only**: add a `suppliers` row + a `profiles` row + the email to the
Cloudflare Access policy. No migration, no deploy, no code change. The reorder
below does **not** cut scope; it proves the risky pieces early so a late surprise
can't invalidate finished work.

### Design tenet — onboarding a supplier is data, not code
- New supplier = `INSERT suppliers(name, 2-letter code)` + `INSERT profiles(email,
  role='factory', supplier_id)` + add the email to the CF Access policy. Nothing
  else.
- The whole architecture must honor this: no supplier names/emails hard-coded in
  app, RLS, or RPCs — everything resolves through the `profiles`/`suppliers`
  tables and the JWT email claim.

### Top risks — validate early, not at the end
1. **CF → Supabase identity bridge (highest).** Cloudflare Access isn't a
   first-class Supabase third-party provider; `role`/`sub` acceptance, token
   refresh in the `accessToken` callback, and realtime-over-websocket with a
   third-party token are all unproven here. **Spike it in isolation before the app
   layer.**
2. **Email identity vs `auth.users` stamps.** No `auth.users` rows → `auth.uid()`
   is unusable and `committed_by uuid references auth.users` can't exist. Switch
   every `*_by` stamp and every RPC to `current_profile().id`; drop the
   `auth.users` FKs.
3. **Realtime + optimistic store = reconciliation.** Self-echoes and multi-row
   commit/move events can render transient inconsistency. Choose a strategy
   (session-tagged writes ignored on echo, or realtime-as-source-of-truth) before
   wiring subscriptions.

### Gaps folded in
- **Two audited write paths now exist** — inline grid edit *and* CSV upload
  (`updateMasterCargoReady`, `updateMasterCbmPerCase`, `MasterCsvUploadDialog`).
  Both must go through the Supabase `UPDATE` so the audit trigger fires.
- **`createContainer` also needs refactoring**: its `<SUP><NNNN>` code is computed
  client-side today; under Supabase it must come from `next_container_code` inside
  `SupabaseContainerRepo.create` (the local sequence is racy).
- **Presence is two mechanisms**: the lock protocol (`lock-add/remove/refresh`,
  TTL/heartbeat/sweeper) rides Supabase Realtime **Broadcast**; who's-online uses
  **Presence**. Not a 1:1 transport swap.
- **Define the `*_factory_set` reset rule** (e.g. cleared on admin edit, or per
  `import_batches` window) so admin can still correct factory fields via push.
- **`cargo_ready` as `date`, not `timestamptz`** (calendar date — avoids TZ
  drift). Add a **reseed/reset script** for iterating the mock.
- **Vercel-behind-Cloudflare**: the SPA gains an `api/` serverless function, CF
  SSL must be **Full (strict)**, and Vercel deployment protection should be off so
  it doesn't double-gate.

### Revised phase order (same scope, de-risked)
- **Phase 1 — DB + RLS + RPCs** (email identity; `*_by = current_profile().id`).
  Gate: SQL isolation + audit (unchanged).
- **Phase 1.5 — Bridge spike (NEW, before any app build):** a throwaway page that
  pulls the CF token from `/api/cf-token`, calls Supabase **as Silvia**, confirms
  RLS scopes the result, and receives one realtime event. **Gate:** one
  CF-authenticated Supabase query + one realtime tick. If it fails, switch to the
  two-login fallback *now* — not after building the app on a broken assumption.
- **Phase 2 — Python push** (+ the `*_factory_set` reset lifecycle + reseed script).
- **Phase 3 — SupabaseRepo set + store refactors** (commit deltas **and**
  `createContainer` code via RPC) + AuthProvider; route **both** master write paths
  through Supabase. Gate: local per-user via the proven bridge.
- **Phase 3.5 — Data-only onboarding check (NEW):** add a temporary 3rd supplier
  by **rows alone** (suppliers + profiles + CF email), confirm isolation + login,
  then remove it. This *is* the go-live rehearsal — it proves "plug in a name and
  email" works.
- **Phase 4 — Realtime** (with the chosen reconciliation) **+ presence**
  (Broadcast + Presence).
- **Phase 5 — Vercel deploy** (api function, SSL Full(strict), protection off).
- **Phase 6 — Cloudflare Access + domain**, flip `accessToken` to the CF token
  (bridge already proven in 1.5).
- **Phase 7 — Operational dry run** + a final plug-in rehearsal for real go-live.

## Things to keep in mind (so the pieces connect)

- **RLS is the security boundary; the existing UI scoping is cosmetic.** Verify
  isolation in SQL, not just the app.
- **Service-role key stays server-side** (Python only).
- **Commit atomicity** must go through the RPC + the store refactor above, or
  `committed_quantity` drifts.
- **Dates/JSON**: `timestamptz`↔ISO string and `raw`/`booking`/`schedule` `jsonb`
  mapping lives in the SupabaseRepo.
- **Realtime echo**: keep store upserts id-idempotent.
- **Cross-user locks** require the Supabase Realtime Presence swap.
- **Weekly runbook**: Monday → run `push_pos.py` → confirm `import_batches` row +
  spot-check a factory-edited line was preserved.

## Files

- `supabase/migrations/0001_init.sql`, `supabase/seed.sql`
- `src/lib/supabase.ts`, `api/cf-token.ts`
- `src/data/repos/Supabase{MasterItem,Container,Allocation,Supplier,Profile}Repo.ts`
  + `src/data/repos/index.ts` wiring
- `src/auth/AuthProvider.tsx`, `src/store/plannerStore.ts` (commit refactor +
  realtime), `src/data/presenceChannel.ts`
- `scripts/push_pos.py`, `.env.local` (+ `@supabase/supabase-js` in package.json)

## Verification

1. **DB isolation (SQL, before any UI):** set
   `request.jwt.claims` to each profile's email and `SELECT` — Silvia sees only
   Silvia Paper rows/containers; Jordan sees all; factory `UPDATE` to a non-CBM
   column is rejected; `commit_container` as Jordan works, `uncommit` is denied.
2. **Audit:** as Silvia, change a cargo-ready date → a
   `master_item_field_history` row appears with her email + timestamp; CBM edits
   logged too.
3. **App via Cloudflare:** open the domain as each email — single login, correct
   scope; admin full, internal commit-not-uncommit, factory own-supplier only.
4. **Python push:** run `push_pos.py` with a fresh PO batch → new lines appear,
   a factory-edited cargo-ready is preserved, `import_batches` row written.
5. **Realtime + locks:** two browsers (Silvia, Jordan) — an allocation by one
   shows live for the other; Silvia editing a row blocks Jordan with the lock UI.
