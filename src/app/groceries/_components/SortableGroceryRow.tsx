"use client";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';

/**
 * One draggable grocery row: drag handle on the left, checkbox + title in the
 * middle, delete on the right. The dragging-state styles (opacity + lift) come
 * from useSortable so the user gets clear feedback while moving an item.
 *
 * Only the GripVertical handle starts the drag — taps on the checkbox, label,
 * or delete button still behave normally.
 */
export default function SortableGroceryRow({
  id,
  title,
  isCompleted,
  onToggle,
  onDelete,
}: {
  id: string;
  title: string;
  isCompleted: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    background: isDragging ? 'var(--surface-hover)' : 'transparent',
    borderRadius: isDragging ? 8 : 0,
    padding: '8px 0',
    borderBottom: '1px solid var(--hairline)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    touchAction: 'manipulation',
  };

  return (
    <div ref={setNodeRef} style={style} className="checkbox-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          style={{
            padding: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'grab',
            color: 'var(--text-secondary)',
            display: 'inline-flex',
            alignItems: 'center',
            touchAction: 'none', // required for dnd-kit pointer/touch to capture drag
          }}
        >
          <GripVertical size={18} />
        </button>
        <input
          type="checkbox"
          className="checkbox-input"
          checked={isCompleted}
          onChange={onToggle}
        />
        <span className={`checkbox-label ${isCompleted ? 'completed' : ''}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Delete ${title}`}
        className="btn"
        style={{ padding: '4px 8px', background: 'transparent', color: 'var(--danger-color)', width: 'auto' }}
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
