import assert from 'node:assert/strict';
import {
    CANVAS_DOT_INFLUENCE_RADIUS,
    CANVAS_DOT_MAX_RADIUS,
    CANVAS_DOT_RADIUS,
    CANVAS_SELECTION_DOT_RADIUS,
    getCanvasDotRadius,
    getFirstCanvasDotPosition,
} from '../src/components/editor/CanvasDotGrid';

assert.equal(getCanvasDotRadius(0), CANVAS_DOT_MAX_RADIUS, 'The closest dot should be largest');
assert.equal(getCanvasDotRadius(CANVAS_DOT_INFLUENCE_RADIUS), CANVAS_DOT_RADIUS, 'Dots at the field boundary should remain normal');
assert.equal(getCanvasDotRadius(CANVAS_DOT_INFLUENCE_RADIUS + 1), CANVAS_DOT_RADIUS, 'Dots outside the field should remain normal');
assert(getCanvasDotRadius(30) > getCanvasDotRadius(90), 'Dot growth should progressively fall off with distance');
assert.equal(getCanvasDotRadius(0, 0), CANVAS_DOT_RADIUS, 'Zero animation strength should preserve the base dot size');
assert(CANVAS_SELECTION_DOT_RADIUS > CANVAS_DOT_RADIUS && CANVAS_SELECTION_DOT_RADIUS < CANVAS_DOT_MAX_RADIUS,
    'Marquee-selected dots should be enlarged but remain subtler than the cursor focus');

assert.equal(getFirstCanvasDotPosition(0, 22, -120), -99, 'The base grid should be centered within each 22px cell');
assert.equal(getFirstCanvasDotPosition(44, 22, -120), -99, 'Exact-multiple panning must keep grid dots aligned');
assert.equal(getFirstCanvasDotPosition(13, 11, 0), 7.5, 'Scaled grid positions should retain their offset alignment');

console.log('Canvas dot grid tests passed');
