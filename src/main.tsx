import { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("Main entry point loading...");

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RootErrorBoundary] Uncaught React Error:", error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name);
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const r of registrations) r.unregister();
        });
      }
    } catch (e) {
      console.warn("Storage reset error:", e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-200">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 font-black text-2xl border border-red-100">
              !
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">Display Recovery</h2>
            <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
              The application encountered a display rendering error. You can reload or reset stored local state to restore normal operation.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-red-50 rounded-xl text-left text-xs text-red-700 font-mono mb-6 break-words border border-red-200/80 max-h-36 overflow-y-auto">
                {this.state.error.message}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-[#013125] hover:bg-[#024a38] text-white rounded-xl font-bold text-sm transition-all cursor-pointer shadow-sm active:scale-95"
              >
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                Clear Cache & Hard Reset
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const isPreviewOrDev = typeof window !== 'undefined' && (
  window.self !== window.top ||
  window.location.hostname.includes('ais-dev') || 
  window.location.hostname.includes('ais-pre') || 
  window.location.hostname.includes('run.app') ||
  window.location.hostname.includes('localhost')
);

if ('serviceWorker' in navigator) {
  if (isPreviewOrDev) {
    // In development, AI Studio iframe, or Cloud Run preview, aggressively unregister any service worker so Vite and live previews are never hijacked or stuck
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
    if ('caches' in window) {
      caches.keys().then(names => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
  } else if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('SW registered:', registration);
        })
        .catch(error => console.log('SW registration failed:', error));
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);
