// File: src/pages/Admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import './AdminDashboard.css';
import {
  Shield,
  Users,
  Message,
  Lock,
  Unlock,
  Send,
  Refresh,
  Close,
  Check,
  Search,
  WarningDiamond,
  Sliders,
  Smartphone,
  Telegram,
  FileText,
  SquareAlert,
  Clock
} from 'pixelarticons/react';
import { getCurrentUser, isUserAdmin } from '../../utils/workspace';

export default function AdminDashboard() {
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  const isAdmin = isUserAdmin(currentUser);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({
    total_users: 0,
    active_users: 0,
    blocked_users: 0,
    total_messages_sent: 0,
    total_failed_messages: 0,
    total_banned_whatsapps: 0,
    total_contacts: 0
  });
  const [users, setUsers] = useState([]);

  // Histórico de banimentos de WhatsApp
  const [banLogs, setBanLogs] = useState([]);
  const [loadingBans, setLoadingBans] = useState(false);
  const [isBanLogsModalOpen, setIsBanLogsModalOpen] = useState(false);

  // Histórico de mensagens perdidas / falhas
  const [failureLogs, setFailureLogs] = useState([]);
  const [loadingFailures, setLoadingFailures] = useState(false);
  const [isFailuresModalOpen, setIsFailuresModalOpen] = useState(false);

  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'blocked'
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'admin' | 'owner' | 'agent'

  // Modais
  const [activeModal, setActiveModal] = useState(null); // 'message' | 'reset' | 'limit'
  const [selectedUser, setSelectedUser] = useState(null);

  // Estados dos formulários de modal
  const [directMsgChannel, setDirectMsgChannel] = useState('whatsapp');
  const [directMsgPhone, setDirectMsgPhone] = useState('');
  const [directMsgText, setDirectMsgText] = useState('');
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  const [resetNewPass, setResetNewPass] = useState('');
  const [resetSessions, setResetSessions] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  const [newLimitValue, setNewLimitValue] = useState(0);
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  // Carrega lista de usuários e KPIs
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.users || []);
        if (data.summary) setSummary(data.summary);
      } else {
        setError(data.error || 'Falha ao carregar dados dos usuários.');
      }
    } catch (err) {
      console.error(err);
      setError('Erro de conexão ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBanLogs = async () => {
    setLoadingBans(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch('/api/admin/whatsapp-bans', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBanLogs(data.bans || []);
      }
    } catch (err) {
      console.error('Erro ao buscar logs de banimento:', err);
    } finally {
      setLoadingBans(false);
    }
  };

  const handleOpenBanLogs = () => {
    setIsBanLogsModalOpen(true);
    fetchBanLogs();
  };

  const fetchFailureLogs = async () => {
    setLoadingFailures(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch('/api/admin/failed-messages', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFailureLogs(data.failures || []);
      }
    } catch (err) {
      console.error('Erro ao buscar logs de falhas:', err);
    } finally {
      setLoadingFailures(false);
    }
  };

  const handleOpenFailureLogs = () => {
    setIsFailuresModalOpen(true);
    fetchFailureLogs();
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="admin-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', background: '#ffffff', padding: '40px', borderRadius: '16px', border: '1px solid #fee2e2' }}>
          <WarningDiamond size={48} color="#ef4444" style={{ marginBottom: '16px' }} />
          <h2 style={{ color: '#991b1b', margin: '0 0 10px' }}>Acesso Restrito</h2>
          <p style={{ color: '#7f1d1d', fontSize: '0.95rem' }}>
            Este painel administrativo é reservado exclusivamente para os administradores do sistema Unico CRM.
          </p>
          <button 
            className="btn-primary" 
            style={{ marginTop: '20px' }}
            onClick={() => window.location.href = '/'}
          >
            Voltar para o Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Filtragem dos usuários
  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase().trim();
    const matchSearch = 
      !term ||
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.username && u.username.toLowerCase().includes(term)) ||
      (u.phone && u.phone.includes(term)) ||
      (u.workspace_name && u.workspace_name.toLowerCase().includes(term));

    const matchStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && !u.is_blocked) ||
      (statusFilter === 'blocked' && u.is_blocked);

    const matchRole = 
      roleFilter === 'all' ||
      (roleFilter === 'admin' && ['admin', 'master', 'administrador'].includes((u.role || '').toLowerCase())) ||
      (roleFilter === 'owner' && (u.role || '').toLowerCase() === 'owner') ||
      (roleFilter === 'agent' && (u.role || '').toLowerCase() === 'agent');

    return matchSearch && matchStatus && matchRole;
  });

  // Ação de Bloqueio / Desbloqueio
  const handleToggleBlock = async (user) => {
    const action = user.is_blocked ? 'desbloquear' : 'bloquear';
    if (!window.confirm(`Deseja realmente ${action} a conta de "${user.name}"?`)) return;

    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/admin/users/${user.id}/toggle-block`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_blocked: !user.is_blocked })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message);
        fetchUsers();
      } else {
        alert('Erro: ' + (data.error || 'Falha ao alterar bloqueio.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao alterar status do usuário.');
    }
  };

  // Abrir Modal de Limite
  const handleOpenLimitModal = (user) => {
    setSelectedUser(user);
    setNewLimitValue(user.message_limit || 0);
    setActiveModal('limit');
  };

  const handleSaveLimit = async () => {
    if (!selectedUser) return;
    setIsSavingLimit(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/admin/users/${selectedUser.id}/limit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message_limit: Number(newLimitValue) || 0 })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message);
        setActiveModal(null);
        fetchUsers();
      } else {
        alert('Erro: ' + (data.error || 'Falha ao salvar limite.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar limite.');
    } finally {
      setIsSavingLimit(false);
    }
  };

  // Abrir Modal de Reset
  const handleOpenResetModal = (user) => {
    setSelectedUser(user);
    setResetNewPass('');
    setResetSessions(true);
    setResetResult(null);
    setActiveModal('reset');
  };

  const handleExecuteReset = async () => {
    if (!selectedUser) return;
    setIsResetting(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/admin/users/${selectedUser.id}/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          new_password: resetNewPass || undefined,
          reset_sessions: resetSessions
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetResult(data);
        fetchUsers();
      } else {
        alert('Erro: ' + (data.error || 'Falha ao resetar conta.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao executar reset da conta.');
    } finally {
      setIsResetting(false);
    }
  };

  // Abrir Modal de Mensagem Direta
  const handleOpenMsgModal = (user) => {
    setSelectedUser(user);
    setDirectMsgChannel('whatsapp');
    setDirectMsgPhone(user.phone || '');
    setDirectMsgText(`Olá ${user.name.split(' ')[0]}! Tudo bem? Aqui é o suporte da administração do Unico CRM.`);
    setActiveModal('message');
  };

  const handleSendDirectMsg = async () => {
    if (!selectedUser) return;
    if (!directMsgText.trim()) {
      alert('Digite a mensagem a ser enviada.');
      return;
    }
    if (!directMsgPhone.trim()) {
      alert('Informe o telefone de destino.');
      return;
    }

    setIsSendingMsg(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/admin/users/${selectedUser.id}/send-direct-message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: directMsgChannel,
          target_phone: directMsgPhone,
          message: directMsgText
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message);
        setActiveModal(null);
      } else {
        alert('Erro ao enviar mensagem: ' + (data.error || 'Falha no envio.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao enviar mensagem.');
    } finally {
      setIsSendingMsg(false);
    }
  };

  return (
    <div className="admin-container">
      {/* HEADER */}
      <div className="admin-header">
        <div className="admin-title-area">
          <h1>
            <Shield size={28} color="#6366f1" /> Painel de Controle de Usuários (Super Admin)
          </h1>
          <p>
            Gerenciamento global de contas cadastradas no banco SQLite, controle de cotas de envio, bloqueio e comunicação direta.
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchUsers} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Refresh size={16} /> Atualizar Dados
        </button>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="admin-kpis-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ backgroundColor: '#e0e7ff', color: '#4338ca' }}>
            <Users size={24} />
          </div>
          <div className="admin-kpi-info">
            <span className="admin-kpi-label">Total de Usuários</span>
            <span className="admin-kpi-value">{summary.total_users}</span>
            <span className="admin-kpi-subtext">{summary.active_users} ativos • {summary.blocked_users} bloqueado(s)</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>
            <Message size={24} />
          </div>
          <div className="admin-kpi-info">
            <span className="admin-kpi-label">Mensagens Disparadas</span>
            <span className="admin-kpi-value">{summary.total_messages_sent.toLocaleString('pt-BR')}</span>
            <span className="admin-kpi-subtext">Histórico total com sucesso</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
            <SquareAlert size={24} />
          </div>
          <div className="admin-kpi-info">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span className="admin-kpi-label">Mensagens Perdidas (Falhas)</span>
              {(summary.total_failed_messages || 0) > 0 && (
                <button 
                  onClick={handleOpenFailureLogs}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#dc2626', 
                    fontSize: '0.72rem', 
                    fontWeight: 700, 
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                  title="Abrir histórico de falhas do banco de dados"
                >
                  Ver Falhas
                </button>
              )}
            </div>
            <span className="admin-kpi-value" style={{ color: (summary.total_failed_messages || 0) > 0 ? '#dc2626' : '#18181b' }}>
              {(summary.total_failed_messages || 0).toLocaleString('pt-BR')}
            </span>
            <span className="admin-kpi-subtext">Falhas de envio / rejeições</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ backgroundColor: '#ffe4e6', color: '#e11d48' }}>
            <Smartphone size={24} />
          </div>
          <div className="admin-kpi-info">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span className="admin-kpi-label">WhatsApps Bloqueados</span>
              <button 
                onClick={handleOpenBanLogs}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#e11d48', 
                  fontSize: '0.72rem', 
                  fontWeight: 700, 
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
                title="Abrir histórico de banimentos pela Meta"
              >
                Ver Histórico
              </button>
            </div>
            <span className="admin-kpi-value" style={{ color: (summary.total_banned_whatsapps || 0) > 0 ? '#e11d48' : '#18181b' }}>
              {summary.total_banned_whatsapps || 0}
            </span>
            <span className="admin-kpi-subtext">Chips/contas banidos pela Meta</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
            <FileText size={24} />
          </div>
          <div className="admin-kpi-info">
            <span className="admin-kpi-label">Total de Contatos</span>
            <span className="admin-kpi-value">{summary.total_contacts.toLocaleString('pt-BR')}</span>
            <span className="admin-kpi-subtext">Em todos os workspaces</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-icon" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
            <Check size={24} />
          </div>
          <div className="admin-kpi-info">
            <span className="admin-kpi-label">Contas Ativas</span>
            <span className="admin-kpi-value" style={{ color: '#16a34a' }}>{summary.active_users}</span>
            <span className="admin-kpi-subtext">{summary.blocked_users} conta(s) suspensa(s)</span>
          </div>
        </div>
      </div>

      {/* FILTROS E BUSCA */}
      <div className="admin-filters-bar">
        <div className="admin-search-box">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome, @usuario, e-mail, telefone ou empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select 
          className="admin-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos os Status</option>
          <option value="active">🟢 Apenas Ativos</option>
          <option value="blocked">🔴 Apenas Bloqueados</option>
        </select>

        <select 
          className="admin-filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Todas as Funções</option>
          <option value="admin">Administradores</option>
          <option value="owner">Proprietários (Workspace)</option>
          <option value="agent">Agentes / Membros</option>
        </select>
      </div>

      {/* TABELA DE USUÁRIOS */}
      <div className="admin-table-card">
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <Refresh size={32} className="spin" style={{ marginBottom: '12px' }} />
            <p>Carregando dados dos usuários do banco...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>
            <p>{error}</p>
            <button className="btn-secondary" onClick={fetchUsers} style={{ marginTop: '10px' }}>Tentar Novamente</button>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
            <p>Nenhum usuário encontrado com os filtros selecionados.</p>
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Contato</th>
                  <th>Workspace</th>
                  <th>Função</th>
                  <th>Status</th>
                  <th>Cota / Mensagens</th>
                  <th>Perdidas / Falhas</th>
                  <th>Bans Meta</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const initial = (u.name || u.username || 'U').charAt(0).toUpperCase();
                  const isBlocked = u.is_blocked;
                  const limit = u.message_limit || 0;
                  const sent = u.messages_sent || 0;
                  const failed = u.messages_failed || 0;
                  const bans = u.banned_whatsapps || 0;
                  const pct = limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0;
                  const isOverLimit = limit > 0 && sent >= limit;

                  return (
                    <tr key={u.id} style={{ opacity: isBlocked ? 0.75 : 1 }}>
                      {/* USUÁRIO */}
                      <td>
                        <div className="admin-user-cell">
                          <div className={`admin-avatar ${isBlocked ? 'blocked' : ''}`}>
                            {initial}
                          </div>
                          <div className="admin-user-names">
                            <span className="admin-user-name">{u.name}</span>
                            <span className="admin-user-handle">{u.username || 'sem @'}</span>
                          </div>
                        </div>
                      </td>

                      {/* CONTATO */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.82rem' }}>
                          <span style={{ color: '#18181b', fontWeight: 500 }}>{u.email}</span>
                          <span style={{ color: '#64748b' }}>{u.phone || 'Sem telefone'}</span>
                        </div>
                      </td>

                      {/* WORKSPACE */}
                      <td>
                        <div style={{ fontSize: '0.84rem' }}>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{u.workspace_name}</div>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>ID #{u.workspace_id} • {u.contacts_count} contatos</span>
                        </div>
                      </td>

                      {/* FUNÇÃO */}
                      <td>
                        <span className={`admin-badge ${u.role === 'admin' ? 'role-admin' : u.role === 'owner' ? 'role-owner' : 'role-agent'}`}>
                          {u.role === 'admin' ? 'Super Admin' : u.role === 'owner' ? 'Proprietário' : 'Agente'}
                        </span>
                      </td>

                      {/* STATUS */}
                      <td>
                        <span 
                          className={`admin-badge ${isBlocked ? 'blocked' : 'active'}`}
                          style={{ cursor: 'pointer' }}
                          title="Clique para alternar status"
                          onClick={() => handleToggleBlock(u)}
                        >
                          {isBlocked ? '🔴 Bloqueado' : '🟢 Ativo'}
                        </span>
                      </td>

                      {/* COTA / MENSAGENS */}
                      <td>
                        <div className="admin-quota-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="admin-quota-text" style={{ color: isOverLimit ? '#dc2626' : '#475569', fontWeight: 700 }}>
                              {sent} {limit > 0 ? `/ ${limit}` : 'envios (Ilimitado)'}
                            </span>
                            {limit > 0 && (
                              <span style={{ fontSize: '0.7rem', color: isOverLimit ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                                {pct}%
                              </span>
                            )}
                          </div>
                          {limit > 0 ? (
                            <div className="admin-quota-bar">
                              <div 
                                className="admin-quota-bar-fill" 
                                style={{ 
                                  width: `${pct}%`, 
                                  backgroundColor: isOverLimit ? '#ef4444' : pct > 75 ? '#f59e0b' : '#10b981' 
                                }} 
                              />
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>Cota livre</span>
                          )}
                        </div>
                      </td>

                      {/* MENSAGENS PERDIDAS / FALHAS */}
                      <td>
                        {failed > 0 ? (
                          <span 
                            className="admin-badge failed" 
                            title={`${failed} mensagem(ns) com falha no envio. Clique para ver detalhes.`}
                            onClick={handleOpenFailureLogs}
                            style={{ cursor: 'pointer' }}
                          >
                            ⚠️ {failed} falha{failed > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>0 falhas</span>
                        )}
                      </td>

                      {/* WHATSAPPS BLOQUEADOS */}
                      <td>
                        {bans > 0 ? (
                          <span 
                            className="admin-badge banned-chip" 
                            title={`${bans} número(s) bloqueado(s) pela Meta neste workspace`}
                            onClick={handleOpenBanLogs}
                            style={{ cursor: 'pointer' }}
                          >
                            🚨 {bans} banido{bans > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>0 bans</span>
                        )}
                      </td>

                      {/* AÇÕES */}
                      <td>
                        <div className="admin-actions" style={{ justifyContent: 'flex-end' }}>
                          <button 
                            className="admin-btn-action msg" 
                            title="Mandar mensagem no privado"
                            onClick={() => handleOpenMsgModal(u)}
                          >
                            <Send size={15} />
                          </button>

                          <button 
                            className="admin-btn-action" 
                            title="Configurar limite de mensagens"
                            onClick={() => handleOpenLimitModal(u)}
                          >
                            <Sliders size={15} />
                          </button>

                          <button 
                            className="admin-btn-action reset" 
                            title="Resetar conta / Redefinir senha"
                            onClick={() => handleOpenResetModal(u)}
                          >
                            <Refresh size={15} />
                          </button>

                          <button 
                            className={`admin-btn-action ${isBlocked ? 'unblock' : 'block'}`}
                            title={isBlocked ? 'Desbloquear usuário' : 'Bloquear usuário'}
                            onClick={() => handleToggleBlock(u)}
                          >
                            {isBlocked ? <Unlock size={15} color="#16a34a" /> : <Lock size={15} color="#ef4444" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: MANDAR MENSAGEM NO PRIVADO */}
      {activeModal === 'message' && selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3><Send size={20} color="#16a34a" /> Mensagem no Privado para {selectedUser.name}</h3>
              <button className="admin-modal-close" onClick={() => setActiveModal(null)}><Close size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 16px' }}>
                Dispare uma notificação ou mensagem direta a partir da sua linha de administração para o contato do usuário.
              </p>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Canal de Disparo da Administração:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setDirectMsgChannel('whatsapp')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      border: directMsgChannel === 'whatsapp' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      background: directMsgChannel === 'whatsapp' ? '#f0fdf4' : '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Smartphone size={18} color="#16a34a" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectMsgChannel('telegram')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      border: directMsgChannel === 'telegram' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      background: directMsgChannel === 'telegram' ? '#f0f9ff' : '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Telegram size={18} color="#0284c7" /> Telegram
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Telefone / Destinatário:
                </label>
                <input 
                  type="text" 
                  className="modern-input" 
                  value={directMsgPhone}
                  onChange={(e) => setDirectMsgPhone(e.target.value)}
                  placeholder="+55 61 99999-9999"
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Texto da Mensagem:
                </label>
                <textarea 
                  className="modern-input" 
                  rows={4}
                  value={directMsgText}
                  onChange={(e) => setDirectMsgText(e.target.value)}
                  placeholder="Escreva sua mensagem aqui..."
                />
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSendDirectMsg} disabled={isSendingMsg}>
                {isSendingMsg ? 'Enviando...' : 'Enviar Mensagem Agora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIGURAR LIMITE DE MENSAGENS */}
      {activeModal === 'limit' && selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3><Sliders size={20} color="#6366f1" /> Limitar Mensagens de {selectedUser.name}</h3>
              <button className="admin-modal-close" onClick={() => setActiveModal(null)}><Close size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 16px' }}>
                Defina o teto máximo de mensagens enviadas permitido para esta conta. Quando o teto for atingido, novos envios são bloqueados até a expansão da cota.
              </p>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[0, 100, 500, 1000, 5000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNewLimitValue(val)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: newLimitValue === val ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      background: newLimitValue === val ? '#ede9fe' : '#ffffff',
                      color: newLimitValue === val ? '#6d28d9' : '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.82rem'
                    }}
                  >
                    {val === 0 ? 'Ilimitado' : `${val.toLocaleString('pt-BR')} msgs`}
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Quantidade Máxima Permitida (0 = Ilimitado):
                </label>
                <input 
                  type="number" 
                  className="modern-input" 
                  value={newLimitValue}
                  onChange={(e) => setNewLimitValue(Math.max(0, Number(e.target.value)))}
                />
              </div>

              <div style={{ marginTop: '14px', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                <strong>Consumo atual:</strong> {selectedUser.messages_sent} mensagens enviadas até o momento.
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveLimit} disabled={isSavingLimit}>
                {isSavingLimit ? 'Salvando...' : 'Salvar Cota de Mensagens'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RESETAR CONTA E REDEFINIR SENHA */}
      {activeModal === 'reset' && selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3><Refresh size={20} color="#d97706" /> Resetar Conta de {selectedUser.name}</h3>
              <button className="admin-modal-close" onClick={() => setActiveModal(null)}><Close size={18} /></button>
            </div>
            <div className="admin-modal-body">
              {resetResult ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Check size={28} />
                  </div>
                  <h4 style={{ margin: '0 0 6px', color: '#15803d' }}>Conta Resetada com Sucesso!</h4>
                  <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 16px' }}>
                    A nova senha de acesso para o usuário <strong>{resetResult.user_name}</strong> é:
                  </p>
                  <div style={{ padding: '14px', background: '#f1f5f9', borderRadius: '10px', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '1px', color: '#0f172a', border: '1px dashed #cbd5e1', userSelect: 'all' }}>
                    {resetResult.temporary_password}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '8px' }}>
                    Copie e envie esta senha para o usuário acessar o sistema.
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 16px' }}>
                    Redefina a senha de acesso e opcionalmente limpe as sessões de WhatsApp/Telegram desta conta.
                  </p>

                  <div className="form-group" style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                      Nova Senha (deixe em branco para gerar aleatória):
                    </label>
                    <input 
                      type="text" 
                      className="modern-input" 
                      value={resetNewPass}
                      onChange={(e) => setResetNewPass(e.target.value)}
                      placeholder="Ex: SenhaForte@2026 (ou deixe vazio)"
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
                    <input 
                      type="checkbox" 
                      checked={resetSessions} 
                      onChange={(e) => setResetSessions(e.target.checked)} 
                    />
                    Desconectar todas as sessões ativas de WhatsApp e Telegram
                  </label>
                </>
              )}
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setActiveModal(null)}>Fechar</button>
              {!resetResult && (
                <button className="btn-primary" style={{ backgroundColor: '#d97706', borderColor: '#d97706' }} onClick={handleExecuteReset} disabled={isResetting}>
                  {isResetting ? 'Redefinindo...' : 'Confirmar e Resetar Conta'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: HISTÓRICO DE WHATSAPPS BLOQUEADOS PELA META */}
      {isBanLogsModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsBanLogsModalOpen(false)}>
          <div className="admin-modal admin-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>
                <Smartphone size={20} color="#e11d48" /> Histórico de WhatsApps Bloqueados pela Meta ({banLogs.length})
              </h3>
              <button className="admin-modal-close" onClick={() => setIsBanLogsModalOpen(false)}>
                <Close size={18} />
              </button>
            </div>
            <div className="admin-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '16px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <p style={{ fontSize: '0.86rem', color: '#64748b', margin: 0 }}>
                  Registro de desconexões forçadas e bloqueios de chips detectados pela Meta (Códigos 401/403/Logout).
                </p>
                <button 
                  className="btn-secondary" 
                  onClick={fetchBanLogs} 
                  disabled={loadingBans}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  <Refresh size={14} className={loadingBans ? 'spin' : ''} /> Atualizar
                </button>
              </div>

              {loadingBans ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <Refresh size={28} className="spin" style={{ marginBottom: '8px' }} />
                  <p>Carregando histórico de bloqueios...</p>
                </div>
              ) : banLogs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <Check size={24} />
                  </div>
                  <h4 style={{ margin: '0 0 6px', color: '#15803d' }}>Nenhum Bloqueio Registrado!</h4>
                  <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0, maxWidth: '420px', marginInline: 'auto' }}>
                    Até o momento nenhum chip de WhatsApp foi desconectado por banimento da Meta. O sistema de proteção e anti-ban está atuando com eficácia.
                  </p>
                </div>
              ) : (
                <div className="admin-table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <table className="admin-table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Data / Horário</th>
                        <th>Workspace</th>
                        <th>Slot</th>
                        <th>Telefone / Chip</th>
                        <th>Motivo / Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {banLogs.map((log) => {
                        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : 'Recente';
                        return (
                          <tr key={log.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', whiteSpace: 'nowrap' }}>
                                <Clock size={14} color="#94a3b8" />
                                <span>{dateStr}</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                {log.workspace_name || `Workspace #${log.workspace_id}`}
                              </div>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>ID #{log.workspace_id}</span>
                            </td>
                            <td>
                              <span className="admin-badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                                Slot #{log.slot}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                                {log.phone || 'Não informado'}
                              </span>
                            </td>
                            <td>
                              <span className="admin-badge banned-chip">
                                {log.reason || 'Sessão revogada / Ban Meta'} {log.status_code ? `(${log.status_code})` : ''}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setIsBanLogsModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: HISTÓRICO DE MENSAGENS PERDIDAS / FALHAS DO BANCO DE DADOS */}
      {isFailuresModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setIsFailuresModalOpen(false)}>
          <div className="admin-modal admin-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3>
                <SquareAlert size={20} color="#dc2626" /> Mensagens Perdidas / Falhas ({failureLogs.length})
              </h3>
              <button className="admin-modal-close" onClick={() => setIsFailuresModalOpen(false)}>
                <Close size={18} />
              </button>
            </div>
            <div className="admin-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '16px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <p style={{ fontSize: '0.86rem', color: '#64748b', margin: 0 }}>
                  Registro de envios com falha, rejeições de operadoras e números inválidos armazenados no banco SQLite.
                </p>
                <button 
                  className="btn-secondary" 
                  onClick={fetchFailureLogs} 
                  disabled={loadingFailures}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  <Refresh size={14} className={loadingFailures ? 'spin' : ''} /> Atualizar
                </button>
              </div>

              {loadingFailures ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <Refresh size={28} className="spin" style={{ marginBottom: '8px' }} />
                  <p>Carregando histórico de falhas do banco...</p>
                </div>
              ) : failureLogs.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <Check size={24} />
                  </div>
                  <h4 style={{ margin: '0 0 6px', color: '#15803d' }}>Nenhuma Falha Registrada!</h4>
                  <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0, maxWidth: '420px', marginInline: 'auto' }}>
                    Todas as mensagens enviadas até o momento foram entregues com sucesso e sem perdas.
                  </p>
                </div>
              ) : (
                <div className="admin-table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <table className="admin-table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Data / Horário</th>
                        <th>Workspace</th>
                        <th>Canal</th>
                        <th>Destinatário</th>
                        <th>Motivo da Falha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failureLogs.map((log) => {
                        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : 'Recente';
                        return (
                          <tr key={log.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569', whiteSpace: 'nowrap' }}>
                                <Clock size={14} color="#94a3b8" />
                                <span>{dateStr}</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                {log.workspace_name || `Workspace #${log.workspace_id}`}
                              </div>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>ID #{log.workspace_id}</span>
                            </td>
                            <td>
                              <span className="admin-badge" style={{ textTransform: 'capitalize', background: log.channel === 'telegram' ? '#e0f2fe' : '#dcfce7', color: log.channel === 'telegram' ? '#0369a1' : '#15803d' }}>
                                {log.channel || 'whatsapp'}
                              </span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                {log.recipient_name || 'Contato'}
                              </div>
                              <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                                {log.recipient || 'Sem número'}
                              </span>
                            </td>
                            <td>
                              <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.78rem' }}>
                                {log.error_reason || 'Erro no envio'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="admin-modal-footer">
              <button className="btn-secondary" onClick={() => setIsFailuresModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

