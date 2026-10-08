/**
 * Baserow output provider — appends extracted data as rows to a Baserow table.
 *
 * Supports:
 *   - Object  → single row via POST /api/database/rows/table/{tableId}/
 *   - Array   → batch rows via POST /api/database/rows/table/{tableId}/batch/
 *
 * Uses user_field_names=true so task authors reference actual column names.
 */
const { fetchWithRedirectValidation } = require('../../../url-utils');

async function push(credential, output, data) {
    const { baseUrl, token } = credential.config;
    const { tableId } = output;

    if (!data || (typeof data !== 'object' && typeof data !== 'string')) {
        throw new Error('No data to push');
    }

    // Parse string data (JSON extraction results arrive as strings)
    let parsed = data;
    if (typeof data === 'string') {
        try {
            parsed = JSON.parse(data);
        } catch {
            throw new Error('Extracted data is not valid JSON — cannot push to Baserow');
        }
    }

    const headers = {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
    };

    if (output.dedicated) {
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        if (!rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw new Error('Dedicated Baserow outputs require JSON objects or arrays of objects');
        }
        const fieldsUrl = `${baseUrl}/api/database/fields/table/${tableId}/`;
        const fieldsResponse = await fetchWithRedirectValidation(fieldsUrl, { headers });
        if (!fieldsResponse.ok) throw new Error(`Unable to read Baserow fields (${fieldsResponse.status})`);
        const existing = new Set((await fieldsResponse.json()).map(field => field.name));
        for (const name of new Set(rows.flatMap(row => Object.keys(row)))) {
            if (existing.has(name)) continue;
            const response = await fetchWithRedirectValidation(fieldsUrl, {
                method: 'POST', headers, body: JSON.stringify({ name, type: 'long_text' })
            });
            if (!response.ok) throw new Error(`Unable to create Baserow field "${name}" (${response.status})`);
            existing.add(name);
        }
        parsed = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
            [key, value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)]
        )));
        if (!Array.isArray(data) && typeof data !== 'string') parsed = parsed[0];
        else if (typeof data === 'string' && !Array.isArray(JSON.parse(data))) parsed = parsed[0];
    }

    if (Array.isArray(parsed)) {
        // Batch insert
        const url = `${baseUrl}/api/database/rows/table/${tableId}/batch/?user_field_names=true`;
        const resp = await fetchWithRedirectValidation(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ items: parsed })
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`Baserow batch insert failed (${resp.status}): ${text}`);
        }
        return await resp.json();
    } else if (typeof parsed === 'object' && parsed !== null) {
        // Single row insert
        const url = `${baseUrl}/api/database/rows/table/${tableId}/?user_field_names=true`;
        const resp = await fetchWithRedirectValidation(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(parsed)
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`Baserow row insert failed (${resp.status}): ${text}`);
        }
        return await resp.json();
    } else {
        throw new Error('Extracted data must be a JSON object or array to push to Baserow');
    }
}

module.exports = { push };
