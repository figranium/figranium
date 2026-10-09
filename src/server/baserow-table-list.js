function normalizeBaserowTables(data, options = {}) {
    const items = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
    const databaseIds = new Set(items.map(table => String(table.database_id)).filter(databaseId => /^\d+$/.test(databaseId)));
    const fallbackDatabaseName = databaseIds.size === 1 && options.fallbackDatabaseName
        ? String(options.fallbackDatabaseName).trim()
        : '';
    return items.filter(table => Number.isSafeInteger(Number(table.id)) && Number(table.id) > 0 && Number.isSafeInteger(Number(table.database_id)) && Number(table.database_id) > 0).map(table => ({
        id: String(table.id),
        name: String(table.name || `Table ${table.id}`),
        databaseId: String(table.database_id),
        databaseName: String(table.database_name || table.database?.name || fallbackDatabaseName || `Database ${table.database_id}`)
    }));
}

module.exports = { normalizeBaserowTables };
