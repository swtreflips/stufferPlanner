import type { Supplier } from '../../types/supplier'
import { sampleSuppliers } from '../sampleData'
import type { SupplierRepo } from './types'

export function createLocalSupplierRepo(): SupplierRepo {
  const suppliers: Supplier[] = sampleSuppliers.map((s) => ({ ...s }))

  return {
    async fetchAll() {
      return suppliers.map((s) => ({ ...s }))
    },
  }
}
