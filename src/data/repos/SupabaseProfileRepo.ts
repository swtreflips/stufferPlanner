import { supabase } from '../../lib/supabase'
import type { Profile, Role } from '../../types/profile'
import type { ProfileRepo } from './types'

/**
 * Profiles, from the shared rates project.
 *
 * WHAT YOU GET BACK IS ALREADY FILTERED BY RLS. `profiles_directory_read` returns:
 *   internal  → everyone
 *   supplier  → its own organizations (including sibling plants) plus internal staff
 * A supplier never sees a competitor's people. There is no client-side filtering here and
 * there must not be — the moment a component filters, the database stops being the boundary.
 */

// The database splits two facts the planner's Role conflates:
//   organizations.type  what KIND of party  (internal | forwarder | supplier)
//   profiles.org_role   standing WITHIN it  (admin | member)
//
// The UI's Role folds them into one axis. Mapping lives here, in the repo, because that is
// exactly the translation a repository exists to do — see STUFFER.md "The canonical mapping".
function toRole(orgType: string | null | undefined, orgRole: string | null | undefined): Role {
  if (orgType === 'internal') return orgRole === 'admin' ? 'admin' : 'internal'
  // Anything external is a factory as far as the planner is concerned. A forwarder would land
  // here too, and correctly sees nothing — no planner policy grants their organization type.
  return 'factory'
}

interface Row {
  id: string
  must_change_password?: boolean | null
  full_name: string | null
  org_role: string | null
  organization_id: string | null
  organizations: { name: string | null; type: string | null } | null
}

function toProfile(row: Row, emailForSelf: string | null, selfId: string | null): Profile {
  return {
    id: row.id,
    // `profiles` deliberately carries no email column — auth.users owns it, and duplicating
    // it would create a second thing to keep in sync. Only the signed-in user's own address
    // is knowable client-side, from the session. Nothing in the UI renders anyone else's.
    email: row.id === selfId ? (emailForSelf ?? '') : '',
    displayName: row.full_name ?? '',
    role: toRole(row.organizations?.type, row.org_role),
    supplierId: row.organization_id,
    supplierName: row.organizations?.name ?? null,
    mustChangePassword: row.must_change_password ?? false,
  }
}

const SELECT =
  'id, full_name, org_role, organization_id, must_change_password, organizations(name, type)'

export function createSupabaseProfileRepo(): ProfileRepo {
  return {
    async fetchAll() {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.from('profiles').select(SELECT)
      if (error) throw new Error(`Failed to load profiles: ${error.message}`)
      return (data ?? []).map((r) =>
        toProfile(r as unknown as Row, session?.user.email ?? null, session?.user.id ?? null),
      )
    },

    async fetchMyOrgIds() {
      // A flat array of uuids. SECURITY DEFINER and scoped to auth.uid() internally — it
      // takes no argument, so there is nothing a caller could pass to ask about someone else.
      const { data, error } = await supabase.rpc('my_orgs')
      if (error) throw new Error(`Failed to load your organizations: ${error.message}`)
      return (data ?? []) as string[]
    },

    async findById(id) {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase
        .from('profiles')
        .select(SELECT)
        .eq('id', id)
        .maybeSingle()
      // A row hidden by RLS is indistinguishable from one that does not exist, and that is
      // correct: "no such person" and "not your person" should look identical to a caller.
      if (error) throw new Error(`Failed to load profile: ${error.message}`)
      return data
        ? toProfile(data as unknown as Row, session?.user.email ?? null, session?.user.id ?? null)
        : null
    },
  }
}
