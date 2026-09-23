import React, { useEffect, useRef } from 'react';

export const CANVAS_DOT_SPACING = 22;
export const CANVAS_DOT_RADIUS = 0.8;
export const CANVAS_DOT_MAX_RADIUS = 2.2;
export const CANVAS_DOT_INFLUENCE_RADIUS = 48;
export const CANVAS_SELECTION_DOT_RADIUS = 1.55;

export interface CanvasSelectionBox {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

interface CanvasDotGridProps {
    canvasOffset: { x: number; y: number };
    canvasScale: number;
    viewportRef: React.RefObject<HTMLDivElement>;
    selectionBox?: CanvasSelectionBox | null;
}

interface GridParameters {
    canvasOffset: { x: number; y: number };
    canvasScale: number;
    selectionBox?: CanvasSelectionBox | null;
}

interface PointerTarget {
    x: number;
    y: number;
    active: boolean;
}

interface AnimatedPointer {
    x: number;
    y: number;
    strength: number;
}

const TAU = Math.PI * 2;

/** Returns the first fixed grid-dot position at or beyond a viewport coordinate. */
export const getFirstCanvasDotPosition = (offset: number, spacing: number, minimum: number) => {
    const gridOrigin = offset + spacing / 2;
    return gridOrigin + Math.ceil((minimum - gridOrigin) / spacing) * spacing;
};

/** Maps cursor distance to a subtly enlarged, fixed-position dot radius. */
export const getCanvasDotRadius = (distance: number, strength = 1) => {
    if (distance >= CANVAS_DOT_INFLUENCE_RADIUS || strength <= 0) return CANVAS_DOT_RADIUS;
    const proximity = 1 - distance / CANVAS_DOT_INFLUENCE_RADIUS;
    const easedProximity = proximity * proximity * (3 - 2 * proximity);
    return CANVAS_DOT_RADIUS + (CANVAS_DOT_MAX_RADIUS - CANVAS_DOT_RADIUS) * easedProximity * strength;
};

/**
 * Keeps the inexpensive CSS dot grid as the base layer and paints only the
 * magnified rings near the pointer. This makes animation cost independent of
 * the size of the canvas viewport.
 */
const CanvasDotGrid: React.FC<CanvasDotGridProps> = ({ canvasOffset, canvasScale, viewportRef, selectionBox }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const parametersRef = useRef<GridParameters>({ canvasOffset, canvasScale });
    const targetPointerRef = useRef<PointerTarget>({ x: 0, y: 0, active: false });
    const animatedPointerRef = useRef<AnimatedPointer>({ x: 0, y: 0, strength: 0 });
    const frameRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number | null>(null);
    const scheduleDrawRef = useRef<() => void>(() => {});

    useEffect(() => {
        parametersRef.current = { canvasOffset, canvasScale, selectionBox };
        scheduleDrawRef.current();
    }, [canvasOffset, canvasScale, selectionBox]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const viewport = viewportRef.current;
        if (!canvas || !viewport) return;

        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let width = 0;
        let height = 0;
        let devicePixelRatio = 1;
        let dotColor = '';

        const clearCanvas = () => {
            const context = canvas.getContext('2d');
            if (!context) return;
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
        };

        const resizeCanvas = () => {
            const bounds = viewport.getBoundingClientRect();
            width = bounds.width;
            height = bounds.height;
            devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.round(width * devicePixelRatio));
            canvas.height = Math.max(1, Math.round(height * devicePixelRatio));
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
        };

        const updateDotColor = () => {
            dotColor = getComputedStyle(viewport).getPropertyValue('--app-dot').trim();
        };

        const draw = (timestamp: number) => {
            frameRef.current = null;
            const context = canvas.getContext('2d');
            if (!context) return;

            if (reducedMotionQuery.matches || !width || !height) {
                clearCanvas();
                lastFrameRef.current = timestamp;
                return;
            }

            const elapsed = Math.min(64, Math.max(0, timestamp - (lastFrameRef.current ?? timestamp)));
            lastFrameRef.current = timestamp;
            const target = targetPointerRef.current;
            const animated = animatedPointerRef.current;
            const positionProgress = 1 - Math.exp(-elapsed / 42);
            const strengthProgress = 1 - Math.exp(-elapsed / (target.active ? 40 : 45));

            if (target.active && animated.strength === 0) {
                animated.x = target.x;
                animated.y = target.y;
            } else {
                animated.x += (target.x - animated.x) * positionProgress;
                animated.y += (target.y - animated.y) * positionProgress;
            }
            animated.strength += ((target.active ? 1 : 0) - animated.strength) * strengthProgress;

            context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
            context.clearRect(0, 0, width, height);

            const { canvasOffset: offset, canvasScale: scale, selectionBox: activeSelection } = parametersRef.current;
            const spacing = CANVAS_DOT_SPACING * scale;

            const drawRing = (dotX: number, dotY: number, radius: number) => {
                context.beginPath();
                context.arc(dotX, dotY, radius, 0, TAU);
                context.arc(dotX, dotY, CANVAS_DOT_RADIUS, 0, TAU, true);
                context.fill('evenodd');
            };

            if (spacing > 0 && dotColor) {
                context.fillStyle = dotColor;

                if (activeSelection) {
                    const bounds = viewport.getBoundingClientRect();
                    const left = Math.max(0, Math.min(activeSelection.startX, activeSelection.currentX) - bounds.left);
                    const right = Math.min(width, Math.max(activeSelection.startX, activeSelection.currentX) - bounds.left);
                    const top = Math.max(0, Math.min(activeSelection.startY, activeSelection.currentY) - bounds.top);
                    const bottom = Math.min(height, Math.max(activeSelection.startY, activeSelection.currentY) - bounds.top);

                    if (right > left && bottom > top) {
                        const firstX = getFirstCanvasDotPosition(offset.x, spacing, left);
                        const firstY = getFirstCanvasDotPosition(offset.y, spacing, top);
                        for (let dotX = firstX; dotX <= right; dotX += spacing) {
                            for (let dotY = firstY; dotY <= bottom; dotY += spacing) {
                                drawRing(dotX, dotY, CANVAS_SELECTION_DOT_RADIUS);
                            }
                        }
                    }
                }

                if (animated.strength > 0.01) {
                    const minX = animated.x - CANVAS_DOT_INFLUENCE_RADIUS;
                    const maxX = animated.x + CANVAS_DOT_INFLUENCE_RADIUS;
                    const minY = animated.y - CANVAS_DOT_INFLUENCE_RADIUS;
                    const maxY = animated.y + CANVAS_DOT_INFLUENCE_RADIUS;
                    const firstX = getFirstCanvasDotPosition(offset.x, spacing, minX);
                    const firstY = getFirstCanvasDotPosition(offset.y, spacing, minY);

                    for (let dotX = firstX; dotX <= maxX; dotX += spacing) {
                        for (let dotY = firstY; dotY <= maxY; dotY += spacing) {
                            const distance = Math.hypot(dotX - animated.x, dotY - animated.y);
                            const radius = getCanvasDotRadius(distance, animated.strength);
                            if (radius <= CANVAS_DOT_RADIUS) continue;
                            // Paint only the additional ring, so the CSS base dot retains its normal opacity.
                            drawRing(dotX, dotY, radius);
                        }
                    }
                }
            }

            const pointerIsSettling = target.active
                ? Math.abs(target.x - animated.x) > 0.1 || Math.abs(target.y - animated.y) > 0.1 || animated.strength < 0.99
                : animated.strength > 0.01;
            if (pointerIsSettling) scheduleDrawRef.current();
        };

        const scheduleDraw = () => {
            if (frameRef.current === null) frameRef.current = window.requestAnimationFrame(draw);
        };
        scheduleDrawRef.current = scheduleDraw;

        const updatePointer = (event: PointerEvent) => {
            const bounds = viewport.getBoundingClientRect();
            const isInside = event.clientX >= bounds.left && event.clientX <= bounds.right
                && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
            targetPointerRef.current = {
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
                active: isInside,
            };
            scheduleDraw();
        };

        const hidePointer = () => {
            targetPointerRef.current.active = false;
            scheduleDraw();
        };

        const updateMotionPreference = () => {
            if (reducedMotionQuery.matches) {
                targetPointerRef.current.active = false;
                animatedPointerRef.current.strength = 0;
                clearCanvas();
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) hidePointer();
        };

        resizeCanvas();
        updateDotColor();
        const resizeObserver = new ResizeObserver(() => {
            resizeCanvas();
            updateDotColor();
            scheduleDraw();
        });
        const themeObserver = new MutationObserver(() => {
            updateDotColor();
            scheduleDraw();
        });
        resizeObserver.observe(viewport);
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme', 'style'],
        });
        window.addEventListener('pointermove', updatePointer, { passive: true });
        window.addEventListener('blur', hidePointer);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        reducedMotionQuery.addEventListener('change', updateMotionPreference);

        return () => {
            resizeObserver.disconnect();
            themeObserver.disconnect();
            window.removeEventListener('pointermove', updatePointer);
            window.removeEventListener('blur', hidePointer);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            reducedMotionQuery.removeEventListener('change', updateMotionPreference);
            if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
            scheduleDrawRef.current = () => {};
        };
    }, [viewportRef]);

    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" aria-hidden="true" />;
};

export default CanvasDotGrid;
