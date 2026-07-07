import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const NotificationContext = createContext();

export const useNotification = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
};

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  // Track active timeouts so we can clear them on unmount.
  const timeoutsRef = useRef(new Set());

  const addNotification = useCallback((title, message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, title, message, type }]);

    // Prefer the IPC channel for native Windows notifications - works whether
    // or not the renderer has Notification permission, and integrates with the
    // tray icon. `window.require` is not exposed under contextBridge sandboxing
    // (the previous code path was dead), so we go straight through window.api.
    if (window.api && typeof window.api.showNotification === 'function') {
      try {
        window.api.showNotification(title, message);
      } catch (e) {
        // Silently fall back to in-app toast below.
      }
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body: message }); } catch (_) {}
    }

    if (duration > 0) {
      const t = setTimeout(() => {
        timeoutsRef.current.delete(t);
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
      timeoutsRef.current.add(t);
    }
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Request permission on mount (only relevant in non-Electron contexts)
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    return () => {
      // Clear any pending timeouts to avoid setState-after-unmount warnings.
      for (const t of timeoutsRef.current) {
        try { clearTimeout(t); } catch (_) {}
      }
      timeoutsRef.current.clear();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification, removeNotification }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`glass-panel border rounded-xl p-4 shadow-lg animate-slide-up flex items-start gap-3 cursor-pointer ${
              notif.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/20' :
              notif.type === 'error' ? 'border-rose-500/30 bg-rose-950/20' :
              notif.type === 'warning' ? 'border-amber-500/30 bg-amber-950/20' :
              'border-brand-violet/30 bg-brand-violet/10'
            }`}
            onClick={() => removeNotification(notif.id)}
          >
            <div className="shrink-0 mt-0.5">
              {notif.type === 'success' && <span className="text-lg">✅</span>}
              {notif.type === 'error' && <span className="text-lg">❌</span>}
              {notif.type === 'warning' && <span className="text-lg">⚠️</span>}
              {notif.type === 'info' && <span className="text-lg">ℹ️</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-100">{notif.title}</p>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notif.message}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeNotification(notif.id); }}
              className="shrink-0 text-slate-500 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
