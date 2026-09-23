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
import {
  SALES_MAPPING_FIELDS,
  type SalesMappingNodeData,
  type SalesMappingSelections,
} from '../types/salesMapping';
import { CsvPreviewTable } from '../components/CsvPreviewTable';

export type SalesMappingRFNode = Node<SalesMappingNodeData, 'salesMapping'>;

const EMPTY_SELECTIONS: SalesMappingSelections = { item_id: null, sales_qty: null, sales_date: null };

const FIELD_LABELS: Record<keyof SalesMappingSelections, string> = {
  item_id: 'Item ID',
  sales_qty: 'Sales Qty',
  sales_date: 'Sales Date',
};

type AutoMatchStatus = 'idle' | 'matching' | 'matched' | 'partial' | 'error';

const AUTO_MATCH_MESSAGES: Record<Exclude<AutoMatchStatus, 'idle'>, string> = {
  matching: 'Auto-matching columns with Jev…',
  matched: 'Auto-matched by Jev',
  partial: "Auto-match couldn't find all columns — finish manually",
  error: 'Auto-match failed — select columns manually',
};

export function SalesMappingNode({ id, data }: NodeProps<SalesMappingRFNode>) {
  const { updateNodeData } = useReactFlow();
  const connections = useNodeConnections({ id, handleType: 'target', handleId: 'input' });
  const sourceId = connections[0]?.source;
  const sourceNode = useNodesData<Node<CsvInputNodeData>>(sourceId ?? '');
  const upstreamTable = sourceNode?.data.table ?? null;

  // Staged locally; only written to node data (and thus visible downstream) on Apply
  // (or on a full auto-match, which commits the same way). Intentionally not synced
  // to upstreamTable.headers via useEffect: if the upstream CSV changes, a stale
  // selection simply won't match any <option>, the <select> shows unselected, and
  // canApply correctly goes false.
  const [selections, setSelections] = useState<SalesMappingSelections>(EMPTY_SELECTIONS);
  const [autoMatchStatus, setAutoMatchStatus] = useState<AutoMatchStatus>('idle');

  const onSelect = (field: keyof SalesMappingSelections) => (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value || null;
    setSelections((prev) => ({ ...prev, [field]: value }));
  };

  const canApply = !!upstreamTable && SALES_MAPPING_FIELDS.every((f) => !!selections[f]);

  const commitMapping = (mapping: SalesMappingSelections, table: CsvTableData) => {
    const rows = table.rows.map((row) => ({
      item_id: row[mapping.item_id!] ?? '',
      sales_qty: row[mapping.sales_qty!] ?? '',
      sales_date: row[mapping.sales_date!] ?? '',
    }));
    updateNodeData(id, {
      mapping,
      table: { headers: [...SALES_MAPPING_FIELDS], rows, rowCount: table.rowCount },
    });
  };

  const onApply = () => {
    if (!upstreamTable || !canApply) return;
    commitMapping(selections, upstreamTable);
  };

  // Derived primitive (not the upstreamTable object, whose identity can change every
  // render via useNodesData) so the auto-match effect only re-fires when the upstream
  // node or its columns actually change.
  const matchKey = sourceId && upstreamTable ? `${sourceId}::${upstreamTable.headers.join(' ')}` : '';

  useEffect(() => {
    if (!matchKey || !upstreamTable) {
      setAutoMatchStatus('idle');
      return;
    }

    let cancelled = false;
    setAutoMatchStatus('matching');

    fetch('/api/match-columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: upstreamTable.headers }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`match-columns failed: ${res.status}`);
        return res.json() as Promise<SalesMappingSelections>;
      })
      .then((result) => {
        if (cancelled) return;
        setSelections(result);
        const allMatched = SALES_MAPPING_FIELDS.every((f) => !!result[f]);
        if (allMatched) {
          commitMapping(result, upstreamTable);
          setAutoMatchStatus('matched');
        } else {
          setAutoMatchStatus('partial');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Auto column match failed:', err);
        setAutoMatchStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on matchKey, not upstreamTable identity
  }, [matchKey]);

  return (
    <div className="sales-mapping-node">
      <Handle type="target" position={Position.Left} id="input" />
      <div className="node-header">Sales Mapping</div>

      {!upstreamTable && <div className="node-empty">Connect a CSV Input node and click Run</div>}

      {upstreamTable && (
        <div className="mapping-fields">
          {SALES_MAPPING_FIELDS.map((field) => (
            <label key={field} className="mapping-field">
              <span className="mapping-field-label">{FIELD_LABELS[field]}</span>
              <select className="nodrag" value={selections[field] ?? ''} onChange={onSelect(field)}>
                <option value="">Select column…</option>
                {upstreamTable.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {autoMatchStatus !== 'idle' && (
        <div className={autoMatchStatus === 'error' ? 'node-error' : 'node-empty'}>
          {AUTO_MATCH_MESSAGES[autoMatchStatus]}
        </div>
      )}

      <button className="nodrag" onClick={onApply} disabled={!canApply}>
        Apply
      </button>

      {data.table && <CsvPreviewTable table={data.table} />}

      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
}
