import type { CsvTableData } from './csv';

// Node<T> in @xyflow/react requires T to satisfy Record<string, unknown>,
// so intersect rather than use a bare interface.
export type AiLookupNodeData = {
  sourceKeyColumn: string | null; // column in the source table to look up
  lookupKeyColumn: string | null; // key column in the lookup table
  lookupValueColumn: string | null; // value column in the lookup table to pull back
  table: CsvTableData | null; // output: source table + appended result column, committed on Run Lookup
  matchedCount: number | null;
  unmatchedCount: number | null;
} & Record<string, unknown>;
