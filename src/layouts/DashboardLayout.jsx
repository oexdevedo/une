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
  { path: '/agenda', icon: Calendar, label: 'Agenda' },
  { path: '/conexoes', icon: LinkIcon, label: 'Conexões' }
];

export default function DashboardLayout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Mapping paths to titles
  const getTitle = () => {
    const current = navItems.find(item => item.path === location.pathname);
    if (current) return current.label;
    if (location.pathname === '/configuracoes') return 'Configurações';
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

        <div style={{ padding: '12px' }}>
          <Link to="/configuracoes" className={`nav-item ${location.pathname === '/configuracoes' ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
             <Sliders size={18} />
             <span>Configurações</span>
          </Link>
        </div>

        <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="user-avatar">
              W
            </div>
            <div className="user-info">
              <span className="user-name">Wyllkens</span>
              <span className="user-role">Admin</span>
            </div>
          </div>
          <button 
            className="logout-btn" 
            onClick={() => window.location.href = '/login'}
            title="Sair"
          >
            <Logout size={18} />
          </button>
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
            
            <div className="connection-pill">
              <div className="connection-dot" style={{ backgroundColor: 'var(--whatsapp)' }}></div>
              <span style={{ color: 'var(--text-muted)' }}>WhatsApp</span>
            </div>

            <div className="connection-pill">
              <div className="connection-dot" style={{ backgroundColor: 'var(--whatsapp)' }}></div>
              <span style={{ color: 'var(--text-muted)' }}>Telegram</span>
            </div>

            <div className="connection-pill">
              <div className="connection-dot" style={{ backgroundColor: '#10B981' }}></div>
              <span style={{ color: 'var(--text-muted)' }}>Hostinger</span>
            </div>
            
            <button className="bell-btn">
              <Bell size={18} />
              <div className="bell-badge">3</div>
            </button>
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
