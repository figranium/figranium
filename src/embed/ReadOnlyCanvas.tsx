import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import CanvasView from '../components/editor/CanvasView';
import type { Task } from '../types';

export interface ReadOnlyCanvasProps {
  task: Task;
  className?: string;
}

const noop = () => {};
const TASK_WIDTH = 400;
const VIEWPORT_PADDING = 20;

/** Canonical immutable Figranium task canvas for embeds and previews. */
const ReadOnlyCanvas: React.FC<ReadOnlyCanvasProps> = ({ task, className = '' }) => {
  const canvasViewportRef = useRef<HTMLDivElement>(null!);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 20 });
  const panRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const center = () => {
      if (panRef.current) return;

      const notes = task.stickyNotes || [];
      const minX = Math.min(0, ...notes.map(note => note.x));
      const maxX = Math.max(TASK_WIDTH, ...notes.map(note => note.x + note.width));
      const contentWidth = maxX - minX;
      const availableWidth = Math.max(0, viewport.clientWidth - VIEWPORT_PADDING * 2);
      const x = contentWidth <= availableWidth
        ? (viewport.clientWidth - contentWidth) / 2 - minX
        : VIEWPORT_PADDING - minX;

      setCanvasOffset({ x, y: VIEWPORT_PADDING });
    };

    center();
    const observer = new ResizeObserver(center);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [task]);

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const lockStickyNotes = () => {
      viewport.querySelectorAll<HTMLElement>('[data-sticky-note-id]').forEach(note => {
        note.style.pointerEvents = 'none';
        note.setAttribute('inert', '');

        note.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(textarea => {
          textarea.readOnly = true;
          textarea.tabIndex = -1;
          if (document.activeElement === textarea) textarea.blur();
        });
      });
    };

    lockStickyNotes();
    const observer = new MutationObserver(lockStickyNotes);
    observer.observe(viewport, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [task]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      setCanvasOffset(previous => ({
        x: previous.x - event.deltaX,
        y: previous.y - event.deltaY,
      }));
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  const startPanning = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: canvasOffset.x,
      offsetY: canvasOffset.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePanning = (event: React.PointerEvent) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setCanvasOffset({
      x: pan.offsetX + event.clientX - pan.x,
      y: pan.offsetY + event.clientY - pan.y,
    });
  };

  const stopPanning = (event: React.PointerEvent) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      className={`figranium-readonly-canvas relative flex h-full w-full select-none cursor-grab active:cursor-grabbing ${className}`.trim()}
      aria-label="Read-only Figranium task canvas. Drag or scroll to pan."
      style={{ '--app-dot': 'rgba(255, 255, 255, 0.12)', touchAction: 'none' } as React.CSSProperties}
      onContextMenuCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={startPanning}
      onPointerMove={movePanning}
      onPointerUp={stopPanning}
      onPointerCancel={stopPanning}
    >
      <CanvasView
        currentTask={task}
        setCurrentTask={noop as (task: Task) => void}
        canvasOffset={canvasOffset}
        canvasScale={1}
        canvasViewportRef={canvasViewportRef}
        triggerExpanded={false}
        setTriggerExpanded={noop}
        onOpenCabinet={noop}
        handleAutoSave={noop}
        dragState={null}
        dragOverIndex={null}
        selectedActionIds={new Set()}
        setSelectedActionIds={noop as (ids: Set<string>) => void}
        actionStatusById={{}}
        availableTasks={[]}
        selectorOptionsById={{}}
        updateAction={noop as any}
        openActionPalette={noop as any}
        openContextMenu={noop as any}
        handleActionPointerDown={noop as any}
        onOpenHeadful={noop as any}
        isHeadfulOpen={false}
        onPointerDown={noop as any}
        onPointerMove={noop as any}
        onPointerUp={noop}
        onPointerCancel={noop}
        selectionBox={null}
        onAddStickyNote={noop as any}
        onUpdateStickyNote={noop as any}
        onDeleteStickyNote={noop as any}
        onDuplicateStickyNote={noop as any}
        selectedNoteIds={new Set()}
        autoOpenActionId={null}
        onClearAutoOpenActionId={noop}
      />
    </div>
  );
};

export default ReadOnlyCanvas;
