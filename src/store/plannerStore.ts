import { create } from 'zustand'
import type { OpenPoItem } from '../types/openPoItem'
import type { Container } from '../types/container'
import { containerRepo, openPoRepo } from '../data/repos'

interface PlannerStore {
  openPoItems: OpenPoItem[]
  containers: Container[]
}

export const usePlannerStore = create<PlannerStore>((set) => {
  openPoRepo.fetchAll().then((openPoItems) => set({ openPoItems }))
  containerRepo.fetchAll().then((containers) => set({ containers }))

  return {
    openPoItems: [],
    containers: [],
  }
})
