import type { Edge, Node } from '@xyflow/react';
import type { CsvInputRFNode } from './nodes/CsvInputNode';
import type { SalesMappingRFNode } from './nodes/SalesMappingNode';
import type { CategoryMappingRFNode } from './nodes/CategoryMappingNode';

type FlowNode = CsvInputRFNode | SalesMappingRFNode | CategoryMappingRFNode | Node;

export const initialNodes: FlowNode[] = [
  {
    id: 'csv-1',
    type: 'csvInput',
    position: { x: 0, y: 0 },
    data: { fileName: null, status: 'idle', table: null },
  },
  {
    id: 'table-1',
    type: 'tableView',
    position: { x: 420, y: 0 },
    data: {},
  },
  {
    id: 'sales-mapping-1',
    type: 'salesMapping',
    position: { x: 420, y: 320 },
    data: { mapping: null, table: null },
  },
  {
    id: 'category-mapping-1',
    type: 'categoryMapping',
    position: { x: 840, y: 0 },
    data: { sourceColumn: null, assignments: null, table: null },
  },
];

export const initialEdges: Edge[] = [
  { id: 'e1', source: 'csv-1', sourceHandle: 'output', target: 'table-1', targetHandle: 'input' },
  { id: 'e2', source: 'csv-1', sourceHandle: 'output', target: 'sales-mapping-1', targetHandle: 'input' },
  { id: 'e3', source: 'csv-1', sourceHandle: 'output', target: 'category-mapping-1', targetHandle: 'input' },
];
