import type { CsvTableData } from './csv';

export const CATEGORY_FIELDS = ['furniture', 'vehicles', 'vegetables', 'electronics'] as const;
export type CategoryField = (typeof CATEGORY_FIELDS)[number];

export type CategoryAssignments = Record<CategoryField, string[]>;

// Node<T> in @xyflow/react requires T to satisfy Record<string, unknown>,
// so intersect rather than use a bare interface.
export type CategoryMappingNodeData = {
  sourceColumn: string | null; // which upstream column holds the item name
  assignments: CategoryAssignments | null; // last computed grouping, for the per-category boxes
  table: CsvTableData | null; // output table: original rows + appended `category` column
} & Record<string, unknown>;
