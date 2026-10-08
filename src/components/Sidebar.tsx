import React from 'react';
import TablerIcon from './TablerIcon';

interface SidebarProps {
    onNavigate: (screen: 'dashboard' | 'editor' | 'vault' | 'templates' | 'settings' | 'executions' | 'cabinets') => void;
    onNewTask: () => void;
    onLogout: () => void;
    currentScreen: 'dashboard' | 'editor' | 'vault' | 'templates' | 'settings' | 'executions' | 'cabinets';
}

const Sidebar: React.FC<SidebarProps> = ({ onNavigate, onNewTask, currentScreen }) => {
    const activeScreen = window.location.pathname.startsWith('/cabinets') ? 'cabinets' : currentScreen;

    return (
        <aside className="w-20 h-full border-r theme-border glass flex flex-col items-center py-8 shrink-0 z-50 theme-bg">
            <button
                onClick={() => onNavigate('dashboard')}
                className="mb-12 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
                aria-label="Go to Dashboard (Alt/Option + 1)"
                title="Go to Dashboard (Alt/Option + 1)"
            >
                <img src="/figranium_icon.svg" alt="Figranium Logo" className="w-10 h-10 theme-logo" style={{ color: 'var(--app-logo)' }} onError={(e) => { e.currentTarget.src = '/figranium_icon.svg' }} />
            </button>

            <div className="flex-1 flex flex-col gap-6">
                <button
                    onClick={onNewTask}
                    className="w-12 h-12 rounded-2xl cursor-pointer flex items-center justify-center border theme-border bg-[var(--app-border)] theme-text transition-all hover:bg-[var(--app-glass-card-hover)] hover:border-[var(--app-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="New Task (Alt/Option + N)"
                    aria-label="New Task (Alt/Option + N)"
                >
                    <TablerIcon name="add" className="text-2xl theme-text" />
                </button>

                {([
                    ['dashboard', 'home', 'Dashboard (Alt/Option + 1)'],
                    ['templates', 'sketching', 'Templates (Alt/Option + 2)'],
                    ['executions', 'history', 'Executions (Alt/Option + 3)'],
                    ['vault', 'vault', 'Vault'],
                    ['cabinets', 'folders', 'Cabinets (Alt/Option + 4)'],
                ] as const).map(([screen, icon, title]) => (
                    <button
                        key={screen}
                        data-testid={screen === 'dashboard' ? 'sidebar-dashboard' : undefined}
                        onClick={() => onNavigate(screen)}
                        className={`w-12 h-12 rounded-2xl cursor-pointer flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${activeScreen === screen ? 'theme-highlight' : 'theme-text-faint theme-hover'}`}
                        title={title}
                        aria-label={title}
                    >
                        <TablerIcon name={icon} className="text-2xl theme-text" />
                    </button>
                ))}
            </div>

            <button
                onClick={() => onNavigate('settings')}
                className={`w-12 h-12 rounded-2xl cursor-pointer flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${activeScreen === 'settings' ? 'theme-highlight' : 'theme-text-faint theme-hover'}`}
                title="Settings (Alt/Option + 5)"
                aria-label="Settings (Alt/Option + 5)"
            >
                <TablerIcon name="settings" className="text-2xl theme-text" />
            </button>
        </aside>
    );
};

export default React.memo(Sidebar);
