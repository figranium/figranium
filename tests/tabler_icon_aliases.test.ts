import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/TablerIcon.tsx'), 'utf8');

for (const alias of ['audio_file', 'settings_input_component', 'psychology', 'table']) {
    assert.match(source, new RegExp(`\\b${alias}:\\s*'Icon[A-Za-z0-9]+'`), `${alias} must resolve to a Tabler component`);
}

console.log('Tabler icon alias checks passed.');
