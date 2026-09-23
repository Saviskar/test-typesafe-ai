export type CsvParseStatus = 'idle' | 'file-selected' | 'processing' | 'processed' | 'error';

export interface CsvTableData {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number; // total parsed rows; rows[] may be a truncated preview
}

// Node<T> in @xyflow/react requires T to satisfy Record<string, unknown>,
// so intersect rather than use a bare interface.
export type CsvInputNodeData = {
  fileName: string | null;
  status: CsvParseStatus;
  table: CsvTableData | null;
  errorMessage?: string;
} & Record<string, unknown>;
