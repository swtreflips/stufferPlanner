# RLS.md — Row Level Security guide for Supabase deployment

Companion to [CONTCONFIG.md](CONTCONFIG.md) and [CLAUDE.md](CLAUDE.md). When the
local-dev planner ships to Supabase + Vercel, the placeholder `AuthProvider`
gets replaced by a real Supabase session. Everything else (the lock substrate,
master-grid filter, supplier-aware AddContainer dialog) stays the same — what
changes is **where the supplier-scoping rule is enforced**: today it's UI;
in production it's RLS on the database.

## The core invariant

> Every row in `master_items`, `containers`, and `container_allocations` is
> scoped to one `supplier_id`. Factory users only ever see / write rows where
> `supplier_id = profile.supplier_id`. Admin and internal see everything; only
> admin and internal can commit (only admin can uncommit). All of this is
> enforced server-side — the UI is for usability, RLS is the security
> boundary.

If that sentence stays true at every step, the rest of this document is plumbing.

## Identity layer — three tables in dialog

```
auth.users        ← Supabase Auth owns this; one row per signed-in user
   │
   ▼ (1:1 via id)
profiles          ← display_name, role, supplier_id
   │
   ▼ (factory only; FK)
suppliers         ← Ditar (DT), Tejaswi (TP), future onboardings
```

- **`auth.users`** — managed by Supabase. You don't touch this directly; users
  appear here via email/password or magic-link sign-up.
- **`profiles`** — your join. Every signed-in user MUST have a profile row, or
  RLS will (correctly) reject every read. A trigger or admin step inserts the
  profile.
- **`suppliers`** — canonical supplier list with the 2-letter code (`DT`, `TP`,
  …). Each factory profile references one supplier.

### Why explicit `supplier_id` (not email-domain mapping)

Some factory users sign in with free domains (Prasad uses `…@gmail.com`).
Mapping email → supplier is impossible. The explicit `profiles.supplier_id`
is the only safe answer. Bonus: supplier renames are one row update.

## Per-table policies

### `profiles`

```sql
alter table profiles enable row level security;

-- Self-read
create policy profiles_self_read on profiles for select using (
  id = auth.uid()
);

-- Admin / internal can read all (for displayNameById, "committed by Mike", etc.)
create policy profiles_internal_read on profiles for select using (
  exists (
    select 1 from profiles me
    where me.id = auth.uid() and me.role in ('admin','internal')
  )
);

-- No client writes. Inserts/updates go through an admin RPC or service-role
-- script (see "Onboarding" below).
```

### `suppliers`

```sql
alter table suppliers enable row level security;

-- Everyone authenticated reads the list (needed for code rendering + dropdowns).
create policy suppliers_authenticated_read on suppliers for select using (
  auth.uid() is not null
);

-- Writes are admin-only.
create policy suppliers_admin_write on suppliers for all using (
  exists (
    select 1 from profiles me
    where me.id = auth.uid() and me.role = 'admin'
  )
);
```

### `master_items`

```sql
alter table master_items enable row level security;

create policy master_items_read on master_items for select using (
  exists (
    select 1 from profiles me
    where me.id = auth.uid()
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = master_items.supplier_id)
      )
  )
);

create policy master_items_factory_update on master_items for update using (
  exists (
    select 1 from profiles me
    where me.id = auth.uid()
      and me.role = 'factory'
      and me.supplier_id = master_items.supplier_id
  )
);

-- INSERT is admin-only (master data arrives via Phase 11 API push).
create policy master_items_admin_insert on master_items for insert with check (
  exists (
    select 1 from profiles me
    where me.id = auth.uid() and me.role = 'admin'
  )
);
```

The UPDATE policy lets factories *touch* their own rows but doesn't restrict
which columns they can change. That's the column-guard trigger's job — next
section.

### `containers`

```sql
alter table containers enable row level security;

create policy containers_read on containers for select using (
  exists (
    select 1 from profiles me
    where me.id = auth.uid()
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = containers.supplier_id)
      )
  )
);

create policy containers_insert on containers for insert with check (
  status = 'draft'
  and committed_at is null
  and committed_by is null
  and ofq_reference is null
  and exists (
    select 1 from profiles me
    where me.id = auth.uid()
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = containers.supplier_id)
      )
  )
);

create policy containers_draft_update on containers for update using (
  status = 'draft'
  and exists (
    select 1 from profiles me
    where me.id = auth.uid()
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = containers.supplier_id)
      )
  )
);

create policy containers_delete on containers for delete using (
  status = 'draft'
  and exists (
    select 1 from profiles me
    where me.id = auth.uid()
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = containers.supplier_id)
      )
  )
);

-- Commit / Uncommit don't have direct UPDATE policies. They go through
-- security-definer RPCs (commit_container, uncommit_container) below.
```

### `container_allocations`

```sql
alter table container_allocations enable row level security;

create policy container_allocations_read on container_allocations for select using (
  exists (
    select 1 from containers c
    join profiles me on me.id = auth.uid()
    where c.id = container_allocations.container_id
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = c.supplier_id)
      )
  )
);

create policy container_allocations_write on container_allocations for all using (
  exists (
    select 1 from containers c
    join profiles me on me.id = auth.uid()
    where c.id = container_allocations.container_id
      and c.status = 'draft'
      and (
        me.role in ('admin','internal')
        or (me.role = 'factory' and me.supplier_id = c.supplier_id)
      )
  )
);
```

### `container_sequences`

Holds the monotonic counter for `<SUP><NNNN>`. Never touched directly by the
client — only the `next_container_code` RPC reads / updates it.

```sql
alter table container_sequences enable row level security;
-- No client-facing policies. Only the SECURITY DEFINER RPC touches it.
```

## RPC functions (server-side guards)

The functions below are `SECURITY DEFINER` — they run as their owner role,
bypassing RLS for the specific safe operation. Each function does its own role
check via `auth.uid()` against `profiles`.

### `commit_container(p_container_id uuid, p_ofq_ref text)`

```sql
create or replace function commit_container(p_container_id uuid, p_ofq_ref text)
returns void language plpgsql security definer
set search_path = public as $$
declare caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role is null or caller_role not in ('admin','internal') then
    raise exception 'only admin or internal users can commit containers';
  end if;

  update master_items m
  set committed_quantity = m.committed_quantity + sub.alloc_total
  from (
    select master_item_id, sum(quantity) as alloc_total
    from container_allocations
    where container_id = p_container_id
    group by master_item_id
  ) sub
  where m.id = sub.master_item_id;

  update containers
  set status = 'committed',
      ofq_reference = p_ofq_ref,
      committed_at = now(),
      committed_by = auth.uid()
  where id = p_container_id and status = 'draft';
end $$;

revoke all on function commit_container(uuid, text) from public;
grant execute on function commit_container(uuid, text) to authenticated;
```

Key points:

- `committed_by = auth.uid()` is set server-side — **the client cannot spoof
  it**.
- The role check is inside the function — same enforcement on every call path.
- `status = 'draft'` in the WHERE clause prevents double-commit races without
  any client-side coordination.

### `uncommit_container(p_container_id uuid)`

Admin-only. Reverses the master decrement and resets the commit fields.

```sql
create or replace function uncommit_container(p_container_id uuid)
returns void language plpgsql security definer
set search_path = public as $$
declare caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role <> 'admin' then
    raise exception 'only admin can uncommit containers';
  end if;

  update master_items m
  set committed_quantity = m.committed_quantity - sub.alloc_total
  from (
    select master_item_id, sum(quantity) as alloc_total
    from container_allocations
    where container_id = p_container_id
    group by master_item_id
  ) sub
  where m.id = sub.master_item_id;

  update containers
  set status = 'draft',
      ofq_reference = null,
      committed_at = null,
      committed_by = null
  where id = p_container_id and status = 'committed';
end $$;

revoke all on function uncommit_container(uuid) from public;
grant execute on function uncommit_container(uuid) to authenticated;
```

### `next_container_code(p_supplier_code text) returns text`

Atomic monotonic counter. Called once per container creation.

```sql
create or replace function next_container_code(p_supplier_code text)
returns text language plpgsql security definer
set search_path = public as $$
declare n integer;
begin
  insert into container_sequences (prefix, next_number)
  values (upper(p_supplier_code), 2)
  on conflict (prefix)
  do update set next_number = container_sequences.next_number + 1
  returning next_number - 1 into n;
  return upper(p_supplier_code) || lpad(n::text, 4, '0');
end $$;

revoke all on function next_container_code(text) from public;
grant execute on function next_container_code(text) to authenticated;
```

Two browser tabs can't mint the same code — Postgres `ON CONFLICT` handles the
race atomically.

## Column-level write restriction (trigger)

Factories may only UPDATE `cargo_ready`, `cbm_per_case`, `cbm_total` on
`master_items`. The RLS policy lets them touch their rows; the trigger blocks
column-level abuse:

```sql
create or replace function master_items_factory_column_guard()
returns trigger language plpgsql as $$
declare caller_role text;
begin
  select role into caller_role from profiles where id = auth.uid();
  if caller_role <> 'factory' then return new; end if;

  if (new.id, new.document_number, new.line_id, new.sku, new.name, new.ship_to,
      new.original_quantity, new.committed_quantity, new.supplier_id, new.raw)
     is distinct from
     (old.id, old.document_number, old.line_id, old.sku, old.name, old.ship_to,
      old.original_quantity, old.committed_quantity, old.supplier_id, old.raw)
  then
    raise exception 'factory users may only update cargo_ready, cbm_per_case, cbm_total';
  end if;
  return new;
end $$;

create trigger master_items_factory_column_guard_t
before update on master_items
for each row execute function master_items_factory_column_guard();
```

Belt-and-suspenders alongside the UPDATE policy. A malicious client crafting an
UPDATE that touches `original_quantity` gets bounced.

## Onboarding new factories and users

You'll be adding more factories. Recommended flow:

### Adding a supplier

```sql
-- One-time per supplier, run by admin (via Supabase SQL editor).
insert into suppliers (name, code) values ('Acme Plastics Ltd.', 'AP');
```

Code is 2 letters, uppercase, unique. If your first pick collides, try a
different two letters (`AC`, `AM`). The constraint will tell you.

### Inviting factory users — two paths

**Path A — Supabase Studio (manual, simple, good for the first dozen)**

1. Studio → Authentication → Users → "Invite user." Enter email; Supabase
   sends an invite.
2. After they accept (set password / magic-link), copy the new `auth.users.id`.
3. Insert their profile:
   ```sql
   insert into profiles (id, email, display_name, role, supplier_id)
   values ('uuid-from-auth-users', 'aida@acmeplastics.example', 'Aida', 'factory',
           (select id from suppliers where name = 'Acme Plastics Ltd.'));
   ```

**Path B — Admin-only RPC (server-managed; scales better)**

When onboarding pace picks up, wrap the above into
`create_factory_user(email, display_name, supplier_id)` running on a Supabase
Edge Function with the service role. Returns the new profile. Never call from
the browser — the service role bypasses all RLS.

### Internal team members

Same flow, `role = 'internal'`, `supplier_id = null`.

### First admin (chicken-and-egg)

Insert by hand once, then onboard everyone else via the flows above:

```sql
insert into profiles (id, email, display_name, role, supplier_id)
values ('your-auth-user-id', 'hernandez73k@gmail.com', 'Mike', 'admin', null);
```

## Realtime + Presence

Supabase Realtime respects RLS on the read stream. A factory subscribed to
`master_items` receives events only for their supplier's rows; no extra
client-side filtering required.

**Caveat — the presence channel.** Editing locks are out-of-band: they're
broadcast via Supabase Realtime Presence (in production) or `BroadcastChannel`
(local dev). Lock events don't pass through table RLS — they only contain a
`displayName` and a `resourceId` (`master:<masterItemId>`). When the
multi-factory presence scenario is live, scope the presence channel topic by
supplier OR filter incoming events client-side to those whose `resourceId`
maps to a master item the current user can read. Otherwise you'd leak the
fact that "someone is editing some PO" even when the row itself isn't visible.

## Cloudflare Zero Trust — the gate before the gate

Your mental model is correct: **Cloudflare Zero Trust controls whether a
request reaches the app at all; Supabase RLS controls what data a signed-in
user can see.** They are complementary layers of defense, not redundant.

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│  Cloudflare ZT   │ ──▶ │  Vercel + Supabase │ ──▶ │  Postgres + RLS  │
│ "are you on the  │     │  "are you a known  │     │ "which rows can  │
│  allow-list?"    │     │  Supabase user?"   │     │  you read/write?"│
└──────────────────┘     └────────────────────┘     └──────────────────┘
   Identity policy        Session / JWT               auth.uid() + policies
```

### What ZT gives you (that RLS doesn't)

- **Pre-app identity gate.** Only allow-listed emails / domains reach the
  Vercel deployment. Random scanners and unrelated traffic never load the app.
- **Audit logs** of every access attempt (allowed AND denied) — useful
  forensics for *"who tried to load the dashboard at 3am?"*
- **Pre-auth rate limiting + DDoS protection** at Cloudflare's edge, before
  bursts touch Vercel's invocation budget.
- **MFA / device-posture checks** (optional) enforced at the network layer;
  the app code doesn't have to implement them.

### What ZT does NOT give you

- **Row-level scoping.** ZT doesn't know about `supplier_id`. Once Prasad is
  past ZT, he could still see Ditar's POs unless RLS keeps him out. **RLS is
  non-negotiable** — ZT is the porch light, RLS is the deadbolt.
- **A replacement for Supabase Auth.** The Supabase session is what carries
  `auth.uid()` into your queries. ZT doesn't replace that — it precedes it.

### How they compose at runtime

1. User opens `https://stufferplanner.example.com`.
2. Cloudflare intercepts → enforces the ZT access policy. Allowed identities
   pass through; everyone else hits a 403 / Cloudflare login wall.
3. The Vercel-hosted app loads in the user's browser.
4. App boots → Supabase client checks for an existing session. If none, the
   user signs in via Supabase Auth (magic link / OTP / password — your
   pick).
5. The session JWT now carries `auth.uid()`. Every query / RPC carries that
   JWT.
6. Postgres RLS evaluates each query against the policies in this doc.

The user effectively signs in twice (once for ZT, once for Supabase) — but ZT
sessions are sticky (typically 24h), so it's only friction on first visit per
day.

### Identity-provider choice

ZT supports Google, Microsoft, Okta, GitHub, generic OIDC/SAML, and **email
OTP** out of the box. For your mixed-domain supplier base (Ditar on a
corporate domain, Prasad on gmail), **email OTP** is the simplest path:

- Works for `mberrueco@ditar.co` (corporate domain).
- Works for `prasad.tejaswiplastic@gmail.com` (free domain).
- No identity-provider integration needed on the supplier's side.
- User enters their email → Cloudflare emails them a code → they paste it →
  through.

When you grow past ~50 users, consider migrating internal users to your own
SSO (Google Workspace, Microsoft Entra, etc.) and keeping email OTP for
external factory users.

### Policy structure

In the Cloudflare Zero Trust dashboard → Access → Applications:

1. Create one application bound to your Vercel hostname
   (`stufferplanner.example.com`).
2. Add an Access policy with the allow-list:
   ```
   Action: Allow
   Include:
     - Emails: mberrueco@ditar.co,
               prasad.tejaswiplastic@gmail.com,
               hernandez73k@gmail.com,
               …
   Require: Email OTP
   ```
3. Default-deny is automatic — no need for an explicit block rule below.

### Onboarding workflow — two systems, one motion

When you add a new factory user (per *Onboarding new factories and users*),
there are now **two** things to provision:

1. **Cloudflare ZT allow-list.** Add the email to the Access policy.
   Effective immediately.
2. **Supabase profile.** Create the `auth.users` entry via Studio invite,
   then insert the `profiles` row.

Skip step 1: the user gets a Cloudflare 403 before they ever see Supabase
sign-in.
Skip step 2: the user passes ZT, lands on the app, every API call fails with
RLS denials.

Worth scripting both into a single admin endpoint (Cloudflare API +
Supabase Admin API in one Edge Function) once onboarding tempo picks up.

### Gotchas

- **Vercel preview URLs.** Each PR gets a unique `*.vercel.app` URL. Either
  include `*.vercel.app` in the ZT application hostname pattern, or skip
  ZT for previews (defensible — they're short-lived test environments). Don't
  forget the Supabase Auth callback allowlist needs the same set.
- **Webhooks and server-to-server traffic.** If anything ever calls your
  Vercel deployment server-to-server (a future admin push, a Stripe-style
  webhook, etc.), use a **ZT service token** — not user identity.
- **Cookie domains.** ZT sets a `CF_Authorization` cookie scoped to the
  proxied domain. If you ever serve the app from multiple subdomains, set
  the cookie domain accordingly.
- **OTP email deliverability.** Gmail / Outlook spam filters occasionally
  swallow Cloudflare's OTP messages. Warn factory users to check spam on
  first sign-in.
- **The deny page is brandable.** Don't leave it as the default Cloudflare
  logo if external factory users will see it on first contact.

### Cost note

Cloudflare Zero Trust has a free tier (currently 50 users) that comfortably
covers the planner's universe today (admin + a handful of internal + a few
factory users per supplier). Paid plans start when you exceed the seat count.

---

## Anti-patterns

- **Don't trust client-supplied `supplier_id` on INSERT.** The INSERT policies
  above check it; the trigger backs them up.
- **Don't expose the service-role key in the browser.** Only the `anon` key
  goes into `VITE_SUPABASE_ANON_KEY`. Service role lives in Edge Functions and
  admin scripts.
- **Don't rely on UI hiding for security.** A determined user can craft
  requests manually. Every gate that matters lives in RLS or in an RPC role
  check.
- **Don't drop RLS to "fix" a bug.** If a query fails, debug the policy —
  disabling RLS as a workaround is how data leaks happen.
- **Don't use `auth.role()` for app role checks.** That's the Postgres role
  (anon/authenticated/service_role), not the app role. Always query
  `profiles.role`.

## Deployment checklist

When pulling the trigger:

1. **Migrations applied.** `supabase/migrations/0001_init.sql` contains the
   schema + RLS policies + functions + triggers. Run via `supabase db push`
   or the dashboard.
2. **RLS enabled on every table.** Confirm with
   `select tablename, rowsecurity from pg_tables where schemaname = 'public'`.
   Every relevant row should show `t`.
3. **Function grants set.** Re-grant after every migration; defaults strip
   them.
4. **Auth callback URLs configured.** Production Vercel URL plus a wildcard
   for preview deploys (`https://*.vercel.app/auth/callback`). Studio →
   Authentication → URL Configuration.
5. **Env vars in Vercel.** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The
   service role goes in Edge Function environment, never in the client
   bundle.
6. **First admin profile row inserted manually.** Then onboarding can use
   that admin.
7. **Realtime channels.** Subscribe to `master_items`, `containers`,
   `container_allocations`. RLS filters the events.
8. **Cloudflare Zero Trust application + policy configured.** The Vercel
   hostname is behind a ZT Access app; the allow-list contains every real
   user's email (admin + internal + every factory user across all
   suppliers). See *Cloudflare Zero Trust — the gate before the gate*.
9. **DNS pointing at Cloudflare** with the proxy (orange-cloud) enabled for
   the Vercel-fronted hostname. Without this, ZT never sees the traffic.
10. **Smoke test all four roles** end-to-end behind ZT before pointing the
    freight forwarders / factory users at it — including the first-time
    ZT sign-in flow (email OTP delivery).

## Testing RLS

### Manual

Supabase Studio's SQL editor supports impersonation:

```sql
set local request.jwt.claim.sub = '<some-factory-uuid>';
select * from master_items;  -- expect only that factory's rows
```

Also do a multi-tab manual test: sign in as each role in a different browser
profile / incognito window. Verify tray, grid, and dialogs behave per the
permissions matrix.

Try to break it. Sign in as factory; open the network tab; hand-craft a
PATCH to `master_items` for another supplier's row. RLS should reject with
HTTP 4xx.

### Automated (future)

Once an e2e harness exists (Playwright / Cypress), add a small suite that
walks each role through view → allocate → commit → uncommit against a known
fixture database. Run on every PR.

## Open considerations

- **Audit log.** `committed_by` answers "who shipped this OFQ" but not "who
  edited what draft." If that matters later, add an `events` table with
  INSERT triggers on the planning tables.
- **Storage buckets.** If you eventually accept file uploads (factory CSVs,
  container photos), apply the same supplier-scoped RLS to `storage.objects`.
- **Rate limiting.** Supabase has basic limits. If a factory's CSV upload
  hammers UPDATE, throttle at the Edge Function layer.
- **Cross-tenant search.** Today only admin/internal can search across
  suppliers. If a factory ever wants a global "where is my PO?" view across
  destinations, build it as a view with RLS still in effect.
