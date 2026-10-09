const assert = require('node:assert/strict');
const { normalizeBaserowTables } = require('../src/server/baserow-table-list');

assert.deepEqual(normalizeBaserowTables({ results: [
    { id: 42, name: 'Results', database_id: 7, database_name: 'Leads' },
    { id: 43, name: 'Other', database_id: 7 },
    { id: 'bad', name: 'Invalid', database_id: 7 },
] }), [
    { id: '42', name: 'Results', databaseId: '7', databaseName: 'Leads' },
    { id: '43', name: 'Other', databaseId: '7', databaseName: 'Database 7' },
]);
assert.equal(
    normalizeBaserowTables([{ id: 42, name: 'Projects', database_id: 7 }], { fallbackDatabaseName: 'Lead output' })[0].databaseName,
    'Lead output'
);
console.log('Baserow token table listing normalized');
