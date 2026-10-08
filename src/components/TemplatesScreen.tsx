import { useEffect, useState } from 'react';
import TablerIcon from './TablerIcon';
import CustomSelect from './common/CustomSelect';
import TemplateGallery, { TEMPLATE_CATEGORIES, TemplateSkeletonGrid, type MarketplaceTemplate } from './TemplateGallery';

export type { MarketplaceTemplate } from './TemplateGallery';

interface TemplatesScreenProps {
    onImport: (template: MarketplaceTemplate) => Promise<void>;
}

const PAGE_SIZE = 8;

export default function TemplatesScreen({ onImport }: TemplatesScreenProps) {
    const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'name'>('popular');
    const [page, setPage] = useState(0);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => { setPage(0); setSearch(query.trim()); }, 250);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setError('');
            setTemplates([]);
            try {
                const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), sort: sortBy, category, search });
                const response = await fetch(`/api/templates?${params}`, { credentials: 'include', signal: controller.signal });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !Array.isArray(data?.items) || !Number.isInteger(data?.total)) throw new Error(data?.error || 'Unable to load templates');
                if (controller.signal.aborted) return;
                setTemplates(data.items.slice(0, PAGE_SIZE));
                setTotal(data.total);
            } catch (loadError: any) {
                if (!controller.signal.aborted) setError(loadError?.message || 'Unable to load templates');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        load();
        return () => controller.abort();
    }, [page, category, sortBy, search, retry]);

    return <main className="app-page custom-scrollbar animate-in fade-in duration-500">
        <div className="app-page-inner">
            <header className="app-page-header">
                <div>
                    <h1 className="app-page-title">Templates</h1>
                    <p className="app-page-subtitle">Ready-to-use community automations, imported into your workspace.</p>
                </div>
            </header>

            <section className="app-panel templates-catalog">
                <div className="templates-toolbar">
                    <label className="templates-search relative block">
                        <TablerIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base theme-text-faint" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates, sites, or use cases…" className="app-input-control w-full pl-9 pr-4" aria-label="Search templates" />
                    </label>
                    <CustomSelect value={category} onChange={(value) => { setCategory(value); setPage(0); }} ariaLabel="Filter template category" className="templates-filter-select" options={TEMPLATE_CATEGORIES} />
                    <CustomSelect value={sortBy} onChange={(value) => { setSortBy(value); setPage(0); }} ariaLabel="Sort templates" className="templates-sort-select" options={[{ value: 'popular', label: 'Most popular', icon: 'star' }, { value: 'newest', label: 'Newest', icon: 'history' }, { value: 'name', label: 'Name', icon: 'sort_by_alpha' }]} />
                </div>

                {loading ? <TemplateSkeletonGrid count={PAGE_SIZE} /> : null}
                {!loading && error && !templates.length ? <div className="app-empty-state"><div className="app-empty-icon"><TablerIcon name="error" className="text-2xl" /></div><div><h3 className="text-sm font-bold theme-text">Templates are unavailable</h3><p className="mt-2 text-xs theme-text-faint">{error.replace(/_/g, ' ')}</p></div><button onClick={() => setRetry((value) => value + 1)} className="app-button-secondary"><TablerIcon name="refresh" /> Retry</button></div> : null}
                {!loading && !error && !templates.length ? <div className="app-empty-state"><div className="app-empty-icon"><TablerIcon name="search_off" className="text-2xl" /></div><div><h3 className="text-sm font-bold theme-text">No matching templates</h3><p className="mt-2 text-xs theme-text-faint">Try a different search or category.</p></div>{query || category !== 'all' ? <button onClick={() => { setQuery(''); setSearch(''); setCategory('all'); setPage(0); }} className="app-button-secondary">Clear filters</button> : null}</div> : null}
                {templates.length ? <TemplateGallery templates={templates} onImport={onImport} /> : null}
                {error && templates.length ? <div className="templates-load-more"><span role="alert">{error.replace(/_/g, ' ')}</span><button onClick={() => setRetry((value) => value + 1)} className="app-button-secondary">Retry</button></div> : null}
                {!loading && !error && templates.length > 0 && total > PAGE_SIZE ? <nav className="templates-pagination" aria-label="Template pages">
                    <button type="button" className="app-button-secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>
                        <TablerIcon name="arrow_back" /> Previous
                    </button>
                    <span aria-live="polite">Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + templates.length} of {total}</span>
                    <button type="button" className="app-button-secondary" onClick={() => setPage((value) => value + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>
                        Next <TablerIcon name="arrow_back" className="rotate-180" />
                    </button>
                </nav> : null}
            </section>
        </div>
    </main>;
}
