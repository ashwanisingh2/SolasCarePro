import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { NotificationProvider } from './context/NotificationContext';
import { SystemMetricsProvider } from './context/SystemMetricsContext';
import { ConfirmProvider } from './components/shared/ConfirmModal';
import { LicenseProvider } from './components/UpgradeModal';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <SystemMetricsProvider>
        <LicenseProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </LicenseProvider>
      </SystemMetricsProvider>
    </NotificationProvider>
  </React.StrictMode>,
);
