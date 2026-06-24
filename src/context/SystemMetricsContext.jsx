import React, { createContext, useContext, useState, useEffect } from 'react';

const SystemMetricsContext = createContext();

export const useSystemMetrics = () => useContext(SystemMetricsContext);

export function SystemMetricsProvider({ children }) {
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMetrics = async () => {
    try {
      if (window.api) {
        const metrics = await window.api.getSystemMetrics();
        setSystemMetrics(metrics);
      } else {
        // Fallback mock metrics for web testing
        setSystemMetrics({
          cpu: Math.floor(Math.random() * 25) + 10,
          ram: 54.2,
          disk: 38.6,
          netSpeed: Math.floor(Math.random() * 800000) + 150000
        });
      }
    } catch (e) {
      console.error('Failed to load system metrics in context:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 4000); // Polling every 4 seconds to be lightweight
    return () => clearInterval(interval);
  }, []);

  return (
    <SystemMetricsContext.Provider value={{ systemMetrics, loading, refresh: loadMetrics }}>
      {children}
    </SystemMetricsContext.Provider>
  );
}
