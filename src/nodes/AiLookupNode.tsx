import {
  Handle,
  NodeResizer,
  Position,
  useReactFlow,
  useNodeConnections,
  useNodesData,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { CsvInputNodeData, CsvTableData } from '../types/csv';
import type { AiLookupNodeData } from '../types/aiLookup';
import { CsvPreviewTable } from '../components/CsvPreviewTable';

export type AiLookupRFNode = Node<AiLookupNodeData, 'aiLookup'>;

type LookupStatus = 'idle' | 'matching' | 'done' | 'error';

type LookupMatchResponse = { matches: Record<string, string | null> };

function outputColumnName(sourceHeaders: string[], lookupValueColumn: string): string {
  if (!sourceHeaders.includes(lookupValueColumn)) return lookupValueColumn;
  return sourceHeaders.includes('lookup_result') ? `${lookupValueColumn}_lookup` : 'lookup_result';
}

export function AiLookupNode({ id, data, selected }: NodeProps<AiLookupRFNode>) {
  const { updateNodeData } = useReactFlow();

  const sourceConnections = useNodeConnections({ id, handleType: 'target', handleId: 'source' });
  const sourceId = sourceConnections[0]?.source;
  const sourceUpstream = useNodesData<Node<CsvInputNodeData>>(sourceId ?? '');
  const sourceTable = sourceUpstream?.data.table ?? null;

  const lookupConnections = useNodeConnections({ id, handleType: 'target', handleId: 'lookup' });
  const lookupId = lookupConnections[0]?.source;
  const lookupUpstream = useNodesData<Node<CsvInputNodeData>>(lookupId ?? '');
  const lookupTable = lookupUpstream?.data.table ?? null;

  const [sourceKeyColumn, setSourceKeyColumn] = useState<string | null>(null);
  const [lookupKeyColumn, setLookupKeyColumn] = useState<string | null>(null);
  const [lookupValueColumn, setLookupValueColumn] = useState<string | null>(null);
  const [status, setStatus] = useState<LookupStatus>('idle');

  // Default each selector to the first available header once its table is
  // connected, without clobbering a selection the user already made.
  useEffect(() => {
    if (sourceKeyColumn === null && sourceTable && sourceTable.headers.length > 0) {
      setSourceKeyColumn(sourceTable.headers[0]);
    }
  }, [sourceKeyColumn, sourceTable]);

  useEffect(() => {
    if (lookupTable && lookupTable.headers.length > 0) {
      if (lookupKeyColumn === null) setLookupKeyColumn(lookupTable.headers[0]);
      if (lookupValueColumn === null) {
        setLookupValueColumn(lookupTable.headers[1] ?? lookupTable.headers[0]);
      }
    }
  }, [lookupKeyColumn, lookupValueColumn, lookupTable]);

  const canRun = !!sourceTable && !!lookupTable && !!sourceKeyColumn && !!lookupKeyColumn && !!lookupValueColumn;

  const onRunLookup = () => {
    if (!canRun || !sourceTable || !lookupTable || !sourceKeyColumn || !lookupKeyColumn || !lookupValueColumn) return;

    const values = Array.from(
      new Set(sourceTable.rows.map((r) => r[sourceKeyColumn]).filter((v) => !!v)),
    );
    const candidates = Array.from(
      new Set(lookupTable.rows.map((r) => r[lookupKeyColumn]).filter((v) => !!v)),
    );
    if (values.length === 0 || candidates.length === 0) return;

    setStatus('matching');

    fetch('/api/lookup-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, candidates }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`lookup-match failed: ${res.status}`);
        return res.json() as Promise<LookupMatchResponse>;
      })
      .then((result) => {
        const outputColumn = outputColumnName(sourceTable.headers, lookupValueColumn);
        let matchedCount = 0;
        let unmatchedCount = 0;
        const rows = sourceTable.rows.map((row) => {
          const key = row[sourceKeyColumn];
          const matchedKey = key ? result.matches[key] : null;
          const lookupRow = matchedKey
            ? lookupTable.rows.find((r) => r[lookupKeyColumn] === matchedKey)
            : undefined;
          if (lookupRow) matchedCount += 1;
          else unmatchedCount += 1;
          return { ...row, [outputColumn]: lookupRow?.[lookupValueColumn] ?? '' };
        });

        const table: CsvTableData = {
          headers: [...sourceTable.headers, outputColumn],
          rows,
          rowCount: sourceTable.rowCount,
        };
        updateNodeData(id, { sourceKeyColumn, lookupKeyColumn, lookupValueColumn, table, matchedCount, unmatchedCount });
        setStatus('done');
      })
      .catch((err: unknown) => {
        console.error('AI lookup failed:', err);
        setStatus('error');
      });
  };

  return (
    <div className="ai-lookup-node">
      <NodeResizer minWidth={320} minHeight={220} isVisible={selected} />
      <Handle type="target" position={Position.Left} id="source" style={{ top: '35%' }} />
      <Handle type="target" position={Position.Left} id="lookup" style={{ top: '65%' }} />
      <div className="node-header">AI Lookup</div>

      {!sourceTable && <div className="node-empty">Connect a source table to the top-left handle</div>}
      {!lookupTable && <div className="node-empty">Connect a lookup table to the bottom-left handle</div>}

      {sourceTable && lookupTable && (
        <div className="mapping-fields">
          <label className="mapping-field">
            <span className="mapping-field-label">Lookup column (source)</span>
            <select
              className="nodrag"
              value={sourceKeyColumn ?? ''}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSourceKeyColumn(e.target.value || null)}
            >
              {sourceTable.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="mapping-field">
            <span className="mapping-field-label">Key column (lookup table)</span>
            <select
              className="nodrag"
              value={lookupKeyColumn ?? ''}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setLookupKeyColumn(e.target.value || null)}
            >
              {lookupTable.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className="mapping-field">
            <span className="mapping-field-label">Return column (lookup table)</span>
            <select
              className="nodrag"
              value={lookupValueColumn ?? ''}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setLookupValueColumn(e.target.value || null)}
            >
              {lookupTable.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <button className="nodrag" onClick={onRunLookup} disabled={!canRun || status === 'matching'}>
        Run Lookup
      </button>

      {status === 'matching' && <div className="node-empty">Matching with Jev…</div>}
      {status === 'done' && data.matchedCount !== null && (
        <div className="node-empty">
          Matched {data.matchedCount} of {(data.matchedCount ?? 0) + (data.unmatchedCount ?? 0)} rows with Jev
          {data.unmatchedCount ? ` — ${data.unmatchedCount} unmatched` : ''}
        </div>
      )}
      {status === 'error' && <div className="node-error">Lookup failed — check the selected columns</div>}

      {data.table && <CsvPreviewTable table={data.table} />}

      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
}
