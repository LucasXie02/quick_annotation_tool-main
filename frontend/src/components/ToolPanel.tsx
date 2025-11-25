import { ToolType } from '../types/annotations';

interface ToolPanelProps {
  activeTool: ToolType;
  onChange(tool: ToolType): void;
  onDeleteSelected(): void;
  hasSelection: boolean;
}

const toolOrder: { label: string; value: ToolType }[] = [
  { label: 'Select', value: 'select' },
  { label: 'BBox', value: 'bbox' },
  { label: 'Polygon', value: 'polygon' },
  { label: 'Rotated BBox', value: 'rotated' },
  { label: 'Area Clone', value: 'area' }
];

export function ToolPanel({ activeTool, onChange, onDeleteSelected, hasSelection }: ToolPanelProps) {
  return (
    <div className="tool-panel">
      <h3>Tools</h3>
      <div className="tool-buttons">
        {toolOrder.map((tool) => (
          <button
            key={tool.value}
            className={tool.value === activeTool ? 'tool-btn active' : 'tool-btn'}
            onClick={() => onChange(tool.value)}
            type="button"
          >
            {tool.label}
          </button>
        ))}
      </div>
      <button className="reset-btn" onClick={onDeleteSelected} type="button" disabled={!hasSelection}>
        Delete Selected
      </button>
    </div>
  );
}

export default ToolPanel;
