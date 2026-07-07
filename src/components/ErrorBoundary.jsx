import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

// ErrorBoundary catches any uncaught render error in its child tree and
// shows a recoverable error UI instead of a blank white screen.
// Without this, a single broken component (e.g. unexpected null in a
// .map() call) would crash the entire app and require a restart.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console for dev visibility - not to the audit log because
    // this runs in the renderer process, which has no audit log access.
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Force a full reload to clear any corrupted state
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  handleReset = () => {
    // Just clear the error state without reloading - useful if the error
    // was transient (e.g. a one-off IPC failure during render).
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const isDev = !window.api; // In browser dev mode, show full stack.
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-brand-navy p-6">
          <div className="glass-panel border border-rose-500/40 bg-rose-950/10 rounded-2xl p-8 max-w-2xl w-full text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-rose-400" />
              </div>
            </div>
            <h1 className="text-xl font-black text-rose-300 mb-2">Component Error</h1>
            <p className="text-xs text-slate-400 mb-4">
              Something went wrong while rendering this view. You can reload the app or try again — your data is safe.
            </p>
            <div className="bg-slate-950/60 border border-brand-border rounded-lg p-3 mb-4 text-left">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Error</div>
              <div className="text-xs text-rose-300 font-mono break-words">
                {this.state.error?.message || String(this.state.error || 'Unknown error')}
              </div>
              {isDev && this.state.errorInfo?.componentStack && (
                <details className="mt-2">
                  <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">
                    Component stack (dev only)
                  </summary>
                  <pre className="text-[10px] text-slate-500 mt-1 whitespace-pre-wrap overflow-x-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
              >
                <Home className="h-4 w-4" /> Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" /> Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
