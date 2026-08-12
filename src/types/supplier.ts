export interface Supplier {
  id: string
  name: string
  /** 2–4 letters, unique, immutable, uppercase (e.g. "DTR"). */
  code: string
}

/**
 * How a supplier is labelled in a picker.
 *
 * The factories' registered names were removed from the database — the app identifies them by code
 * and the code↔entity mapping lives in NetSuite. `name` now holds the code too, so the old
 * `code · name` rendering came out as "DTR · DTR".
 *
 * This does not just print the code, because `name` is not guaranteed to stay equal to it — a
 * nickname or a plant descriptor could land there later, and that would be worth showing. Printing
 * the code alone would silently swallow it.
 */
export const supplierLabel = (s: Supplier): string =>
  s.name && s.name !== s.code ? `${s.code} · ${s.name}` : s.code
