import type { Edge, Node } from '@xyflow/react';
import type { CsvInputRFNode } from './nodes/CsvInputNode';
import type { SalesMappingRFNode } from './nodes/SalesMappingNode';
import type { CategoryMappingRFNode } from './nodes/CategoryMappingNode';
import type { AiLookupRFNode } from './nodes/AiLookupNode';

type FlowNode = CsvInputRFNode | SalesMappingRFNode | CategoryMappingRFNode | AiLookupRFNode | Node;

export const initialNodes: FlowNode[] = [
  {
    id: 'csv-1',
    type: 'csvInput',
    position: { x: 0, y: 0 },
    data: { fileName: null, status: 'idle', table: null },
  },
  {
    id: 'csv-2',
    type: 'csvInput',
    position: { x: 0, y: 560 },
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
  {
    id: 'ai-lookup-1',
    type: 'aiLookup',
    position: { x: 840, y: 400 },
    data: {
      sourceKeyColumn: null,
      lookupKeyColumn: null,
      lookupValueColumn: null,
      table: null,
      matchedCount: null,
      unmatchedCount: null,
    },
  },
  {
    id: 'table-2',
    type: 'tableView',
    position: { x: 1260, y: 400 },
    data: {},
  },
];

export const initialEdges: Edge[] = [
  { id: 'e1', source: 'csv-1', sourceHandle: 'output', target: 'table-1', targetHandle: 'input' },
  { id: 'e2', source: 'csv-1', sourceHandle: 'output', target: 'sales-mapping-1', targetHandle: 'input' },
  { id: 'e3', source: 'csv-1', sourceHandle: 'output', target: 'category-mapping-1', targetHandle: 'input' },
  { id: 'e4', source: 'csv-1', sourceHandle: 'output', target: 'ai-lookup-1', targetHandle: 'source' },
  { id: 'e5', source: 'csv-2', sourceHandle: 'output', target: 'ai-lookup-1', targetHandle: 'lookup' },
  { id: 'e6', source: 'ai-lookup-1', sourceHandle: 'output', target: 'table-2', targetHandle: 'input' },
];
