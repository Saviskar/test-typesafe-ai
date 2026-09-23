import type { CsvTableData } from './csv';

export const SALES_MAPPING_FIELDS = ['item_id', 'sales_qty', 'sales_date'] as const;
export type SalesMappingField = (typeof SALES_MAPPING_FIELDS)[number];

export type SalesMappingSelections = {
  item_id: string | null;
  sales_qty: string | null;
  sales_date: string | null;
};

// Node<T> in @xyflow/react requires T to satisfy Record<string, unknown>,
// so intersect rather than use a bare interface.
export type SalesMappingNodeData = {
  mapping: SalesMappingSelections | null; // last *applied* mapping; null until first Apply
  table: CsvTableData | null; // mapped output (headers: item_id/sales_qty/sales_date), committed on Apply
} & Record<string, unknown>;
