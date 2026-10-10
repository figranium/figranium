import React from 'react';

const VARIABLE_TOKEN = /(\{\$[\w.^-]+\})/g;
const VARIABLE_TOKEN_ONLY = /^\{\$[\w.^-]+\}$/;
const VARIABLE_TOKEN_PRESENT = /\{\$[\w.^-]+\}/;
const ENCODED_VARIABLE_TOKEN = /%7B(?:%24|\$)([\w.^-]+)%7D/gi;

/** Converts encoded URL-template variables to their readable, display-only form. */
export const normalizeUrlVariables = (value?: string) => (value || '').replace(ENCODED_VARIABLE_TOKEN, (_match, name: string) => `{$${name}}`);

export const hasUrlVariables = (value?: string) => VARIABLE_TOKEN_PRESENT.test(normalizeUrlVariables(value));

export const getUrlSummary = (value?: string) => {
    if (!value) return '';
    const normalizedValue = normalizeUrlVariables(value);
    if (hasUrlVariables(normalizedValue)) {
        const variables: string[] = [];
        const parseableValue = normalizedValue.replace(VARIABLE_TOKEN, (token) => {
            variables.push(token);
            return `figraniumvariable${variables.length - 1}token`;
        });
        const restoreVariables = (text: string) => text.replace(/figraniumvariable(\d+)token/g, (_match, index: string) => variables[Number(index)] || _match);
        try {
            const url = new URL(parseableValue);
            return restoreVariables(`${url.hostname.replace(/^www\./, '')}${url.pathname}${url.search}${url.hash}`);
        } catch {
            return normalizedValue;
        }
    }
    try { return new URL(normalizedValue).hostname.replace(/^www\./, ''); } catch { return normalizedValue; }
};

interface UrlVariableDisplayProps {
    value?: string;
    className?: string;
    emptyLabel?: string;
}

/** Displays URL templates without resolving their variables. */
export default function UrlVariableDisplay({ value, className = '', emptyLabel = '' }: UrlVariableDisplayProps) {
    const text = normalizeUrlVariables(value) || emptyLabel;
    if (!text) return null;
    const parts = text.split(VARIABLE_TOKEN);
    return (
        <span className={`url-variable-display ${className}`} title={text}>
            {parts.map((part, index) => VARIABLE_TOKEN_ONLY.test(part)
                ? <span key={`${part}-${index}`} className="url-variable-token">{part}</span>
                : <React.Fragment key={index}>{part}</React.Fragment>)}
        </span>
    );
}
