import {
  Handle,
  Position,
  useReactFlow,
  useNodeConnections,
  useNodesData,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { CsvInputNodeData, CsvTableData } from '../types/csv';
import { CATEGORY_FIELDS, type CategoryAssignments, type CategoryMappingNodeData } from '../types/categoryMapping';
import { CsvPreviewTable } from '../components/CsvPreviewTable';

export type CategoryMappingRFNode = Node<CategoryMappingNodeData, 'categoryMapping'>;

const CATEGORY_LABELS: Record<(typeof CATEGORY_FIELDS)[number], string> = {
  furniture: 'Furniture',
  vehicles: 'Vehicles',
  vegetables: 'Vegetables',
  electronics: 'Electronics',
};

type ClassifyStatus = 'idle' | 'classifying' | 'classified' | 'error';

const STATUS_MESSAGES: Record<Exclude<ClassifyStatus, 'idle'>, string> = {
  classifying: 'Classifying with Jev…',
  classified: 'Classified by Jev',
  error: 'Classification failed — check the item column',
};

type ClassifyResponse = { categories: Record<string, string | null> };

export function CategoryMappingNode({ id, data }: NodeProps<CategoryMappingRFNode>) {
  const { updateNodeData } = useReactFlow();
  const connections = useNodeConnections({ id, handleType: 'target', handleId: 'input' });
  const sourceId = connections[0]?.source;
  const sourceNode = useNodesData<Node<CsvInputNodeData>>(sourceId ?? '');
  const upstreamTable = sourceNode?.data.table ?? null;

  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [status, setStatus] = useState<ClassifyStatus>('idle');

  // Default to the first upstream column once one is available, without
  // clobbering a selection the user already made.
  useEffect(() => {
    if (selectedColumn === null && upstreamTable && upstreamTable.headers.length > 0) {
      setSelectedColumn(upstreamTable.headers[0]);
    }
  }, [selectedColumn, upstreamTable]);

  const onSelectColumn = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedColumn(e.target.value || null);
  };

  const commitClassification = (table: CsvTableData, column: string, categories: Record<string, string | null>) => {
    const assignments: CategoryAssignments = { furniture: [], vehicles: [], vegetables: [], electronics: [] };
    for (const [item, category] of Object.entries(categories)) {
      if (category && category in assignments) {
        assignments[category as keyof CategoryAssignments].push(item);
      }
    }

    const rows = table.rows.map((row) => ({ ...row, category: categories[row[column]] ?? '' }));
    updateNodeData(id, {
      sourceColumn: column,
      assignments,
      table: { headers: [...table.headers, 'category'], rows, rowCount: table.rowCount },
    });
  };

  // Derived primitive (not the upstreamTable object, whose identity can change every
  // render via useNodesData) so the classify effect only re-fires when the upstream
  // node, the selected column, or the relevant column values actually change.
  const classifyKey =
    sourceId && upstreamTable && selectedColumn
      ? `${sourceId}::${selectedColumn}::${upstreamTable.rows.map((r) => r[selectedColumn]).join('|')}`
      : '';

  useEffect(() => {
    if (!classifyKey || !upstreamTable || !selectedColumn) {
      setStatus('idle');
      return;
    }

    const uniqueItems = Array.from(
      new Set(upstreamTable.rows.map((r) => r[selectedColumn]).filter((v) => !!v)),
    );
    if (uniqueItems.length === 0) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('classifying');

    fetch('/api/classify-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: uniqueItems }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`classify-category failed: ${res.status}`);
        return res.json() as Promise<ClassifyResponse>;
      })
      .then((result) => {
        if (cancelled) return;
        commitClassification(upstreamTable, selectedColumn, result.categories);
        setStatus('classified');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Category classification failed:', err);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on classifyKey, not upstreamTable identity
  }, [classifyKey]);

  return (
    <div className="category-mapping-node">
      <Handle type="target" position={Position.Left} id="input" />
      <div className="node-header">Category Mapping</div>

      {!upstreamTable && <div className="node-empty">Connect a CSV Input node and click Run</div>}

      {upstreamTable && (
        <div className="mapping-fields">
          <label className="mapping-field">
            <span className="mapping-field-label">Item column</span>
            <select className="nodrag" value={selectedColumn ?? ''} onChange={onSelectColumn}>
              {upstreamTable.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {status !== 'idle' && (
        <div className={status === 'error' ? 'node-error' : 'node-empty'}>{STATUS_MESSAGES[status]}</div>
      )}

      {data.assignments && (
        <div className="category-boxes">
          {CATEGORY_FIELDS.map((field) => (
            <div key={field} className="category-box">
              <div className="category-box-label">{CATEGORY_LABELS[field]}</div>
              <ul className="category-box-items">
                {data.assignments![field].length === 0 && <li className="category-box-empty">—</li>}
                {data.assignments![field].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {data.table && <CsvPreviewTable table={data.table} />}

      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
}
