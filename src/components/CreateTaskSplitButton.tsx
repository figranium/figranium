import { useEffect, useRef, useState } from 'react';
import TablerIcon from './TablerIcon';

interface CreateTaskSplitButtonProps {
    onStartFromScratch: () => void;
    onCreateFromTemplate: () => void;
    compact?: boolean;
}

export default function CreateTaskSplitButton({ onStartFromScratch, onCreateFromTemplate, compact = false }: CreateTaskSplitButtonProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const firstOptionRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const closeOnOutsidePress = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutsidePress);
        document.addEventListener('keydown', closeOnEscape);
        requestAnimationFrame(() => firstOptionRef.current?.focus());
        return () => {
            document.removeEventListener('mousedown', closeOnOutsidePress);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    const choose = (action: () => void) => {
        setOpen(false);
        action();
    };

    return (
        <div ref={rootRef} className="create-task-split">
            <button onClick={onStartFromScratch} className="create-task-split-main shine-effect" title="Create new Task (Alt/Option + N)">
                <TablerIcon name="add" className="text-base" /> {compact ? 'Create' : 'Create Task'}
            </button>
            <button
                type="button"
                className="create-task-split-toggle"
                aria-label="More task creation options"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                onKeyDown={(event) => {
                    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <TablerIcon name="expand_more" className={`text-base transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open ? (
                <div className="create-task-split-menu" role="menu" aria-label="Create task options">
                    <button ref={firstOptionRef} type="button" role="menuitem" onClick={() => choose(onStartFromScratch)}>
                        <TablerIcon name="add" /> <span><strong>Start from scratch</strong><small>Open a blank task</small></span>
                    </button>
                    <button type="button" role="menuitem" onClick={() => choose(onCreateFromTemplate)}>
                        <TablerIcon name="shelves" /> <span><strong>Create from a template</strong><small>Browse community automations</small></span>
                    </button>
                </div>
            ) : null}
        </div>
    );
}
