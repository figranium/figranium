import { Results } from '../../types';
import { SyntaxLanguage } from '../../utils/syntaxHighlight';

export const MAX_PREVIEW_CHARS = 60000;
export const MAX_PREVIEW_ITEMS = 200;
export const MAX_PREVIEW_KEYS = 200;
export const MAX_COPY_CHARS = 1000000;
export const MAX_COPY_ITEMS = 2000;
export const MAX_COPY_KEYS = 2000;
export const ResultsSkeleton = ({ animated }: { animated: boolean }) => {
    if (!animated) {
        return <div className="app-empty-state min-h-[240px]"><p className="text-sm theme-text-muted">Results will appear here</p></div>;
    }

    return (
        <div className="space-y-6" aria-label="Waiting for results" aria-busy="true">
            <div className="flex items-end justify-between border-b border-white/5 pb-4">
                <div className="space-y-3 w-2/3">
                    <div className="results-skeleton-line h-3 w-20 results-skeleton-shine" />
                    <div className="results-skeleton-line h-4 w-full results-skeleton-shine" />
                </div>
                <div className="results-skeleton-line h-6 w-6 rounded-full results-skeleton-shine" />
            </div>
            <div className="space-y-4">
                {[176, 148, 196].map((height, index) => (
                    <div key={index} className="results-skeleton-line w-full rounded-2xl results-skeleton-shine" style={{ height }} />
                ))}
            </div>
        </div>
    );
};

export const formatSize = (chars: number) => `${(chars / (1024 * 1024)).toFixed(2)} MB`;
export const normalizeBoolean = (value: any) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
    }
    return null;
};

export const clampText = (text: string, limit: number) => {
    if (text.length <= limit) return { text, truncated: false };
    return { text: text.slice(0, limit), truncated: true };
};

export const getResultsCopyPayload = (payload: Results | null) => {
    if (!payload || payload.data === undefined || payload.data === null) return { reason: 'No data to copy.' };
    return { raw: payload.data };
};

export const clampWithReason = (text: string, limit: number, reasons: string[]) => {
    if (text.length <= limit) return text;
    reasons.push(`first ${limit.toLocaleString()} chars`);
    return text.slice(0, limit);
};

export const getTruncatedCopyText = (raw: any) => {
    const reasons: string[] = [];
    if (typeof raw === 'string') {
        const text = clampWithReason(raw, MAX_COPY_CHARS, reasons);
        return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
    }
    if (Array.isArray(raw)) {
        let snapshot = raw;
        if (raw.length > MAX_COPY_ITEMS) {
            snapshot = raw.slice(0, MAX_COPY_ITEMS);
            reasons.push(`first ${MAX_COPY_ITEMS.toLocaleString()} items`);
        }
        let text = '';
        try {
            text = JSON.stringify(snapshot, null, 2);
        } catch {
            text = String(snapshot);
        }
        text = clampWithReason(text, MAX_COPY_CHARS, reasons);
        return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
    }
    if (raw && typeof raw === 'object') {
        let snapshot = raw;
        const keys = Object.keys(raw);
        if (keys.length > MAX_COPY_KEYS) {
            snapshot = keys.slice(0, MAX_COPY_KEYS).reduce<Record<string, any>>((acc, key) => {
                acc[key] = (raw as Record<string, any>)[key];
                return acc;
            }, {});
            reasons.push(`first ${MAX_COPY_KEYS.toLocaleString()} keys`);
        }
        let text = '';
        try {
            text = JSON.stringify(snapshot, null, 2);
        } catch {
            text = String(snapshot);
        }
        text = clampWithReason(text, MAX_COPY_CHARS, reasons);
        return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
    }
    const text = clampWithReason(String(raw), MAX_COPY_CHARS, reasons);
    return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
};

export const getFullCopyText = (raw: any) => {
    if (typeof raw === 'string') return raw;
    try {
        return JSON.stringify(raw, null, 2);
    } catch {
        return String(raw);
    }
};

export const getResultsPreview = (payload: Results | null): { text: string; truncated: boolean; language: SyntaxLanguage } => {
    if (!payload || payload.data === undefined || payload.data === null || payload.data === '') {
        return { text: '', truncated: false, language: 'plain' as const };
    }
    const raw = payload.data;
    if (typeof raw === 'string') {
        // ⚡ Bolt: Use a small sample (2000 chars) for language detection to avoid O(N) trim/includes on large strings.
        const sample = raw.slice(0, 2000).trim();
        const language: SyntaxLanguage = sample.startsWith('<') && sample.includes('>')
            ? 'html'
            : (sample.startsWith('{') || sample.startsWith('['))
                ? 'json'
                : 'plain';
        const clamped = clampText(raw, MAX_PREVIEW_CHARS);
        return { text: clamped.text, truncated: clamped.truncated, language };
    }
    if (Array.isArray(raw)) {
        const sliced = raw.length > MAX_PREVIEW_ITEMS ? raw.slice(0, MAX_PREVIEW_ITEMS) : raw;
        let text: string;
        try {
            text = JSON.stringify(sliced, null, 2);
        } catch {
            text = String(sliced);
        }
        const clamped = clampText(text, MAX_PREVIEW_CHARS);
        return { text: clamped.text, truncated: clamped.truncated || raw.length > MAX_PREVIEW_ITEMS, language: 'json' as const };
    }
    if (raw && typeof raw === 'object') {
        const keys = Object.keys(raw);
        let snapshot = raw;
        let truncated = false;
        if (keys.length > MAX_PREVIEW_KEYS) {
            truncated = true;
            snapshot = keys.slice(0, MAX_PREVIEW_KEYS).reduce<Record<string, any>>((acc, key) => {
                acc[key] = (raw as Record<string, any>)[key];
                return acc;
            }, {});
        }
        let text: string;
        try {
            text = JSON.stringify(snapshot, null, 2);
        } catch {
            text = String(snapshot);
        }
        const clamped = clampText(text, MAX_PREVIEW_CHARS);
        return { text: clamped.text, truncated: clamped.truncated || truncated, language: 'json' as const };
    }
    const clamped = clampText(String(raw), MAX_PREVIEW_CHARS);
    return { text: clamped.text, truncated: clamped.truncated, language: 'plain' as const };
};

export const parseCsvRows = (text: string, limit?: number) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(current);
                current = '';
            } else if (char === '\n') {
                row.push(current);
                rows.push(row);
                if (limit && rows.length >= limit) return rows;
                row = [];
                current = '';
            } else if (char === '\r') {
                // ignore CR
            } else {
                current += char;
            }
        }
    }
    row.push(current);
    if (row.length > 1 || row[0] !== '' || rows.length > 0) rows.push(row);
    return rows;
};

export const getTableData = (raw: any) => {
    if (!raw) return null;
    if (typeof raw === 'string') {
        // ⚡ Bolt: Fast-path skip for strings that look like JSON (starting with { or [).
        // Also use a small sample (2000 chars) for comma/newline checks to avoid O(N) scanning.
        const sample = raw.slice(0, 2000).trim();
        if (sample.startsWith('{') || sample.startsWith('[')) return null;
        if (!sample.includes(',') || !sample.includes('\n')) return null;

        const text = raw.trim();
        // ⚡ Bolt: Limit CSV parsing to MAX_PREVIEW_ITEMS + 1 (header) to avoid O(N) overhead on large files.
        const rows = parseCsvRows(text, MAX_PREVIEW_ITEMS + 1).filter((r) => r.some((cell) => String(cell || '').trim() !== ''));
        if (rows.length < 2) return null;
        const header = rows[0].map((cell, idx) => {
            const trimmed = String(cell || '').trim();
            return trimmed || `column_${idx + 1}`;
        });
        const body = rows.slice(1, MAX_PREVIEW_ITEMS + 1);
        if (header.length < 2) return null;
        return { headers: header, rows: body };
    }
    if (Array.isArray(raw)) {
        if (raw.length === 0) return null;
        // ⚡ Bolt: Limit type detection to MAX_PREVIEW_ITEMS to avoid O(N) overhead on large arrays.
        const sample = raw.slice(0, MAX_PREVIEW_ITEMS);
        if (sample.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
            const headers: string[] = [];
            const headerSet = new Set<string>();
            // ⚡ Bolt: Limit header discovery and row mapping to MAX_PREVIEW_ITEMS to ensure UI responsiveness.
            // Using a Set for header tracking improves lookup from O(H) to O(1).
            sample.forEach((item) => {
                Object.keys(item).forEach((key) => {
                    if (!headerSet.has(key)) {
                        headerSet.add(key);
                        headers.push(key);
                    }
                });
            });
            if (headers.length === 0) return null;
            const rows = sample.map((item) => headers.map((key) => item[key] ?? ''));
            return { headers, rows };
        }
        if (sample.every((item) => Array.isArray(item))) {
            // ⚡ Bolt: Limit array mapping to MAX_PREVIEW_ITEMS to ensure UI responsiveness.
            const maxCols = Math.max(...sample.map((item) => item.length));
            const headers = Array.from({ length: maxCols }, (_, idx) => `column_${idx + 1}`);
            return { headers, rows: sample };
        }
        return null;
    }
    if (raw && typeof raw === 'object') {
        const headers = Object.keys(raw);
        if (headers.length === 0) return null;
        return { headers, rows: [headers.map((key) => raw[key] ?? '')] };
    }
    return null;
};

export const getExportPayload = (raw: any, tableData: { headers: string[]; rows: any[][] } | null) => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') {
        if (tableData) {
            return { content: raw, mime: 'text/csv', ext: 'csv' };
        }
        return { content: raw, mime: 'application/json', ext: 'json' };
    }
    return { content: JSON.stringify(raw, null, 2), mime: 'application/json', ext: 'json' };
};

export const downloadText = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

