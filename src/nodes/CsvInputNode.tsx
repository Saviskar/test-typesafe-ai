import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import Papa from 'papaparse';
import { useRef, useState, type ChangeEvent } from 'react';
import type { CsvInputNodeData } from '../types/csv';
import { CsvPreviewTable } from '../components/CsvPreviewTable';

export type CsvInputRFNode = Node<CsvInputNodeData, 'csvInput'>;

export function CsvInputNode({ id, data }: NodeProps<CsvInputRFNode>) {
  const { updateNodeData } = useReactFlow();
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState(data.fileName);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    fileRef.current = file;
    setFileName(file?.name ?? null);
    updateNodeData(id, {
      fileName: file?.name ?? null,
      status: file ? 'file-selected' : 'idle',
      table: null,
      errorMessage: undefined,
    });
  };

  const onRun = () => {
    const file = fileRef.current;
    if (!file) return;
    updateNodeData(id, { status: 'processing' });
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      worker: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        updateNodeData(id, {
          status: 'processed',
          table: { headers, rows: results.data.slice(0, 50), rowCount: results.data.length },
        });
      },
      error: (err: Error) => {
        updateNodeData(id, { status: 'error', errorMessage: err.message });
      },
    });
  };

  return (
    <div className="csv-node">
      <div className="node-header">CSV Input</div>
      <input className="nodrag" type="file" accept=".csv,text/csv" onChange={onFileChange} />
      <button className="nodrag" onClick={onRun} disabled={!fileName || data.status === 'processing'}>
        Run
      </button>
      {data.status === 'error' && <div className="node-error">{data.errorMessage}</div>}
      {data.status === 'processed' && data.table && <CsvPreviewTable table={data.table} />}
      <Handle type="source" position={Position.Right} id="output" />
    </div>
  );
}
