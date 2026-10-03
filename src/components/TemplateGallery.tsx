import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TablerIcon from './TablerIcon';

export interface MarketplaceTemplate {
    id: string;
    title: string;
    description?: string;
    author_name?: string;
    author_display_name?: string;
    display_name?: string;
    type?: string;
    icon?: string;
    downloads?: number;
    time_estimate?: string;
    category?: string;
    target_url?: string;
    action_count?: number;
    expected_output?: string;
    readme?: string;
    created_at?: string;
    updated_at?: string;
    author_avatar_url?: string;
    avatar_url?: string;
    profile_image_url?: string;
    author_verified?: boolean;
    verified?: boolean;
    configuration?: Record<string, any>;
}

export const TEMPLATE_CATEGORIES = [
    { value: 'all', label: 'All categories', icon: 'category' },
    { value: 'Developer Tools', label: 'Developer Tools', icon: 'terminal' },
    { value: 'Lead Gen', label: 'Lead Gen', icon: 'person_search' },
    { value: 'Monitoring', label: 'Monitoring', icon: 'progress_activity' },
    { value: 'Other', label: 'Other', icon: 'folders' },
    { value: 'QA Testing', label: 'QA Testing', icon: 'science' },
    { value: 'Shopping', label: 'Shopping', icon: 'inventory_2' },
    { value: 'Social Media', label: 'Social Media', icon: 'user_search' },
] as const;

const getHostname = (value?: string) => {
    if (!value) return '';
    try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
};
const categoryIcon = (category?: string) => TEMPLATE_CATEGORIES.find((item) => item.value === category)?.icon || 'category';
const creatorInitials = (name?: string) => (name || 'Community').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const creatorDisplayName = (template: MarketplaceTemplate) => template.author_display_name || template.display_name || (template.author_name?.toLowerCase() === 'figranium' ? 'Figranium' : template.author_name) || 'Community';
const isOfficialCreator = (template: MarketplaceTemplate) => template.author_name?.trim().toLowerCase() === 'figranium';
const creatorAvatarUrl = (template: MarketplaceTemplate) => template.author_avatar_url || template.avatar_url || template.profile_image_url || (isOfficialCreator(template) ? 'https://avatars.githubusercontent.com/u/260758094?s=64&v=4' : undefined);
const isVerifiedCreator = (template: MarketplaceTemplate) => template.author_verified ?? template.verified ?? isOfficialCreator(template);
const templateIconUrl = (icon?: string, target?: string) => {
    if (icon?.startsWith('data:image/')) return icon;
    const domain = getHostname(icon || target);
    return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : '';
};
const formatExpectedOutput = (value?: string) => {
    if (!value) return '';
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
};

const fetchTemplateDetail = async (id: string): Promise<MarketplaceTemplate> => {
    const response = await fetch(`/api/templates/${encodeURIComponent(id)}`, { credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.configuration) throw new Error(data?.error || 'Unable to load template details');
    return data;
};

export function TemplateSkeletonGrid({ count = 6, featured = false }: { count?: number; featured?: boolean }) {
    return <div className={`templates-grid ${featured ? 'templates-grid-featured' : ''}`} role="status" aria-label="Loading templates">
        {Array.from({ length: count }, (_, index) => <div className="template-card template-skeleton-card" key={index} aria-hidden="true">
            <div className="template-skeleton-line template-skeleton-shine template-skeleton-icon" />
            <div className="template-skeleton-line template-skeleton-shine template-skeleton-title" />
            <div className="template-skeleton-line template-skeleton-shine" />
            <div className="template-skeleton-line template-skeleton-shine template-skeleton-short" />
            <div className="template-skeleton-line template-skeleton-shine template-skeleton-meta" />
            <div className="template-skeleton-divider" />
            <div className="template-skeleton-line template-skeleton-shine template-skeleton-footer" />
        </div>)}
    </div>;
}

interface TemplateGalleryProps {
    templates: MarketplaceTemplate[];
    onImport: (template: MarketplaceTemplate) => Promise<void>;
    featured?: boolean;
}

export default function TemplateGallery({ templates, onImport, featured = false }: TemplateGalleryProps) {
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [preview, setPreview] = useState<MarketplaceTemplate | null>(null);
    const [previewError, setPreviewError] = useState('');
    const [importError, setImportError] = useState('');
    const [importingId, setImportingId] = useState<string | null>(null);
    const previewRequestId = useRef(0);

    const openPreview = async (template: MarketplaceTemplate) => {
        const requestId = ++previewRequestId.current;
        setPreviewId(template.id);
        setPreview(null);
        setPreviewError('');
        try {
            const details = await fetchTemplateDetail(template.id);
            if (previewRequestId.current === requestId) setPreview(details);
        } catch (error: any) {
            if (previewRequestId.current === requestId) setPreviewError(error?.message || 'Unable to load template details');
        }
    };

    const closePreview = () => {
        previewRequestId.current += 1;
        setPreviewId(null);
        setPreview(null);
        setPreviewError('');
    };

    const importTemplate = async (template: MarketplaceTemplate) => {
        setImportingId(template.id);
        setImportError('');
        try {
            const details = preview?.id === template.id ? preview : await fetchTemplateDetail(template.id);
            await onImport(details);
        } catch (error: any) {
            setImportError(error?.message || 'Unable to import template');
        } finally {
            setImportingId(null);
        }
    };

    return <>
        {importError ? <p className="template-gallery-error" role="alert">{importError}</p> : null}
        <div className={`templates-grid ${featured ? 'templates-grid-featured' : ''}`}>{templates.map((template) => {
            const hostname = getHostname(template.target_url || template.configuration?.url);
            const creatorName = creatorDisplayName(template);
            const avatarUrl = creatorAvatarUrl(template);
            const verified = isVerifiedCreator(template);
            const iconUrl = templateIconUrl(template.icon, template.target_url || template.configuration?.url);
            const actionCount = template.action_count ?? (Array.isArray(template.configuration?.actions) ? template.configuration.actions.length : 0);
            return <article key={template.id} className="template-card" role="button" tabIndex={0} aria-label={`Preview ${template.title}`} onClick={() => openPreview(template)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openPreview(template); } }}>
                <div className="flex items-start justify-between gap-3"><div className="template-site-icon">{iconUrl ? <img src={iconUrl} alt="" /> : <span>F</span>}</div><span className="template-category"><TablerIcon name={categoryIcon(template.category)} /> {template.category || 'Other'}</span></div>
                <h2>{template.title}</h2>
                <p className="template-description">{template.description || 'A community automation template.'}</p>
                <div className="template-meta"><span><TablerIcon name="public" /> {hostname || 'Web automation'}</span><span><TablerIcon name="format_list_numbered" /> {actionCount} steps</span></div>
                <div className="template-card-footer"><span className="template-creator">{avatarUrl ? <img src={avatarUrl} alt="" /> : <span className="template-creator-fallback">{creatorInitials(creatorName)}</span>}<span>{creatorName}</span><TablerIcon name={verified ? 'rosette_discount_check' : 'shield'} className={verified ? 'text-blue-500' : 'theme-text-faint'} /><span className="sr-only">{verified ? 'Verified creator' : 'Creator not verified'}</span></span><button type="button" onClick={(event) => { event.stopPropagation(); importTemplate(template); }} disabled={importingId === template.id} className="app-button-primary template-import-button">{importingId === template.id ? <TablerIcon name="progress_activity" className="animate-spin" /> : <TablerIcon name="download" />} Import</button></div>
            </article>;
        })}</div>

        {previewId ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={`${preview?.title || templates.find((item) => item.id === previewId)?.title || 'Template'} preview`}>
            <button className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closePreview} aria-label="Close template preview" />
            <section className="template-preview-modal custom-scrollbar">
                <header><div><h2>{preview?.title || templates.find((item) => item.id === previewId)?.title}</h2>{preview ? <span className="template-creator template-preview-creator">{creatorAvatarUrl(preview) ? <img src={creatorAvatarUrl(preview)} alt="" /> : <span className="template-creator-fallback">{creatorInitials(creatorDisplayName(preview))}</span>}<span>{creatorDisplayName(preview)}</span>{isVerifiedCreator(preview) ? <TablerIcon name="rosette_discount_check" className="text-blue-500" /> : null}<span className="sr-only">{isVerifiedCreator(preview) ? 'Verified creator' : 'Creator not verified'}</span></span> : null}</div></header>
                {previewError ? <div className="template-readme" role="alert"><p>{previewError}</p><button className="app-button-secondary" onClick={() => { const summary = templates.find((item) => item.id === previewId); if (summary) openPreview(summary); }}>Retry</button></div> : !preview ? <div className="template-readme"><div className="template-skeleton-line template-skeleton-shine template-skeleton-title" /><div className="template-skeleton-line template-skeleton-shine" /><div className="template-skeleton-line template-skeleton-shine template-skeleton-short" /></div> : <>
                    {preview.readme ? <section className="template-readme"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.readme}</ReactMarkdown></section> : <section className="template-readme"><p>{preview.description || 'No README is available for this template.'}</p></section>}
                    {preview.expected_output ? <section className="template-expected-output"><h3>Expected output</h3><pre>{formatExpectedOutput(preview.expected_output)}</pre></section> : null}
                </>}
                <footer><button className="app-button-secondary" onClick={closePreview}>Cancel</button><button className="app-button-primary" onClick={() => preview && importTemplate(preview)} disabled={!preview || importingId === previewId}>{importingId === previewId ? <TablerIcon name="progress_activity" className="animate-spin" /> : <TablerIcon name="download" />} Import</button></footer>
            </section>
        </div> : null}
    </>;
}
