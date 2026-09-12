// Canonical UI exports for Figranium Embed.
//
// Keep this file intentionally narrow. `figranium-embed` should depend on these
// exports rather than copying editor implementation or styles. That guarantees
// future Embed releases are built from the same source UI as Figranium itself.

export { default as ReadOnlyCanvas } from './ReadOnlyCanvas';
export type { ReadOnlyCanvasProps } from './ReadOnlyCanvas';
export { default as CanvasView } from '../components/editor/CanvasView';
export { default as ActionItem } from '../components/editor/ActionItem';
export { default as EditorTopBar } from '../components/editor/EditorTopBar';
export { default as StickyNote } from '../components/editor/StickyNote';
export { default as TablerIcon } from '../components/TablerIcon';
export { default as RichInput } from '../components/RichInput';
export { default as CodeEditor } from '../components/CodeEditor';
export { default as CustomSelect } from '../components/common/CustomSelect';

export * from '../types';
export * from '../components/editor/actionCatalog';
export * from '../components/editor/extractionOptions';
export * from '../utils/actionBlocks';
export * from '../utils/extractionScriptGen';
export * from '../utils/extractionFieldIds';
export * from '../utils/theme';
