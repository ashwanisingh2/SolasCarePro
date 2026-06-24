import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { NotificationProvider } from './context/NotificationContext';
import { SystemMetricsProvider } from './context/SystemMetricsContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <SystemMetricsProvider>
        <App />
      </SystemMetricsProvider>
    </NotificationProvider>
  </React.StrictMode>,
);

