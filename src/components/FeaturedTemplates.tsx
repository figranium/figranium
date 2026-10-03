import { useEffect, useState } from 'react';
import TablerIcon from './TablerIcon';
import TemplateGallery, { TemplateSkeletonGrid, type MarketplaceTemplate } from './TemplateGallery';

interface FeaturedTemplatesProps {
    onImport: (template: MarketplaceTemplate) => Promise<void>;
    onStartFromScratch: () => void;
}

export default function FeaturedTemplates({ onImport, onStartFromScratch }: FeaturedTemplatesProps) {
    const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await fetch('/api/templates?limit=3&sort=popular', { credentials: 'include', signal: controller.signal });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !Array.isArray(data?.items)) throw new Error(data?.error || 'Unable to load templates');
                if (!controller.signal.aborted) setTemplates(data.items);
            } catch (loadError: any) {
                if (!controller.signal.aborted) setError(loadError?.message || 'Unable to load templates');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        load();
        return () => controller.abort();
    }, [retry]);

    return <div className="featured-templates">
        <div className="featured-templates-header">
            <h3 className="featured-templates-title">Start with a popular template</h3>
            <p className="featured-templates-subtitle">Choose a ready-made automation, or build your own.</p>
        </div>
        {loading ? <TemplateSkeletonGrid count={3} featured /> : null}
        {!loading && error ? <div className="featured-templates-message" role="alert"><span>{error.replace(/_/g, ' ')}</span><button className="app-button-secondary" onClick={() => setRetry((value) => value + 1)}><TablerIcon name="refresh" /> Retry</button></div> : null}
        {!loading && !error && templates.length ? <TemplateGallery templates={templates} onImport={onImport} featured /> : null}
        {!loading && !error && !templates.length ? <p className="featured-templates-message">No templates are available right now.</p> : null}
        <div className="featured-templates-actions"><button type="button" className="app-button-secondary" onClick={onStartFromScratch}><TablerIcon name="add" /> Create From Scratch</button></div>
    </div>;
}
