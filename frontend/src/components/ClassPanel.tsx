import { FormEvent, useState } from 'react';

interface ClassPanelProps {
  classes: string[];
  activeClass: string;
  onSelectClass(label: string): void;
  onAddClass(label: string): void;
}

export function ClassPanel({ classes, activeClass, onSelectClass, onAddClass }: ClassPanelProps) {
  const [newClassName, setNewClassName] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newClassName.trim();
    if (!trimmed) return;
    onAddClass(trimmed);
    setNewClassName('');
  };

  return (
    <div className="class-panel">
      <h3>Classes</h3>
      <div className="class-buttons">
        {classes.map((label) => (
          <button
            key={label}
            type="button"
            className={label === activeClass ? 'class-btn active' : 'class-btn'}
            onClick={() => onSelectClass(label)}
          >
            {label}
          </button>
        ))}
      </div>
      <form className="class-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={newClassName}
          placeholder="Add class"
          onChange={(event) => setNewClassName(event.target.value)}
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

export default ClassPanel;
