import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Intercepta chamadas de API para produção (Hostinger) e injeta token JWT (SEC-01)
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  let finalUrl = url;
  if (typeof finalUrl === 'string' && finalUrl.includes('http://localhost:3001')) {
    const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3001');
    finalUrl = finalUrl.replace('http://localhost:3001', apiBase);
  }

  const token = localStorage.getItem('unne_token');
  const urlStr = typeof finalUrl === 'string' ? finalUrl : '';
  const isApi = urlStr.startsWith('/api/') || urlStr.includes('/api/');
  const isPublicAuth = urlStr.includes('/api/auth/login') ||
                       urlStr.includes('/api/auth/register') ||
                       urlStr.includes('/api/users/check-username');

  let finalOptions = { ...options };
  if (token && isApi && !isPublicAuth) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    finalOptions.headers = headers;
  }

  return originalFetch.call(this, finalUrl, finalOptions).then(response => {
    if (response.status === 401 && !isPublicAuth && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/login')) {
        localStorage.removeItem('unne_user');
        localStorage.removeItem('unne_token');
        window.location.href = '/login';
      }
    }
    return response;
  });
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', background: '#fee', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
          <pre>{this.state.info?.componentStack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
