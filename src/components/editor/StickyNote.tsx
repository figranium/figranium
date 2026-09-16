import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote as StickyNoteType, StickyNoteColor } from '../../types';
import TablerIcon from '../TablerIcon';
import CopyButton from '../CopyButton';

interface StickyNoteProps {
    note: StickyNoteType;
    canvasScale: number;
    isSelected?: boolean;
    onUpdate: (id: string, updates: Partial<StickyNoteType>) => void;
    onDelete: (id: string) => void;
    onDuplicate: (note: StickyNoteType) => void;
}

const COLOR_STYLES: Record<StickyNoteColor, { bg: string; border: string; header: string }> = {
    default: {
        bg: 'var(--app-sticky-default-bg)',
        border: 'var(--app-sticky-default-border)',
        header: 'var(--app-sticky-default-header)',
    },
    yellow: {
        bg: 'rgba(250,204,21,0.14)',
        border: 'rgba(250,204,21,0.40)',
        header: 'rgba(250,204,21,0.20)',
    },
    pink: {
        bg: 'rgba(236,72,153,0.14)',
        border: 'rgba(236,72,153,0.40)',
        header: 'rgba(236,72,153,0.20)',
    },
    green: {
        bg: 'rgba(34,197,94,0.14)',
        border: 'rgba(34,197,94,0.40)',
        header: 'rgba(34,197,94,0.20)',
    },
    purple: {
        bg: 'rgba(168,85,247,0.14)',
        border: 'rgba(168,85,247,0.40)',
        header: 'rgba(168,85,247,0.20)',
    },
};

const COLOR_DOT: Record<StickyNoteColor, string> = {
    default: '#ffffff',
    yellow: '#facc15',
    pink: '#ec4899',
    green: '#22c55e',
    purple: '#a855f7',
};

const ALL_COLORS: StickyNoteColor[] = ['default', 'yellow', 'pink', 'green', 'purple'];

const StickyNote: React.FC<StickyNoteProps> = ({ note, canvasScale, isSelected, onUpdate, onDelete, onDuplicate }) => {
    const [isEditing, setIsEditing] = useState(note.content === '');
    const [draft, setDraft] = useState(note.content);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

    const colors = COLOR_STYLES[note.color] || COLOR_STYLES.default;

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditing]);

    const getDragPosition = useCallback((clientX: number, clientY: number) => {
        if (!dragRef.current) return null;
        const dx = (clientX - dragRef.current.startX) / canvasScale;
        const dy = (clientY - dragRef.current.startY) / canvasScale;
        return {
            x: Math.round(dragRef.current.origX + dx),
            y: Math.round(dragRef.current.origY + dy),
        };
    }, [canvasScale]);

    // Keep drag feedback local and persist only once at the end of the gesture.
    // Persisting every pointermove creates many concurrent saves whose responses can
    // arrive out of order and snap the note back to stale coordinates.
    const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: note.x,
            origY: note.y,
        };
        setDragPosition({ x: note.x, y: note.y });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, [note.x, note.y]);

    const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        const next = getDragPosition(e.clientX, e.clientY);
        if (next) setDragPosition(next);
    }, [getDragPosition]);

    const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        const next = getDragPosition(e.clientX, e.clientY) || dragPosition;
        dragRef.current = null;
        setDragPosition(null);
        if (next && (next.x !== note.x || next.y !== note.y)) {
            onUpdate(note.id, next);
        }
    }, [dragPosition, getDragPosition, note.id, note.x, note.y, onUpdate]);

    const commitEdit = useCallback(() => {
        onUpdate(note.id, { content: draft });
        setIsEditing(false);
    }, [note.id, draft, onUpdate]);

    const displayX = dragPosition?.x ?? note.x;
    const displayY = dragPosition?.y ?? note.y;
    const displayWidth = note.width;
    const displayHeight = note.height;

    return (
        <>
        <div
            data-sticky-note-id={note.id}
            className="absolute select-none group"
            style={{
                left: displayX,
                top: displayY,
                width: displayWidth,
                minHeight: displayHeight,
                zIndex: 5,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const padding = 8, menuW = 200, menuH = 164;
                const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - menuW - padding);
                const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - menuH - padding);
                setContextMenu({ x, y });
            }}
        >
            <div
                className="w-full min-h-full rounded-xl flex flex-col overflow-hidden"
                style={{
                    background: colors.bg,
                    border: `1px solid ${isSelected ? 'rgba(96,165,250,0.8)' : colors.border}`,
                    boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.4), var(--app-shadow-sticky)' : 'var(--app-shadow-sticky)',
                    color: 'var(--app-sticky-text)',
                }}
            >
                {/* Header / drag handle */}
                <div
                    className="flex items-center justify-between px-2.5 py-1.5 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                    style={{ background: colors.header }}
                    onPointerDown={handleDragPointerDown}
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerUp}
                    onPointerCancel={handleDragPointerUp}
                >
                    {/* Color swatches */}
                    <div className="flex items-center gap-1" style={{ opacity: isEditing ? 1 : 0, pointerEvents: isEditing ? 'auto' : 'none', transition: 'opacity 0.15s' }}>
                        {ALL_COLORS.map((c) => (
                            <button
                                key={c}
                                className="w-3 h-3 rounded-full transition-all hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                style={{
                                    background: COLOR_DOT[c],
                                    opacity: note.color === c ? 1 : 0.35,
                                    outline: note.color === c ? `1.5px solid ${COLOR_DOT[c]}` : 'none',
                                    outlineOffset: '1px',
                                }}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onUpdate(note.id, { color: c }); }}
                                title={`Set color to ${c}`}
                                aria-label={`Set color to ${c}`}
                            />
                        ))}
                    </div>

                    {/* Edit / copy / delete buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                        <button
                            className="sticky-note-control w-6 h-6 rounded flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); setDraft(note.content); }}
                            title="Edit note"
                            aria-label="Edit note"
                        >
                            <TablerIcon name="edit" className="text-[14px]" />
                        </button>
                        <CopyButton
                            text={note.content}
                            title="Copy note"
                            className="sticky-note-control w-6 h-6 rounded flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            iconClassName="text-[14px]"
                        />
                        <button
                            className="sticky-note-control w-6 h-6 rounded flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                            title="Delete note"
                            aria-label="Delete note"
                        >
                            <TablerIcon name="close" className="text-[14px]" />
                        </button>
                    </div>
                </div>

                {/* Content area */}
                <div
                    className="flex-1 min-h-0 custom-scrollbar"
                    onDoubleClick={() => { if (!isEditing) { setIsEditing(true); setDraft(note.content); } }}
                >
                    {isEditing ? (
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') commitEdit();
                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitEdit();
                                e.stopPropagation();
                            }}
                            className="sticky-note-textarea w-full min-h-[120px] resize-none bg-transparent px-3 py-2 text-xs focus:outline-none font-mono leading-relaxed"
                            style={{ color: 'var(--app-sticky-text)' }}
                            placeholder="Write markdown here..."
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div
                            className="px-3 py-2 text-xs leading-relaxed cursor-text custom-scrollbar font-mono whitespace-pre-wrap"
                            style={{ color: 'var(--app-sticky-text-muted)' }}
                        >
                            {note.content || <span style={{ color: 'var(--app-sticky-text-faint)' }} className="italic">Double-click to edit...</span>}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {contextMenu && createPortal(
            <>
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                />
                <div
                    className="fixed z-50 w-[200px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-xs font-bold tracking-widest text-white/80"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5"
                        onClick={() => { onDuplicate(note); setContextMenu(null); }}
                    >
                        <TablerIcon name="copy_all" className="text-[14px] text-white/40" />
                        Duplicate
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5"
                        onClick={() => {
                            navigator.clipboard.writeText(note.content).catch(() => {});
                            setContextMenu(null);
                        }}
                    >
                        <TablerIcon name="content_copy" className="text-[14px] text-white/40" />
                        Copy
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5"
                        onClick={() => {
                            navigator.clipboard.writeText(note.content).catch(() => {});
                            onDelete(note.id);
                            setContextMenu(null);
                        }}
                    >
                        <TablerIcon name="content_cut" className="text-[14px] text-white/40" />
                        Cut
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-red-400 flex items-center gap-2.5"
                        onClick={() => { onDelete(note.id); setContextMenu(null); }}
                    >
                        <TablerIcon name="delete" className="text-[14px] text-red-400/70" />
                        Delete
                    </button>
                </div>
            </>,
            document.body
        )}
        </>
    );
};

export default StickyNote;
