import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Emails.css';

const API = '';
import {
  Mail,
  Inbox,
  Send,
  AtSign,
  Plus,
  Trash,
  Check,
  Close,
  Robot,
  Search,
  Sliders,
  Repeat
} from 'pixelarticons/react';

export default function Emails() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [folder, setFolder] = useState('INBOX');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unread' | 'ai'
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Resposta inline
  const [replyText, setReplyText] = useState('');
  const [isGeneratingAiReply, setIsGeneratingAiReply] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Modal Novo E-mail
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({
    account_id: '',
    to: '',
    subject: '',
    text: ''
  });
  const [aiComposePrompt, setAiComposePrompt] = useState('');
  const [isGeneratingAiCompose, setIsGeneratingAiCompose] = useState(false);
  const [isSendingCompose, setIsSendingCompose] = useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchAgents();
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [selectedAccountId, folder, search]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/api/emails/accounts?workspace_id=1`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar contas:', err);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API}/api/agents?workspace_id=1`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAgents(data);
      }
    } catch (err) {
      console.error('Erro ao buscar agentes:', err);
    }
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      let url = `${API}/api/emails/messages?workspace_id=1&folder=${folder}`;
      if (selectedAccountId) url += `&account_id=${selectedAccountId}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
        // Se a mensagem selecionada não estiver na lista atual, desmarca ou seleciona a primeira
        if (selectedMessage) {
          const stillExists = data.find(m => m.id === selectedMessage.id);
          if (!stillExists && data.length > 0) {
            handleSelectMessage(data[0]);
          } else if (!stillExists) {
            setSelectedMessage(null);
          }
        } else if (data.length > 0) {
          handleSelectMessage(data[0]);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMessage = async (msg) => {
    setSelectedMessage(msg);
    setReplyText('');
    // Se não lida, marca como lida
    if (msg.is_read === 0) {
      try {
        await fetch(`${API}/api/emails/messages/${msg.id}/read`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_read: 1 })
        });
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: 1 } : m));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSyncNow = async () => {
    if (!selectedAccountId && accounts.length === 0) return;
    const targetAccountId = selectedAccountId || accounts[0]?.id;
    if (!targetAccountId) return;

    setIsSyncing(true);
    try {
      const res = await fetch(`${API}/api/emails/accounts/${targetAccountId}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchMessages();
        await fetchAccounts();
      } else {
        alert(data.error || 'Erro na sincronização');
      }
    } catch (err) {
      alert('Erro de conexão ao sincronizar: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Tem certeza que deseja remover esta conta de e-mail? Todas as mensagens salvas também serão apagadas.')) return;
    try {
      const res = await fetch(`${API}/api/emails/accounts/${accountId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchAccounts();
        if (selectedAccountId === accountId) {
          setSelectedAccountId(null);
        }
        await fetchMessages();
      }
    } catch (err) {
      alert('Erro ao excluir conta: ' + err.message);
    }
  };

  // Gerar resposta inteligente com o Agente de IA para a mensagem selecionada
  const handleGenerateAiReply = async () => {
    if (!selectedMessage) return;
    setIsGeneratingAiReply(true);
    try {
      const activeAcc = accounts.find(a => a.id === selectedMessage.account_id);
      const agentId = activeAcc?.agent_id || (agents.length > 0 ? agents[0].id : null);

      const res = await fetch(`${API}/api/emails/messages/${selectedMessage.id}/generate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId })
      });

      const data = await res.json();
      if (data.success && data.draft) {
        setReplyText(data.draft);
      } else {
        alert(data.error || 'Não foi possível gerar a resposta. Verifique as configurações de IA.');
      }
    } catch (err) {
      alert('Erro ao consultar o Agente de IA: ' + err.message);
    } finally {
      setIsGeneratingAiReply(false);
    }
  };

  // Enviar resposta inline via SMTP
  const handleSendReply = async () => {
    if (!selectedMessage || !replyText.trim()) {
      alert('Escreva a mensagem de resposta.');
      return;
    }

    setIsSendingReply(true);
    try {
      const replySubject = selectedMessage.subject.toLowerCase().startsWith('re:')
        ? selectedMessage.subject
        : `Re: ${selectedMessage.subject}`;

      const res = await fetch(`${API}/api/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedMessage.account_id,
          to: selectedMessage.sender,
          subject: replySubject,
          text: replyText,
          in_reply_to: selectedMessage.message_id
        })
      });

      const data = await res.json();
      if (data.success) {
        alert('E-mail enviado com sucesso via Hostinger SMTP!');
        setReplyText('');
        // Atualiza status no banco e na tela
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, is_replied: 1 } : m));
        setSelectedMessage(prev => prev ? { ...prev, is_replied: 1 } : null);
        await fetchMessages();
      } else {
        alert(data.error || 'Erro ao enviar e-mail');
      }
    } catch (err) {
      alert('Erro ao enviar e-mail: ' + err.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  // Excluir e-mail
  const handleDeleteMessage = async (msgId) => {
    if (!window.confirm('Excluir este e-mail?')) return;
    try {
      const res = await fetch(`${API}/api/emails/messages/${msgId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        if (selectedMessage?.id === msgId) {
          setSelectedMessage(null);
        }
      }
    } catch (err) {
      alert('Erro ao excluir mensagem');
    }
  };

  // Ajudar a redigir novo e-mail com IA
  const handleAiCompose = async () => {
    if (!aiComposePrompt.trim()) {
      alert('Digite sobre o que você deseja que o Agente escreva o e-mail.');
      return;
    }

    setIsGeneratingAiCompose(true);
    try {
      const activeAcc = accounts.find(a => a.id === Number(composeForm.account_id)) || accounts[0];
      const agentId = activeAcc?.agent_id || (agents.length > 0 ? agents[0].id : null);

      const res = await fetch(`${API}/api/ai/direct-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          message: `Escreva um e-mail formal e completo com o seguinte objetivo:\n"${aiComposePrompt}". Inclua assunto sugerido e corpo do e-mail pronto.`
        })
      });

      // Fallback usando endpoint de direct chat ou completando no texto
      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setComposeForm(prev => ({
            ...prev,
            text: data.reply
          }));
        }
      } else {
        // Gera rascunho direto
        setComposeForm(prev => ({
          ...prev,
          text: `Olá,\n\nEscrevo a respeito de: ${aiComposePrompt}.\n\nFicamos à disposição para qualquer dúvida.\n\nAtenciosamente,\nEquipe de Atendimento`
        }));
      }
    } catch (e) {
      setComposeForm(prev => ({
        ...prev,
        text: `Olá,\n\nEscrevo a respeito de: ${aiComposePrompt}.\n\nAtenciosamente,\nEquipe de Atendimento`
      }));
    } finally {
      setIsGeneratingAiCompose(false);
    }
  };

  // Enviar novo e-mail composto
  const handleSendCompose = async (e) => {
    e.preventDefault();
    if (!composeForm.account_id || !composeForm.to || !composeForm.subject || !composeForm.text) {
      alert('Preencha a conta remetente, o destinatário, o assunto e a mensagem.');
      return;
    }

    setIsSendingCompose(true);
    try {
      const res = await fetch(`${API}/api/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(composeForm)
      });
      const data = await res.json();
      if (data.success) {
        alert('E-mail enviado com sucesso via Hostinger SMTP!');
        setIsComposeModalOpen(false);
        setComposeForm({ account_id: '', to: '', subject: '', text: '' });
        setAiComposePrompt('');
        if (folder === 'SENT') await fetchMessages();
      } else {
        alert(data.error || 'Erro ao enviar e-mail');
      }
    } catch (err) {
      alert('Erro de conexão ao enviar: ' + err.message);
    } finally {
      setIsSendingCompose(false);
    }
  };

  // Filtragem de mensagens
  const filteredMessages = messages.filter(m => {
    if (filter === 'unread') return m.is_read === 0;
    if (filter === 'ai') return m.ai_replied === 1;
    return true;
  });

  const activeAccount = accounts.find(a => a.id === selectedAccountId);
  const activeAgent = agents.find(ag => ag.id === activeAccount?.agent_id);

  return (
    <div className="emails-container">
      {/* Header */}
      <div className="emails-header">
        <div className="emails-header-title">
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #673ab7 0%, #4a148c 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(103, 58, 183, 0.25)'
          }}>
            <Mail style={{ width: '24px', height: '24px' }} />
          </div>
          <div>
            <h1>Gestão de E-mails & Agente IA</h1>
            <p className="emails-header-subtitle">
              Envio e recebimento sincronizados com Hostinger (IMAP/SMTP) integrados ao seu Agente de IA para suporte inteligente.
            </p>
          </div>
        </div>

        <div className="emails-header-actions">
          <button
            className="btn-secondary"
            onClick={handleSyncNow}
            disabled={isSyncing}
            title="Sincronizar caixa de entrada agora"
          >
            <Repeat className={isSyncing ? 'spinning' : ''} style={{ width: '16px', height: '16px' }} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <button
            className="btn-hostinger"
            onClick={() => navigate('/conexoes')}
          >
            <Plus style={{ width: '16px', height: '16px' }} />
            Gerenciar Conexões
          </button>

          <button
            className="btn-primary"
            onClick={() => {
              setComposeForm({
                account_id: selectedAccountId || (accounts[0] ? String(accounts[0].id) : ''),
                to: '',
                subject: '',
                text: ''
              });
              setIsComposeModalOpen(true);
            }}
          >
            <Send style={{ width: '16px', height: '16px' }} />
            Escrever E-mail
          </button>
        </div>
      </div>

      {/* 3-Pane Layout */}
      <div className="emails-layout">
        {/* Pane 1: Contas e Pastas */}
        <div className="emails-pane-sidebar">
          {/* Seção de Contas Conectadas */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <span>Contas Hostinger</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({accounts.length})</span>
            </div>

            {accounts.length === 0 ? (
              <div style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                Nenhuma conta conectada.
                <button
                  onClick={() => navigate('/conexoes')}
                  style={{
                    display: 'block',
                    margin: '8px auto 0',
                    color: '#673ab7',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  + Conectar Hostinger
                </button>
              </div>
            ) : (
              accounts.map(acc => (
                <div
                  key={acc.id}
                  className={`account-card ${selectedAccountId === acc.id ? 'active' : ''}`}
                  onClick={() => setSelectedAccountId(acc.id)}
                >
                  <div className="account-card-header">
                    <span className="account-name">{acc.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAccount(acc.id);
                      }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
                      title="Excluir conta"
                    >
                      <Trash style={{ width: '13px', height: '13px' }} />
                    </button>
                  </div>
                  <div className="account-email">{acc.email_address}</div>
                  <div className="account-badges">
                    <span className={`status-pill ${acc.status === 'connected' ? 'connected' : 'error'}`}>
                      {acc.status === 'connected' ? '● Online' : '● Erro'}
                    </span>
                    {acc.auto_reply_enabled === 1 && (
                      <span className="status-pill ai-badge" title="Auto-resposta ativada">
                        🤖 IA Ativa
                      </span>
                    )}
                    {acc.unread_count > 0 && (
                      <span className="status-pill" style={{ background: '#fef3c7', color: '#92400e' }}>
                        {acc.unread_count} não lidas
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pastas de Navegação */}
          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="sidebar-section-title">Pastas</div>
            <div className="folder-nav">
              <button
                className={`folder-btn ${folder === 'INBOX' ? 'active' : ''}`}
                onClick={() => setFolder('INBOX')}
              >
                <div className="folder-btn-left">
                  <Inbox style={{ width: '16px', height: '16px' }} />
                  <span>Caixa de Entrada</span>
                </div>
                {activeAccount?.unread_count > 0 && (
                  <span className="folder-badge">{activeAccount.unread_count}</span>
                )}
              </button>

              <button
                className={`folder-btn ${folder === 'SENT' ? 'active' : ''}`}
                onClick={() => setFolder('SENT')}
              >
                <div className="folder-btn-left">
                  <Send style={{ width: '16px', height: '16px' }} />
                  <span>Enviados</span>
                </div>
              </button>
            </div>
          </div>

          {/* Card do Agente de IA vinculado */}
          {activeAccount && (
            <div className="ai-assistant-card">
              <div className="ai-assistant-header">
                <Robot style={{ width: '18px', height: '18px' }} />
                <span>Agente de IA Integrado</span>
              </div>
              <div className="ai-assistant-desc">
                {activeAgent ? (
                  <>
                    <strong>{activeAgent.icon} {activeAgent.name}</strong> está configurado para gerenciar respostas desta conta.
                  </>
                ) : (
                  'Nenhum agente vinculado a esta conta.'
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#5b21b6' }}>
                <span>Auto-resposta automática:</span>
                <strong style={{ color: activeAccount.auto_reply_enabled === 1 ? '#15803d' : '#94a3b8' }}>
                  {activeAccount.auto_reply_enabled === 1 ? 'ATIVADA' : 'MANUAL'}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* Pane 2: Lista de Mensagens */}
        <div className="emails-pane-list">
          <div className="list-topbar">
            <div className="search-input-wrapper">
              <Search className="search-icon" style={{ width: '15px', height: '15px' }} />
              <input
                type="text"
                className="search-input"
                placeholder="Pesquisar e-mails..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="filter-chips">
              <button
                className={`chip-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                Todos ({messages.length})
              </button>
              <button
                className={`chip-btn ${filter === 'unread' ? 'active' : ''}`}
                onClick={() => setFilter('unread')}
              >
                Não lidos ({messages.filter(m => m.is_read === 0).length})
              </button>
              <button
                className={`chip-btn ${filter === 'ai' ? 'active' : ''}`}
                onClick={() => setFilter('ai')}
              >
                🤖 IA ({messages.filter(m => m.ai_replied === 1).length})
              </button>
            </div>
          </div>

          <div className="messages-scroll-area">
            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Carregando e-mails...
              </div>
            ) : filteredMessages.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Mail style={{ width: '32px', height: '32px', marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ fontSize: '13px', margin: 0 }}>Nenhum e-mail nesta pasta.</p>
                {folder === 'INBOX' && (
                  <button
                    onClick={handleSyncNow}
                    style={{
                      marginTop: '10px',
                      background: 'none',
                      border: 'none',
                      color: '#6366f1',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Buscar novos na Hostinger
                  </button>
                )}
              </div>
            ) : (
              filteredMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`message-item ${selectedMessage?.id === msg.id ? 'active' : ''} ${msg.is_read === 0 ? 'unread' : ''}`}
                  onClick={() => handleSelectMessage(msg)}
                >
                  <div className="message-item-header">
                    <span className="message-sender">
                      {msg.folder === 'SENT' ? `Para: ${msg.recipient}` : (msg.sender_name || msg.sender)}
                    </span>
                    <span className="message-date">
                      {new Date(msg.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>

                  <div className="message-subject">{msg.subject || '(Sem assunto)'}</div>
                  <div className="message-snippet">{msg.snippet || msg.body_text || '(Mensagem sem texto)'}</div>

                  <div className="message-badges">
                    {msg.is_read === 0 && <span className="unread-dot" title="Não lida" />}
                    {msg.ai_replied === 1 && (
                      <span className="status-pill ai-badge" style={{ fontSize: '10px' }}>
                        🤖 IA Respondeu
                      </span>
                    )}
                    {msg.is_replied === 1 && msg.ai_replied !== 1 && (
                      <span className="status-pill" style={{ background: '#f1f5f9', color: '#475569', fontSize: '10px' }}>
                        Respondido
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pane 3: Visualização do E-mail e Resposta */}
        <div className="emails-pane-view">
          {selectedMessage ? (
            <div className="message-view-container">
              {/* Cabeçalho da Mensagem */}
              <div className="message-view-header">
                <div className="message-view-subject-row">
                  <h2 className="message-view-subject">{selectedMessage.subject || '(Sem assunto)'}</h2>
                  <div className="message-view-actions">
                    <button
                      className="btn-secondary"
                      onClick={() => handleDeleteMessage(selectedMessage.id)}
                      title="Excluir mensagem"
                    >
                      <Trash style={{ width: '15px', height: '15px' }} />
                    </button>
                  </div>
                </div>

                <div className="message-view-meta">
                  <div className="sender-avatar">
                    {(selectedMessage.sender_name || selectedMessage.sender || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="meta-details">
                    <div className="meta-sender-name">
                      {selectedMessage.sender_name ? `${selectedMessage.sender_name} ` : ''}
                      <span className="meta-sender-email">&lt;{selectedMessage.sender}&gt;</span>
                    </div>
                    <div className="meta-date">
                      Para: {selectedMessage.recipient} • {new Date(selectedMessage.date).toLocaleString('pt-BR')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Banner de IA se já foi respondido */}
              {selectedMessage.ai_replied === 1 && (
                <div className="ai-replied-banner">
                  <span className="ai-replied-banner-icon">🤖</span>
                  <div className="ai-replied-banner-content">
                    <h4>Resposta Automática Enviada pelo Agente</h4>
                    <p>{selectedMessage.ai_draft || 'O agente processou este e-mail e enviou a resposta via Hostinger SMTP.'}</p>
                  </div>
                </div>
              )}

              {/* Corpo da Mensagem */}
              <div className="message-view-body">
                {selectedMessage.body_text || (
                  <div dangerouslySetInnerHTML={{ __html: selectedMessage.body_html || '' }} />
                ) || '(Sem conteúdo de texto)'}
              </div>

              {/* Área de Resposta */}
              {selectedMessage.folder !== 'SENT' && (
                <div className="reply-section">
                  <div className="reply-header">
                    <span className="reply-title">
                      Responder para {selectedMessage.sender_name || selectedMessage.sender}
                    </span>

                    <button
                      className="btn-ai"
                      onClick={handleGenerateAiReply}
                      disabled={isGeneratingAiReply}
                      title="Usar o Agente de IA para escrever a resposta perfeita"
                    >
                      <Robot style={{ width: '16px', height: '16px' }} />
                      {isGeneratingAiReply ? 'Gerando com Agente...' : 'Gerar Resposta com IA'}
                    </button>
                  </div>

                  <textarea
                    className="reply-textarea"
                    placeholder="Digite sua resposta aqui ou clique em 'Gerar Resposta com IA' para que o agente redija o e-mail..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />

                  <div className="reply-actions">
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Enviando via: <strong>{selectedMessage.account_email || 'Hostinger'}</strong>
                    </span>

                    <button
                      className="btn-primary"
                      onClick={handleSendReply}
                      disabled={isSendingReply || !replyText.trim()}
                    >
                      <Send style={{ width: '15px', height: '15px' }} />
                      {isSendingReply ? 'Enviando...' : 'Enviar Resposta'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-view-state">
              <div className="empty-view-icon">
                <Mail style={{ width: '32px', height: '32px' }} />
              </div>
              <h3 style={{ fontSize: '16px', color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                Nenhum e-mail selecionado
              </h3>
              <p style={{ fontSize: '13px', maxWidth: '320px', margin: 0 }}>
                Selecione uma mensagem na lista à esquerda para visualizá-la ou conecte sua conta Hostinger para sincronizar.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Escrever Novo E-mail */}
      {isComposeModalOpen && (
        <div className="email-modal-overlay" onClick={() => setIsComposeModalOpen(false)}>
          <div className="email-modal" onClick={(e) => e.stopPropagation()}>
            <div className="email-modal-header">
              <div className="email-modal-title">
                <Send style={{ width: '18px', height: '18px', color: '#6366f1' }} />
                <span>Novo E-mail</span>
              </div>
              <button
                type="button"
                onClick={() => setIsComposeModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                title="Fechar"
              >
                <Close style={{ width: '18px', height: '18px' }} />
              </button>
            </div>

            <form onSubmit={handleSendCompose}>
              <div className="email-modal-body">
                <div className="form-group">
                  <label>Conta Remetente (Hostinger)</label>
                  <select
                    value={composeForm.account_id}
                    onChange={(e) => setComposeForm({ ...composeForm, account_id: e.target.value })}
                    required
                  >
                    <option value="">Selecione uma conta...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.email_address})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Para (Destinatário)</label>
                  <input
                    type="email"
                    required
                    placeholder="cliente@exemplo.com"
                    value={composeForm.to}
                    onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Assunto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Proposta Comercial, Acompanhamento, etc."
                    value={composeForm.subject}
                    onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                  />
                </div>

                {/* Assistente de Redação com IA */}
                <div style={{
                  padding: '12px',
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  borderRadius: '8px'
                }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#5b21b6', display: 'block', marginBottom: '6px' }}>
                    🤖 Ajudar a Redigir com o Agente de IA
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Ex: Diga que a mentoria foi agendada para sábado às 11h..."
                      value={aiComposePrompt}
                      onChange={(e) => setAiComposePrompt(e.target.value)}
                      style={{ flex: 1, fontSize: '12.5px' }}
                    />
                    <button
                      type="button"
                      className="btn-ai"
                      onClick={handleAiCompose}
                      disabled={isGeneratingAiCompose}
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {isGeneratingAiCompose ? 'Escrevendo...' : 'Gerar'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Mensagem</label>
                  <textarea
                    rows={5}
                    required
                    placeholder="Escreva sua mensagem aqui..."
                    value={composeForm.text}
                    onChange={(e) => setComposeForm({ ...composeForm, text: e.target.value })}
                  />
                </div>
              </div>

              <div className="email-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsComposeModalOpen(false)}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="btn-send-email"
                  disabled={isSendingCompose}
                >
                  <Send style={{ width: '15px', height: '15px' }} />
                  {isSendingCompose ? 'Enviando...' : 'Enviar E-mail'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
