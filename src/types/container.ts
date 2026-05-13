export interface Container {
  id: string
  name: string
  type: '20GP' | '40GP' | '40HC' | '45HC'
  rowIds: string[]
}
