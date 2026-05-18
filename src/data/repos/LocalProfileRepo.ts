import type { Profile } from '../../types/profile'
import { sampleProfiles } from '../sampleData'
import type { ProfileRepo } from './types'

export function createLocalProfileRepo(): ProfileRepo {
  const profiles: Profile[] = sampleProfiles.map((p) => ({ ...p }))

  return {
    async fetchAll() {
      return profiles.map((p) => ({ ...p }))
    },
    async findById(id) {
      const found = profiles.find((p) => p.id === id)
      return found ? { ...found } : null
    },
  }
}
