import type { AnnotationGroup, AnnotationShape } from '../types/annotations';

interface GroupPanelProps {
  groups: AnnotationGroup[];
  activeGroupId: number | null;
  shapes: AnnotationShape[];
  onSelectGroup(id: number): void;
  onCreateGroup(): void;
  onRenameGroup(id: number, label: string): void;
  onDeleteGroup(id: number): void;
  onCopyGroup(): void;
  onPasteGroup(): void;
  canCopy: boolean;
  canPaste: boolean;
}

export function GroupPanel({
  groups,
  activeGroupId,
  shapes,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onCopyGroup,
  onPasteGroup,
  canCopy,
  canPaste
}: GroupPanelProps) {
  const shapeCounts = shapes.reduce<Record<number, number>>((acc, shape) => {
    acc[shape.groupId] = (acc[shape.groupId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="group-panel">
      <div className="group-panel__header">
        <h3>Objects</h3>
        <button type="button" className="new-group-btn" onClick={onCreateGroup}>
          + New Object
        </button>
      </div>
      <p className="group-panel__hint">Select an object to add new shapes to its group.</p>
      <div className="group-list">
        {groups.length === 0 && <p className="group-empty">No objects yet.</p>}
        {groups.map((group) => (
          <div
            key={group.id}
            className={
              group.id === activeGroupId ? 'group-card group-card--active' : 'group-card'
            }
            onClick={() => onSelectGroup(group.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectGroup(group.id);
              }
            }}
          >
            <div className="group-card__header">
              <input
                className="group-label-input"
                value={group.label}
                onChange={(event) => onRenameGroup(group.id, event.target.value)}
                onClick={(event) => event.stopPropagation()}
              />
              <button
                className="group-delete-btn"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteGroup(group.id);
                }}
              >
                ×
              </button>
            </div>
            <p className="group-meta">ID {group.id} · {shapeCounts[group.id] ?? 0} shapes</p>
          </div>
        ))}
      </div>
      <div className="group-panel__actions">
        <button
          className="group-action-btn"
          type="button"
          onClick={onCopyGroup}
          disabled={!canCopy}
        >
          Copy Group
        </button>
        <button
          className="group-action-btn"
          type="button"
          onClick={onPasteGroup}
          disabled={!canPaste}
        >
          Paste Group
        </button>
      </div>
    </div>
  );
}

export default GroupPanel;
