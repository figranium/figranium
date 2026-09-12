import assert from 'node:assert/strict';
import { ACTION_CATALOG, EDITOR_ACTION_CATALOG, EDITOR_AUTOMATIC_ACTION_TYPES } from '../src/components/editor/actionCatalog';

const allTypes = new Set(ACTION_CATALOG.map((item) => item.type));
const editorTypes = new Set(EDITOR_ACTION_CATALOG.map((item) => item.type));

assert.ok(allTypes.has('else'), 'Else must remain part of the full action catalog for API/MCP tasks');
assert.ok(allTypes.has('end'), 'End must remain part of the full action catalog for API/MCP tasks');
assert.ok(EDITOR_AUTOMATIC_ACTION_TYPES.has('else'));
assert.ok(EDITOR_AUTOMATIC_ACTION_TYPES.has('end'));
assert.ok(!editorTypes.has('else'), 'Else must not be user-addable in the visual editor');
assert.ok(!editorTypes.has('end'), 'End must not be user-addable in the visual editor');

console.log('Editor action catalog checks passed.');
