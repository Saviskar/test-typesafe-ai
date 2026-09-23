import { CsvInputNode } from './CsvInputNode';
import { TableViewNode } from './TableViewNode';
import { SalesMappingNode } from './SalesMappingNode';
import { CategoryMappingNode } from './CategoryMappingNode';
import { AiLookupNode } from './AiLookupNode';

export const nodeTypes = {
  csvInput: CsvInputNode,
  tableView: TableViewNode,
  salesMapping: SalesMappingNode,
  categoryMapping: CategoryMappingNode,
  aiLookup: AiLookupNode,
};
