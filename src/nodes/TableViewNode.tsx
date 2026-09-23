import { Handle, Position, useNodeConnections, useNodesData, type Node, type NodeProps } from '@xyflow/react';
import type { CsvInputNodeData } from '../types/csv';
import { CsvPreviewTable } from '../components/CsvPreviewTable';

export function TableViewNode({ id }: NodeProps) {
  const connections = useNodeConnections({ id, handleType: 'target', handleId: 'input' });
  const sourceId = connections[0]?.source;
  const sourceNode = useNodesData<Node<CsvInputNodeData>>(sourceId ?? '');
  const table = sourceNode?.data.table ?? null;

  return (
    <div className="table-view-node">
      <Handle type="target" position={Position.Left} id="input" />
      <div className="node-header">Table View</div>
      {!table && <div className="node-empty">Connect a CSV Input node and click Run</div>}
      {table && <CsvPreviewTable table={table} />}
    </div>
  );
}
