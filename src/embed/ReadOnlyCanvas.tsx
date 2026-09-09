import React, { useLayoutEffect, useRef, useState } from 'react';
import CanvasView from '../components/editor/CanvasView';
import type { Task } from '../types';

export interface ReadOnlyCanvasProps {
  task: Task;
  className?: string;
}

const noop = () => {};

/** Canonical inert Figranium task canvas for embeds and previews. */
const ReadOnlyCanvas: React.FC<ReadOnlyCanvasProps> = ({ task, className = '' }) => {
  const canvasViewportRef = useRef<HTMLDivElement>(null!);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 20 });

  useLayoutEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const center = () => {
      setCanvasOffset({ x: Math.max(20, (viewport.clientWidth - 400) / 2), y: 20 });
    };

    center();
    const observer = new ResizeObserver(center);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`relative flex h-full w-full pointer-events-none select-none [&_button]:hidden ${className}`.trim()}
      aria-hidden="true"
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
