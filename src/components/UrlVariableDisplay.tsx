import React from 'react';

const VARIABLE_TOKEN = /(\{\$[\w.^-]+\})/g;
const VARIABLE_TOKEN_ONLY = /^\{\$[\w.^-]+\}$/;
const VARIABLE_TOKEN_PRESENT = /\{\$[\w.^-]+\}/;

export const hasUrlVariables = (value?: string) => VARIABLE_TOKEN_PRESENT.test(value || '');

export const getUrlSummary = (value?: string) => {
    if (!value) return '';
    if (hasUrlVariables(value)) {
        try {
            const url = new URL(value);
            return `${url.hostname.replace(/^www\./, '')}${url.pathname}${url.search}${url.hash}`;
        } catch {
            return value;
        }
    }
    try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
};

interface UrlVariableDisplayProps {
    value?: string;
    className?: string;
    emptyLabel?: string;
}

/** Displays URL templates without resolving their variables. */
export default function UrlVariableDisplay({ value, className = '', emptyLabel = '' }: UrlVariableDisplayProps) {
    const text = value || emptyLabel;
    if (!text) return null;
    const parts = text.split(VARIABLE_TOKEN);
    return (
        <span className={`url-variable-display ${className}`} title={value || undefined}>
            {parts.map((part, index) => VARIABLE_TOKEN_ONLY.test(part)
                ? <span key={`${part}-${index}`} className="url-variable-token">{part}</span>
                : <React.Fragment key={index}>{part}</React.Fragment>)}
        </span>
    );
}
