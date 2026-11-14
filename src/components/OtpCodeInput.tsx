import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

interface OtpCodeInputProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    length?: number;
    disabled?: boolean;
    autoFocus?: boolean;
    onRecoveryPaste?: (text: string) => void;
}

export default function OtpCodeInput({
    id,
    value,
    onChange,
    length = 6,
    disabled = false,
    autoFocus = false,
    onRecoveryPaste,
}: OtpCodeInputProps) {
    const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
    const digits = Array.from({ length }, (_, idx) => value[idx] ?? '');

    const focusAt = (index: number) => {
        const target = inputRefs.current[Math.max(0, Math.min(length - 1, index))];
        target?.focus();
        target?.select();
    };

    const setDigitAt = (index: number, raw: string) => {
        const cleaned = raw.replace(/\D/g, '');
        if (!cleaned) {
            const next = [...digits];
            next[index] = '';
            onChange(next.join(''));
            return;
        }

        // Support multi-character input (e.g. OS/browser one-time-code autofill)
        if (cleaned.length > 1) {
            const next = cleaned.length >= length ? Array(length).fill('') : [...digits];
            const start = cleaned.length >= length ? 0 : index;
            for (let offset = 0; offset < cleaned.length && start + offset < length; offset += 1) {
                next[start + offset] = cleaned[offset];
            }
            onChange(next.join(''));
            focusAt(Math.min(length - 1, start + cleaned.length));
            return;
        }

        const next = [...digits];
        next[index] = cleaned;
        onChange(next.join(''));
        if (index < length - 1) {
            focusAt(index + 1);
        }
    };

    const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Backspace') {
            if (digits[index]) {
                event.preventDefault();
                const next = [...digits];
                next[index] = '';
                onChange(next.join(''));
                return;
            }
            if (index > 0) {
                event.preventDefault();
                const next = [...digits];
                next[index - 1] = '';
                onChange(next.join(''));
                focusAt(index - 1);
            }
            return;
        }
        if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault();
            focusAt(index - 1);
            return;
        }
        if (event.key === 'ArrowRight' && index < length - 1) {
            event.preventDefault();
            focusAt(index + 1);
        }
    };

    const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
        const text = event.clipboardData.getData('text').trim();
        if (!text) return;
        const cleaned = text.replace(/\D/g, '');
        if (onRecoveryPaste && /[a-z]/i.test(text)) {
            event.preventDefault();
            onRecoveryPaste(text);
            return;
        }
        if (!cleaned) {
            event.preventDefault();
            return;
        }
        event.preventDefault();
        const next = cleaned.length >= length ? Array(length).fill('') : [...digits];
        const start = cleaned.length >= length ? 0 : index;
        for (let offset = 0; offset < cleaned.length && start + offset < length; offset += 1) {
            next[start + offset] = cleaned[offset];
        }
        onChange(next.join(''));
        focusAt(Math.min(length - 1, start + cleaned.length));
    };

    return (
        <div className="flex items-center gap-2" role="group" aria-label="6-digit authentication code">
            {digits.map((digit, index) => (
                <input
                    key={index}
                    id={index === 0 ? id : undefined}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={length}
                    value={digit}
                    disabled={disabled}
                    autoFocus={autoFocus && index === 0}
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    spellCheck={false}
                    aria-label={`Digit ${index + 1} of ${length}`}
                    onChange={(event) => setDigitAt(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={(event) => handlePaste(index, event)}
                    onFocus={(event) => event.currentTarget.select()}
                    className="flex-1 min-w-0 max-w-[52px] h-12 theme-input border theme-border rounded-xl text-center font-mono text-lg font-semibold theme-text focus:outline-none focus:border-[var(--app-border-strong)] focus-visible:ring-2 focus-visible:ring-white/50 transition-all disabled:opacity-50"
                />
            ))}
        </div>
    );
}
