import React from 'react';
import { Navigate } from 'react-router-dom';

export interface DatabaseConfigStatus {
    configured: boolean;
    db_protocol: string;
    source: 'environment' | 'settings' | 'none';
    restartRequired: boolean;
}

interface DatabasePanelProps {
    config: DatabaseConfigStatus;
    loading: boolean;
    saving: boolean;
    onSave: (config: Record<string, string>) => Promise<void>;
}

const DatabasePanel: React.FC<DatabasePanelProps> = () => (
    <Navigate to="/settings/api-keys" replace />
);

export default DatabasePanel;
