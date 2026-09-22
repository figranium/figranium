/**
 * Converts the old single-line "Getting started: 1. … 2. …" note format
 * into actual lines. Notes have always supported newlines; some early
 * templates simply saved their numbered instructions as one sentence.
 */
export function normalizeStickyNoteContent(content: string): string {
    let normalized = content.replace(/\r\n?/g, '\n');

    // A few exported notes contain escaped newlines rather than newline
    // characters. Make those behave the same as notes written in the editor.
    if (normalized.includes('\\n')) normalized = normalized.replace(/\\n/g, '\n');

    // Only reformat an unmistakable old-style numbered instruction list.
    // This deliberately leaves ordinary prose (including decimal numbers)
    // untouched.
    if (!normalized.includes('\n') && /(?:^|:\s*)1\.\s+[\s\S]*\s2\.\s+/.test(normalized)) {
        normalized = normalized.replace(/:\s+(?=1\.\s)/, ':\n');
        normalized = normalized.replace(/\s+(?=(?:[2-9]\d*)\.\s)/g, '\n');
    }

    return normalized;
}
