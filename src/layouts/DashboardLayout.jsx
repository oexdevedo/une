import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  ChartBarBig,
  Message,
  Users,
  Robot,
  Megaphone,
  Link as LinkIcon,
  Sliders,
  Search,
  Bell,
  Menu,
  Logout,
  Calendar,
  File,
  FileText,
  Mail,
  Notes
} from 'pixelarticons/react';

const navItems = [
  { path: '/', icon: ChartBarBig, label: 'Dashboard' },
  { path: '/mensagens', icon: Message, label: 'Mensagens' },
  { path: '/emails', icon: Mail, label: 'E-mails' },
  { path: '/tarefas', icon: Notes, label: 'Tarefas' },
  { path: '/contatos', icon: Users, label: 'Contatos' },
  { path: '/ia', icon: Robot, label: 'IA' },
  { path: '/contratos', icon: FileText, label: 'Contratos' },
  { path: '/automacao', icon: Robot, label: 'Automação' },
  { path: '/massa', icon: Megaphone, label: 'Msg em massa' },
  { path: '/templates', icon: File, label: 'Templates' },
  { path: '/agenda', icon: Calendar, label: 'Agenda' }
];

export default function DashboardLayout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('unne_user') || 'null');
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    fetch('http://localhost:3001/api/users/me')
      .then(r => r.json())
      .then(data => {
        if (data && data.name) {
          setCurrentUser(data);
          localStorage.setItem('unne_user', JSON.stringify(data));
        }
      })
      .catch(console.error);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('unne_user');
    window.location.href = '/login';
  };

  // Mapping paths to titles
  const getTitle = () => {
    const current = navItems.find(item => item.path === location.pathname);
    if (current) return current.label;
    if (location.pathname.startsWith('/configuracoes') || location.pathname === '/conexoes') return 'Configurações';
    return 'Unico';
  };

  return (
    <div className="app-container">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img 
              src="/logo.png" 
              alt="Unico Logo" 
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} 
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
              }} 
            />
            <div style={{ display: 'none', color: 'var(--primary)' }}>
              <Robot size={24} stroke="currentColor" fill="none" />
            </div>
          </div>
          <span style={{ fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.5px', marginLeft: '4px' }}>Unico</span>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              to={item.path} 
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom-actions">
          <Link 
            to="/configuracoes" 
            className={`nav-item ${location.pathname.startsWith('/configuracoes') || location.pathname === '/conexoes' ? 'active' : ''}`} 
            onClick={() => setIsSidebarOpen(false)}
            title="Configurações"
          >
             <Sliders size={18} />
             <span>Configurações</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="topbar-title">
              {getTitle()}
            </div>
          </div>
          
          <div className="topbar-right">
            <div className="search-bar">
              <Search size={16} color="var(--text-muted)" />
              <input type="text" placeholder="Buscar..." />
            </div>
            
            <Link to="/configuracoes?tab=conexoes" className="connection-pill" style={{ textDecoration: 'none' }} title="Conexão WhatsApp (Configurações)">
              <div className="connection-dot" style={{ backgroundColor: 'var(--whatsapp)' }}></div>
              <span style={{ color: 'var(--text-muted)' }}>WhatsApp</span>
            </Link>

            <Link to="/configuracoes?tab=conexoes" className="connection-pill" style={{ textDecoration: 'none' }} title="Conexão Telegram (Configurações)">
              <div className="connection-dot" style={{ backgroundColor: 'var(--whatsapp)' }}></div>
              <span style={{ color: 'var(--text-muted)' }}>Telegram</span>
            </Link>

            <Link to="/configuracoes?tab=conexoes" className="connection-pill" style={{ textDecoration: 'none' }} title="Conexão Hostinger (Configurações)">
              <div className="connection-dot" style={{ backgroundColor: '#10B981' }}></div>
              <span style={{ color: 'var(--text-muted)' }}>Hostinger</span>
            </Link>
            
            <button className="bell-btn" title="Notificações">
              <Bell size={18} />
              <div className="bell-badge">3</div>
            </button>

            <div className="topbar-user-badge">
              <Link to="/configuracoes" className="topbar-user-info" title="Configurações da conta">
                <div className="topbar-avatar">
                  {(currentUser?.name || currentUser?.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="topbar-user-details">
                  <span className="topbar-user-name">{currentUser?.name || 'Usuário'}</span>
                  <span className="topbar-user-handle">{currentUser?.username || '@admin'}</span>
                </div>
              </Link>
              <button 
                type="button"
                className="topbar-logout-btn" 
                onClick={handleLogout}
                title="Sair da conta"
              >
                <Logout size={16} />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Area */}
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
