import type { CsvTableData } from '../types/csv';

export function CsvPreviewTable({ table }: { table: CsvTableData }) {
  return (
    <div className="csv-table-wrapper nowheel nodrag">
      <table className="csv-table">
        <thead>
          <tr>
            {table.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {table.headers.map((h) => (
                <td key={h}>{row[h]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="csv-table-meta">
        {table.rowCount} rows × {table.headers.length} columns
        {table.rowCount > table.rows.length ? ` (showing first ${table.rows.length})` : ''}
      </div>
    </div>
  );
}
