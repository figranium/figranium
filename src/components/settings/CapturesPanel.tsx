import { useMemo } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { CaptureEntry } from '../../types';
import { PanelShell, LoadingState, EmptyState } from '../common/ListState';

interface CapturesPanelProps {
    captures: CaptureEntry[];
    loading: boolean;
    onRefresh: () => void;
    onDelete: (name: string) => void;
}

const CAPTURE_ROW_HEIGHT = 72;
const CAPTURE_ROW_SPACING = 6;
const CAPTURE_ROW_ITEM_SIZE = CAPTURE_ROW_HEIGHT + CAPTURE_ROW_SPACING;
const CAPTURE_ROW_MAX_VISIBLE = 5;
const CAPTURE_ROW_OVERSCAN = 2;

interface CapturesPanelListData {
    captures: CaptureEntry[];
    onDelete: (name: string) => void;
}

const renderCaptureRow = ({ index, style, captures, onDelete }: RowComponentProps<CapturesPanelListData>) => {
    const capture = captures[index];
    if (!capture) return null;
    return (
        <div style={{ ...style, paddingBottom: CAPTURE_ROW_SPACING }}>
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="space-y-1">
                    <div className="text-xs font-bold text-white tracking-wide">
                        {capture.type === 'recording' ? 'Recording' : 'Screenshot'}
                    </div>
                    <div className="text-xs text-gray-500 tracking-wide">{capture.name}</div>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={capture.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl border border-white/10 text-xs font-bold tracking-wide text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label={`Open ${capture.name}`}
                        title={`Open ${capture.name}`}
                    >
                        Open
                    </a>
                    <button
                        type="button"
                        onClick={() => onDelete(capture.name)}
                        className="px-3 py-2 rounded-xl border border-red-500/20 text-xs font-bold tracking-wide text-red-300 hover:bg-red-500/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                        aria-label={`Delete ${capture.name}`}
                        title={`Delete ${capture.name}`}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

const CapturesPanel: React.FC<CapturesPanelProps> = ({ captures, loading, onRefresh, onDelete }) => {
    const listHeight = Math.min(
        Math.max(CAPTURE_ROW_ITEM_SIZE, captures.length * CAPTURE_ROW_ITEM_SIZE),
        CAPTURE_ROW_ITEM_SIZE * CAPTURE_ROW_MAX_VISIBLE
    );

    const itemData = useMemo(() => ({ captures, onDelete }), [captures, onDelete]);

    return (
        <PanelShell
            title="Captures"
            description="Recordings and screenshots"
            headerActions={(
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="px-4 py-2 border border-white/10 text-xs font-bold rounded-xl tracking-wide text-white/70 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Refresh captures list"
                    title="Refresh captures list"
                >
                    Refresh
                </button>
            )}
        >
            {loading && <LoadingState label="captures" />}
            {!loading && captures.length === 0 && <EmptyState label="captures" />}
            {!loading && captures.length > 0 && (
                <List
                    style={{ height: listHeight, width: '100%' }}
                    rowCount={captures.length}
                    rowHeight={CAPTURE_ROW_ITEM_SIZE}
                    overscanCount={CAPTURE_ROW_OVERSCAN}
                    rowProps={itemData}
                    rowComponent={renderCaptureRow}
                />
            )}
        </PanelShell>
    );
};

export default CapturesPanel;
