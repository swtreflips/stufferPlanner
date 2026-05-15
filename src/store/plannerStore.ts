import { create } from 'zustand'
import type { OpenPoStatusReport } from '../types/openPoItem'
import type { Container } from '../types/container'
import { containerRepo, openPoRepo } from '../data/repos'

interface PlannerStore {
  openPoStatusReport: OpenPoStatusReport
  containers: Container[]
}

export const usePlannerStore = create<PlannerStore>((set) => {
  openPoRepo.fetchAll().then((openPoStatusReport) => set({ openPoStatusReport }))
  containerRepo.fetchAll().then((containers) => set({ containers }))

  return {
    openPoStatusReport: [],
    containers: [],
  }
})
