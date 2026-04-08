import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { UpgradePage } from './pages/UpgradePage';
import { AiConsolePage } from './pages/AiConsolePage';
import { ReportsPage } from './pages/ReportsPage';
import { useSettingsStore } from './stores/settingsStore';

export const App: React.FC = () => {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/solutions" element={<Navigate to="/upgrade" replace />} />
        <Route path="/upgrade" element={<UpgradePage />} />
        <Route path="/ai-console" element={<AiConsolePage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};
