import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import {
  Message,
  Users,
  Robot,
  Notes,
  FileText,
  Mail,
  Send,
  Inbox,
  Calendar,
  Check,
  CheckDouble,
  Clock,
  Megaphone,
  Plus,
  Refresh,
  ArrowRight,
  ChevronRight,
  Sliders,
  Sparkles,
  Zap,
  UserPlus
} from 'pixelarticons/react';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('unne_user') || 'null');
    } catch {
      return null;
    }
  });

  const fetchSummary = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard/summary?workspace_id=1');
      const data = await res.json();
      if (data && data.success) {
        setSummary(data);
      }
    } catch (err) {
      console.error('Erro ao buscar dados do dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(() => fetchSummary(), 30000); // auto-refresh a cada 30s
    return () => clearInterval(interval);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    try {
      // Pode ser timestamp numérico (ms ou s) ou string ISO
      const num = Number(ts);
      const date = !isNaN(num) ? new Date(num > 10000000000 ? num : num * 1000) : new Date(ts);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const cleanPhone = (jid) => {
    if (!jid) return 'Desconhecido';
    return jid.replace('@s.whatsapp.net', '').replace('@telegram', '').replace('@lid', '');
  };

  if (loading && !summary) {
    return (
      <div className="dashboard-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: 'var(--text-muted)', gap: '12px' }}>
          <Refresh size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Carregando resumo em tempo real do sistema...</span>
        </div>
      </div>
    );
  }

  const s = summary || {};
  const messages = s.messages || { total: 0, sent: 0, received: 0, active_chats: 0, recent: [] };
  const contacts = s.contacts || { total: 0, new: 0, qualified: 0, lists_total: 0 };
  const agents = s.agents || { total: 0, list: [] };
  const tasks = s.tasks || { total: 0, todo: 0, in_progress: 0, review: 0, done: 0, notes_total: 0, recent: [] };
  const contracts = s.contracts || { total: 0, draft: 0, active: 0, completed: 0, recent: [] };
  const emails = s.emails || { total: 0, unread: 0, ai_replied: 0, accounts: [], recent: [] };
  const calendar = s.calendar || { total: 0, upcoming: [] };
  const connections = s.connections || { whatsapp: 'disconnected', telegram: 'disconnected', email: 'disconnected', ai_provider: 'openai', ai_model: '' };

  const isWaConnected = connections.whatsapp === 'connected';
  const isTgConnected = connections.telegram === 'connected';
  const isEmailConnected = connections.email === 'connected';

  return (
    <div className="dashboard-container">
      {/* 1. Welcome Hero Banner */}
      <div className="dashboard-welcome-hero">
        <div className="hero-left">
          <h1>
            <span>{getGreeting()},</span>
            <span className="highlight-name">{currentUser?.name || 'Administrador'}</span>!
          </h1>
          <p className="hero-subtitle">
            Aqui está a visão geral e resumo em tempo real de todas as operações do seu sistema.
          </p>
        </div>
        <div className="hero-actions">
          <button 
            type="button" 
            className="hero-btn hero-btn-outline" 
            onClick={() => fetchSummary(true)} 
            title="Atualizar dados agora"
            disabled={refreshing}
          >
            <Refresh size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{refreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
          <Link to="/mensagens" className="hero-btn hero-btn-primary">
            <Message size={16} />
            <span>Abrir Chat</span>
          </Link>
        </div>
      </div>

      {/* 2. System Status Strip */}
      <div className="system-status-strip">
        <div className="status-strip-title">
          <Zap size={16} style={{ color: 'var(--primary)' }} />
          <span>Status das Conexões:</span>
        </div>
        <div className="status-strip-channels">
          <Link to="/configuracoes?tab=conexoes" className={`channel-pill ${isWaConnected ? 'connected' : 'disconnected'}`}>
            <span className={`pulse-dot ${isWaConnected ? 'online' : 'offline'}`}></span>
            <span>WhatsApp: {isWaConnected ? 'Conectado' : 'Desconectado'}</span>
          </Link>
          <Link to="/configuracoes?tab=conexoes" className={`channel-pill ${isTgConnected ? 'connected' : 'disconnected'}`}>
            <span className={`pulse-dot ${isTgConnected ? 'online' : 'offline'}`}></span>
            <span>Telegram: {isTgConnected ? 'Ativo' : 'Inativo'}</span>
          </Link>
          <Link to="/configuracoes?tab=conexoes" className={`channel-pill ${isEmailConnected ? 'connected' : 'disconnected'}`}>
            <span className={`pulse-dot ${isEmailConnected ? 'online' : 'offline'}`}></span>
            <span>Hostinger E-mail: {isEmailConnected ? 'Conectado' : 'Pendente'}</span>
          </Link>
          <Link to="/ia" className="channel-pill connected">
            <Sparkles size={14} style={{ color: '#D97706' }} />
            <span>IA: {connections.ai_provider?.toUpperCase()} ({agents.total} agentes)</span>
          </Link>
        </div>
      </div>

      {/* 3. Real KPI Cards Row (6 Principais Módulos) */}
      <div className="dashboard-kpi-grid">
        {/* KPI 1: Conversas */}
        <Link to="/mensagens" className="dash-kpi-card" title="Ver mensagens">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Conversas</span>
            <div className="dash-kpi-icon yellow">
              <Message size={18} />
            </div>
          </div>
          <div className="dash-kpi-value">{messages.active_chats}</div>
          <div className="dash-kpi-sub">
            <span>{messages.total} msgs</span>
            <span>•</span>
            <span>{messages.sent} env / {messages.received} rec</span>
          </div>
        </Link>

        {/* KPI 2: Contatos */}
        <Link to="/contatos" className="dash-kpi-card" title="Ver contatos">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Contatos</span>
            <div className="dash-kpi-icon blue">
              <Users size={18} />
            </div>
          </div>
          <div className="dash-kpi-value">{contacts.total}</div>
          <div className="dash-kpi-sub">
            <span>{contacts.new} novos</span>
            <span>•</span>
            <span>{contacts.lists_total} listas</span>
          </div>
        </Link>

        {/* KPI 3: Agentes IA */}
        <Link to="/ia" className="dash-kpi-card" title="Ver agentes">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Agentes de IA</span>
            <div className="dash-kpi-icon green">
              <Robot size={18} />
            </div>
          </div>
          <div className="dash-kpi-value">{agents.total}</div>
          <div className="dash-kpi-sub">
            <span>Atendimento 24/7 ativo</span>
          </div>
        </Link>

        {/* KPI 4: Tarefas Kanban */}
        <Link to="/tarefas" className="dash-kpi-card" title="Ver tarefas">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Tarefas & Projetos</span>
            <div className="dash-kpi-icon purple">
              <Notes size={18} />
            </div>
          </div>
          <div className="dash-kpi-value">{tasks.total}</div>
          <div className="dash-kpi-sub">
            <span>{tasks.in_progress} em progresso</span>
            <span>•</span>
            <span>{tasks.done} concluídas</span>
          </div>
        </Link>

        {/* KPI 5: Contratos */}
        <Link to="/contratos" className="dash-kpi-card" title="Ver contratos">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">Contratos</span>
            <div className="dash-kpi-icon orange">
              <FileText size={18} />
            </div>
          </div>
          <div className="dash-kpi-value">{contracts.total}</div>
          <div className="dash-kpi-sub">
            <span>{contracts.completed} assinados</span>
            <span>•</span>
            <span>{contracts.active} ativos</span>
          </div>
        </Link>

        {/* KPI 6: E-mails */}
        <Link to="/emails" className="dash-kpi-card" title="Ver e-mails">
          <div className="dash-kpi-header">
            <span className="dash-kpi-label">E-mails</span>
            <div className="dash-kpi-icon rose">
              <Mail size={18} />
            </div>
          </div>
          <div className="dash-kpi-value">{emails.total}</div>
          <div className="dash-kpi-sub">
            <span style={{ color: emails.unread > 0 ? '#DC2626' : 'inherit', fontWeight: emails.unread > 0 ? 600 : 'normal' }}>
              {emails.unread} não lidos
            </span>
            <span>•</span>
            <span>{emails.ai_replied} por IA</span>
          </div>
        </Link>
      </div>

      {/* 4. Main Two Column Section */}
      <div className="dashboard-sections-grid">
        {/* Coluna Esquerda: Principais Fluxos Operacionais */}
        <div className="dash-left-col">
          {/* Painel: Atendimento & Conversas Recentes */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <Message size={18} style={{ color: 'var(--whatsapp)' }} />
                <span>Últimas Conversas (WhatsApp & Telegram)</span>
              </div>
              <Link to="/mensagens" className="dash-panel-action">
                <span>Ver todas</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {messages.recent && messages.recent.length > 0 ? (
              <div className="recent-chats-list">
                {messages.recent.map((msg, idx) => (
                  <Link to="/mensagens" key={idx} className="recent-chat-item">
                    <div className="chat-item-left">
                      <div className="chat-avatar-circle">
                        {(msg.push_name || cleanPhone(msg.remote_jid)).charAt(0).toUpperCase()}
                      </div>
                      <div className="chat-info-texts">
                        <div className="chat-name-row">
                          <span>{msg.push_name || cleanPhone(msg.remote_jid)}</span>
                          {msg.from_me ? (
                            <span style={{ fontSize: '0.65rem', color: '#10B981', background: '#ECFDF5', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              Enviada
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.65rem', color: '#0284C7', background: '#E0F2FE', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              Recebida
                            </span>
                          )}
                        </div>
                        <div className="chat-preview-text">
                          {msg.text || (msg.type ? `[Arquivo: ${msg.type}]` : 'Mensagem sem texto')}
                        </div>
                      </div>
                    </div>
                    <div className="chat-item-right">
                      <span className="chat-time-tag">{formatTimestamp(msg.timestamp)}</span>
                      <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <Message size={28} />
                <p>Nenhuma mensagem recebida ou enviada ainda.</p>
                <Link to="/mensagens" className="hero-btn hero-btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                  Iniciar primeiro atendimento
                </Link>
              </div>
            )}
          </div>

          {/* Painel: Tarefas & Kanban */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <Notes size={18} style={{ color: '#7C3AED' }} />
                <span>Projetos & Tarefas do Kanban</span>
              </div>
              <Link to="/tarefas" className="dash-panel-action">
                <span>Ver quadro</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {tasks.recent && tasks.recent.length > 0 ? (
              <div className="kanban-summary-grid">
                {tasks.recent.map((task) => (
                  <Link to="/tarefas" key={task.id} className="kanban-quick-card">
                    <div className="kanban-card-top">
                      <span className={`status-badge ${task.status}`}>
                        {task.status === 'todo' && 'A Fazer'}
                        {task.status === 'in_progress' && 'Em Progresso'}
                        {task.status === 'review' && 'Em Revisão'}
                        {task.status === 'done' && 'Concluído'}
                      </span>
                      <span className={`priority-pill ${task.priority || 'medium'}`}>
                        {task.priority || 'Média'}
                      </span>
                    </div>
                    <div className="kanban-card-title">{task.title}</div>
                    <div className="kanban-card-footer">
                      <span>{task.tag || 'Geral'}</span>
                      {task.due_date && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <Notes size={28} />
                <p>Nenhuma tarefa criada no Kanban ainda.</p>
                <Link to="/tarefas" className="hero-btn hero-btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                  Criar primeira tarefa
                </Link>
              </div>
            )}
          </div>

          {/* Painel: Contratos Recentes */}
          <div className="dash-panel" style={{ marginBottom: 0 }}>
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <FileText size={18} style={{ color: '#EA580C' }} />
                <span>Contratos & Documentos</span>
              </div>
              <Link to="/contratos" className="dash-panel-action">
                <span>Ver contratos</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {contracts.recent && contracts.recent.length > 0 ? (
              <table className="contracts-table-compact">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Modelo</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.recent.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.client_name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.client_phone || 'Sem telefone'}</div>
                      </td>
                      <td>{c.template_title || 'Contrato Padrão'}</td>
                      <td>
                        <span className={`status-badge ${c.status === 'completed' ? 'done' : c.status === 'active' ? 'in_progress' : 'todo'}`}>
                          {c.status === 'completed' ? 'Assinado' : c.status === 'active' ? 'Em coleta' : 'Rascunho'}
                        </span>
                      </td>
                      <td>
                        <Link to="/contratos" style={{ color: 'var(--primary-hover)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          <span>Abrir</span>
                          <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="dash-empty-state">
                <FileText size={28} />
                <p>Nenhum contrato gerado ainda.</p>
                <Link to="/contratos" className="hero-btn hero-btn-primary" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                  Gerar novo contrato
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: IA, Agenda, E-mails e Atalhos */}
        <div className="dash-right-col">
          {/* Card: Agentes de IA */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <Robot size={18} style={{ color: '#16A34A' }} />
                <span>Agentes de IA Ativos</span>
              </div>
              <Link to="/ia" className="dash-panel-action">
                <span>Gerenciar</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {agents.list && agents.list.length > 0 ? (
              <div className="agents-mini-list">
                {agents.list.map((agent) => (
                  <div key={agent.id} className="agent-mini-card">
                    <div className="agent-mini-avatar">
                      {agent.icon?.startsWith('/') || agent.icon?.startsWith('http') ? (
                        <img src={agent.icon} alt={agent.name} onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : (
                        <span>{agent.icon || '🤖'}</span>
                      )}
                    </div>
                    <div className="agent-mini-info">
                      <div className="agent-mini-name">{agent.name}</div>
                      <div className="agent-mini-role">{agent.role || 'Assistente Virtual'}</div>
                    </div>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} title="Operando"></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <Robot size={24} />
                <p>Nenhum agente configurado.</p>
              </div>
            )}
          </div>

          {/* Card: Próximos Compromissos na Agenda */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <Calendar size={18} style={{ color: '#0284C7' }} />
                <span>Próximos Compromissos</span>
              </div>
              <Link to="/agenda" className="dash-panel-action">
                <span>Ver agenda</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {calendar.upcoming && calendar.upcoming.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {calendar.upcoming.map((evt) => (
                  <div key={evt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#FAFAFA', borderRadius: '8px', border: '1px solid #F4F4F5' }}>
                    <div>
                      <div style={{ fontSize: '0.825rem', fontWeight: 600 }}>{evt.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{evt.attendee_name || 'Agendamento'}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.725rem', color: '#0284C7', fontWeight: 600 }}>
                      <div>{formatDate(evt.date)}</div>
                      <div>{evt.time || ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <Calendar size={24} />
                <p>Nenhum evento agendado para os próximos dias.</p>
              </div>
            )}
          </div>

          {/* Card: E-mails Recentes */}
          <div className="dash-panel">
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <Mail size={18} style={{ color: '#E11D48' }} />
                <span>Caixa de Entrada</span>
              </div>
              <Link to="/emails" className="dash-panel-action">
                <span>Ver todos</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {emails.recent && emails.recent.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {emails.recent.map((em) => (
                  <Link to="/emails" key={em.id} style={{ padding: '8px 10px', borderRadius: '8px', background: em.is_read ? '#FAFAFA' : '#FFFBEB', border: em.is_read ? '1px solid #F4F4F5' : '1px solid #FDE68A', display: 'block', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: em.is_read ? 500 : 700 }}>{em.sender_name || em.sender}</span>
                      {em.ai_replied ? (
                        <span style={{ fontSize: '0.65rem', background: '#DCFCE7', color: '#16A34A', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>IA</span>
                      ) : !em.is_read ? (
                        <span style={{ fontSize: '0.65rem', background: '#FEE2E2', color: '#DC2626', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>Novo</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {em.subject || '(Sem assunto)'}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty-state">
                <Mail size={24} />
                <p>Nenhum e-mail sincronizado no momento.</p>
              </div>
            )}
          </div>

          {/* Card: Atalhos Rápidos */}
          <div className="dash-panel" style={{ marginBottom: 0 }}>
            <div className="dash-panel-header">
              <div className="dash-panel-title">
                <Zap size={18} style={{ color: 'var(--primary)' }} />
                <span>Atalhos Rápidos</span>
              </div>
            </div>

            <div className="quick-actions-grid">
              <Link to="/massa" className="quick-action-button">
                <div className="quick-action-button-left">
                  <Megaphone size={16} style={{ color: '#D97706' }} />
                  <span>Mensagem em Massa</span>
                </div>
                <ArrowRight size={14} />
              </Link>
              <Link to="/contratos" className="quick-action-button">
                <div className="quick-action-button-left">
                  <FileText size={16} style={{ color: '#EA580C' }} />
                  <span>Gerar Contrato</span>
                </div>
                <ArrowRight size={14} />
              </Link>
              <Link to="/contatos" className="quick-action-button">
                <div className="quick-action-button-left">
                  <UserPlus size={16} style={{ color: '#0284C7' }} />
                  <span>Adicionar Contato</span>
                </div>
                <ArrowRight size={14} />
              </Link>
              <Link to="/tarefas" className="quick-action-button">
                <div className="quick-action-button-left">
                  <Plus size={16} style={{ color: '#7C3AED' }} />
                  <span>Nova Tarefa no Kanban</span>
                </div>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
