import type { Scenario } from '../../types/scenario'
import { sampleMainScenario } from '../sampleData'
import type { CreateScenarioInput, ScenarioRepo } from './types'

let nextId = 1

export function createLocalScenarioRepo(): ScenarioRepo {
  const scenarios: Scenario[] = [{ ...sampleMainScenario }]

  return {
    async fetchAll() {
      return scenarios.map((s) => ({ ...s }))
    },
    async create(input: CreateScenarioInput): Promise<Scenario> {
      const scenario: Scenario = {
        id: `scenario-${nextId++}-${Date.now()}`,
        name: input.name,
        parentId: input.parentId,
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
        archivedAt: null,
      }
      scenarios.push(scenario)
      return { ...scenario }
    },
  }
}
