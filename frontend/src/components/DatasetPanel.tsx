import { ChangeEvent } from 'react';
import type { DatasetItem } from '../types/annotations';

interface DatasetPanelProps {
  items: DatasetItem[];
  activeId: string | null;
  onFolderSelected(files: FileList): void;
  onSelectItem(id: string): void;
}

export function DatasetPanel({ items, activeId, onFolderSelected, onSelectItem }: DatasetPanelProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onFolderSelected(files);
    }
    event.target.value = '';
  };

  const normalizeLabel = (item: DatasetItem) => {
    const base = item.relativePath ?? item.name;
    return base;
  };

  return (
    <div className="dataset-panel">
      <div className="dataset-header">
        <h3>Dataset Folder</h3>
        <label className="upload-label dataset-upload">
          <span>Choose folder</span>
          <input
            type="file"
            multiple
            accept="image/*,.json"
            onChange={handleChange}
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            webkitdirectory=""
          />
        </label>
      </div>
      <p className="dataset-hint">Select a folder containing images (+ optional Labelme JSON).</p>
      <div className="dataset-list">
        {items.length === 0 && <p className="dataset-empty">No dataset loaded.</p>}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === activeId ? 'dataset-item dataset-item--active' : 'dataset-item'}
            onClick={() => onSelectItem(item.id)}
          >
            <span>{normalizeLabel(item)}</span>
            {item.annotationFile ? <small className="dataset-tag">JSON</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DatasetPanel;
