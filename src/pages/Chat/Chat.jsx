import React, { useState, useRef, useEffect } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import './Chat.css';
import {
  Search,
  Menu,
  MoreVertical,
  ChevronDown,
  Smile,
  Attachment,
  Image as ImageIcon,
  Send,
  Star,
  User,
  Mic,
  Square,
  ChevronDown as ChevronDownIcon,
  Trash
} from 'pixelarticons/react';

export default function Chat() {
  const [localMessages, setLocalMessages] = useState([]);
  const [waContacts, setWaContacts] = useState([]);
  const [activeContactId, setActiveContactId] = useState(null);
  const [activePlatform, setActivePlatform] = useState('whatsapp');
  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const messagesEndRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [chatAgents, setChatAgents] = useState({});
  const [agentsList, setAgentsList] = useState([]);
  const [automationsList, setAutomationsList] = useState([]);
  const [autoRespondAll, setAutoRespondAll] = useState(false);
  const [autoRespondType, setAutoRespondType] = useState('agent');
  const [autoRespondTarget, setAutoRespondTarget] = useState('none');

  useEffect(() => {
    // 1. Agentes
    fetch('/api/agents?workspace_id=1')
      .then(res => res.json())
      .then(data => {
        setAgentsList([{ id: 'none', name: 'Nenhum Agente (Manual)' }, ...data]);
      })
      .catch(err => console.error('Error fetching agents:', err));

    // 2. Automações
    fetch('/api/automations?workspace_id=1')
      .then(res => res.json())
      .then(data => {
        let list = Array.isArray(data) ? [...data] : [];
        try {
          const saved = localStorage.getItem('unne_automations_list');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              const existingIds = new Set(list.map(a => String(a.id)));
              parsed.forEach(p => {
                if (!existingIds.has(String(p.id))) {
                  list.push(p);
                }
              });
            }
          }
        } catch (e) {}
        if (list.length === 0) {
          list = [{ id: 1, name: 'Orquestra de Agentes (Porteiro)' }];
        }
        setAutomationsList(list);
      })
      .catch(err => {
        console.error('Error fetching automations:', err);
        try {
          const saved = localStorage.getItem('unne_automations_list');
          if (saved) setAutomationsList(JSON.parse(saved));
          else setAutomationsList([{ id: 1, name: 'Orquestra de Agentes (Porteiro)' }]);
        } catch(e) {
          setAutomationsList([{ id: 1, name: 'Orquestra de Agentes (Porteiro)' }]);
        }
      });

    // 3. Configuração Global de Auto-resposta
    fetch('/api/workspaces/1/auto_respond')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setAutoRespondAll(data.auto_respond_all === 1);
          setAutoRespondType(data.auto_respond_type || 'agent');
          setAutoRespondTarget(data.auto_respond_target_id || 'none');
        }
      })
      .catch(err => console.error('Error fetching auto respond settings:', err));

    // 4. Atribuições individuais
    fetch('/api/workspaces/1/chat_assignments')
      .then(res => res.json())
      .then(data => {
        setChatAgents(data || {});
      })
      .catch(err => console.error('Error fetching chat assignments:', err));
  }, []);

  const handleToggleAutoRespondAll = async (checked) => {
    setAutoRespondAll(checked);
    let targetId = autoRespondTarget;
    let targetType = autoRespondType;
    
    if (checked && (!targetId || targetId === 'none')) {
      if (agentsList.length > 1) {
        targetId = String(agentsList[1].id);
        targetType = 'agent';
      } else if (automationsList.length > 0) {
        targetId = `auto_${automationsList[0].id}`;
        targetType = 'automation';
      }
      setAutoRespondTarget(targetId);
      setAutoRespondType(targetType);
    }

    try {
      await fetch('/api/workspaces/1/auto_respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_respond_all: checked ? 1 : 0,
          auto_respond_type: targetType,
          auto_respond_target_id: checked ? targetId : 'none'
        })
      });
    } catch (e) {
      console.error('Error saving auto_respond:', e);
    }
  };

  const handleTargetSelectChange = async (selectedValue) => {
    if (selectedValue === 'none') {
      setAutoRespondAll(false);
      setAutoRespondTarget('none');
      try {
        await fetch('/api/workspaces/1/auto_respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auto_respond_all: 0,
            auto_respond_type: 'agent',
            auto_respond_target_id: 'none'
          })
        });
      } catch (e) {
        console.error('Error saving auto_respond:', e);
      }
    } else {
      const isAuto = selectedValue.startsWith('auto_');
      const targetType = isAuto ? 'automation' : 'agent';
      const targetId = isAuto ? selectedValue : selectedValue.replace('agent_', '');

      setAutoRespondAll(true);
      setAutoRespondType(targetType);
      setAutoRespondTarget(targetId);

      try {
        await fetch('/api/workspaces/1/auto_respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auto_respond_all: 1,
            auto_respond_type: targetType,
            auto_respond_target_id: targetId
          })
        });
      } catch (e) {
        console.error('Error saving auto_respond:', e);
      }
    }
  };

  const handleAgentChange = async (contactId, agentId) => {
    setChatAgents(prev => ({...prev, [contactId]: agentId}));
    try {
      await fetch('/api/workspaces/1/chat_assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          remote_jid: contactId, 
          agent_id: agentId === 'global' ? 'none' : agentId 
        })
      });
    } catch (e) {
      console.error('Error saving assignment:', e);
    }
  };

  // Auto-scroll when chat changes
  useEffect(() => {
    scrollToBottom('auto');
    const pageContainer = document.querySelector('.page-container');
    if (pageContainer) pageContainer.scrollLeft = 0;
  }, [activeContactId]);

  // Smart auto-scroll on new messages
  useEffect(() => {
    if (!showScrollButton) {
      scrollToBottom('smooth');
    }
  }, [waContacts, localMessages]);

  const scrollToBottom = (behavior = 'smooth') => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTo({
        top: chatMessagesRef.current.scrollHeight,
        behavior
      });
    }
  };

  const handleScroll = () => {
    if (!chatMessagesRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current;
    // Se a barra de rolagem estiver mais de 100px distante do fundo, mostramos o botão
    if (scrollHeight - scrollTop - clientHeight > 100) {
      setShowScrollButton(true);
    } else {
      setShowScrollButton(false);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !activeContactId) return;
    
    const textToSend = inputValue;
    setInputValue('');
    setShowEmojiPicker(false);

    try {
      await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: 1,
          to: activeContactId,
          text: textToSend
        })
      });
      // A mensagem será retornada pelo polling do useEffect, então não precisamos atualizar o state local.
      // Se quisermos, poderíamos usar um state local de loading ou optimistic UI,
      // mas o useEffect já puxa o histórico que agora inclui as msg enviadas (fromMe: true).
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const onEmojiClick = (emojiObject) => {
    setInputValue(prevInput => prevInput + emojiObject.native);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !activeContactId) return;
    
    for (const file of files) {
      const formData = new FormData();
      formData.append('workspace_id', 1);
      formData.append('to', activeContactId);
      formData.append('text', '');
      formData.append('file', file);

      try {
        await fetch('/api/messages/send', {
          method: 'POST',
          body: formData
        });
      } catch (err) {
        console.error('Error sending file:', err);
      }
    }
    
    e.target.value = null; // reset input
  };

  const startRecording = async () => {
    if (!activeContactId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
        
        const formData = new FormData();
        formData.append('workspace_id', 1);
        formData.append('to', activeContactId);
        formData.append('text', '');
        formData.append('file', file);

        try {
          await fetch('/api/messages/send', {
            method: 'POST',
            body: formData
          });
        } catch (err) {
          console.error('Error sending audio:', err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch('/api/messages?workspace_id=1');
        if (res.ok) {
          const data = await res.json();
          
          const contactsMap = {};
          data.forEach(msg => {
            const contactId = msg.from;
            if (!contactsMap[contactId]) {
              contactsMap[contactId] = {
                id: contactId,
                name: msg.pushName || contactId.split('@')[0],
                avatar: `/api/contacts/${contactId}/avatar?workspace_id=1`,
                fallbackAvatar: `https://api.dicebear.com/7.x/initials/svg?seed=${msg.pushName || contactId}`,
                msg: msg.text,
                time: new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                messages: []
              };
            }
            contactsMap[contactId].msg = msg.text;
            contactsMap[contactId].time = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            contactsMap[contactId].messages.push({
              id: msg.id,
              from: msg.fromMe ? 'me' : 'them',
              text: msg.text,
              type: msg.type || 'text',
              fileUrl: msg.fileUrl
            });
          });

          setWaContacts(Object.values(contactsMap));
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, []);

  const activeContact = waContacts.find(c => c.id === activeContactId);
  const displayMessages = activeContact 
    ? [...activeContact.messages, ...localMessages.filter(m => m.contactId === activeContactId)]
    : [];

  const deleteChat = async () => {
    if (!activeContactId) return;
    if (window.confirm('Tem certeza que deseja apagar esta conversa do histórico?')) {
      try {
        await fetch(`/api/messages/${activeContactId}?workspace_id=1`, {
          method: 'DELETE',
        });
        
        setActiveContactId(null);
        // let the polling mechanism refresh the list
      } catch (err) {
        console.error('Failed to delete chat:', err);
      }
    }
  };

  return (
    <div className="chat-container">
      {/* Sidebar de Contatos (Dark Theme) */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-header-left">
            <button><Menu size={20} /></button>
            <button><Search size={20} /></button>
          </div>
          <button><MoreVertical size={20} /></button>
        </div>
        
        <div className="chat-tabs" style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            className={`chat-tab-btn ${activePlatform === 'whatsapp' ? 'active' : ''}`}
            onClick={() => { setActivePlatform('whatsapp'); setActiveContactId(null); }}
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: 'transparent', 
              border: 'none', 
              color: activePlatform === 'whatsapp' ? '#F59E0B' : '#A1A1AA', 
              borderBottom: activePlatform === 'whatsapp' ? '2px solid #F59E0B' : '2px solid transparent', 
              fontWeight: 600, 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            WhatsApp
          </button>
          <button 
            className={`chat-tab-btn ${activePlatform === 'telegram' ? 'active' : ''}`}
            onClick={() => { setActivePlatform('telegram'); setActiveContactId(null); }}
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: 'transparent', 
              border: 'none', 
              color: activePlatform === 'telegram' ? '#0284C7' : '#A1A1AA', 
              borderBottom: activePlatform === 'telegram' ? '2px solid #0284C7' : '2px solid transparent', 
              fontWeight: 600, 
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Telegram
          </button>
        </div>
        
        <div className="chat-filters">
          <button className="chat-filter-btn">
            Today <ChevronDown size={14} />
          </button>
          <button className="chat-filter-btn">
            Date <ChevronDown size={14} />
          </button>
        </div>

        {/* Card de Status na Sidebar */}
        <div 
          className="chat-sidebar-auto-respond-card"
          style={{
            margin: '0 16px 12px 16px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: autoRespondAll ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${autoRespondAll ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: autoRespondAll ? '#10B981' : '#71717A',
              boxShadow: autoRespondAll ? '0 0 8px #10B981' : 'none',
              flexShrink: 0 
            }} />
            <span style={{ 
              color: autoRespondAll ? '#A7F3D0' : '#A1A1AA', 
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {autoRespondAll 
                ? (autoRespondType === 'automation' ? '⚡ Automação em todos' : '🤖 IA em todos os chats')
                : 'Resposta em todos: Desativada'}
            </span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }} title="Ativar/desativar resposta automática em todos os chats">
            <input 
              type="checkbox" 
              checked={autoRespondAll} 
              onChange={(e) => handleToggleAutoRespondAll(e.target.checked)}
              style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#10B981' }}
            />
          </label>
        </div>

        <div className="chat-list">
          {(() => {
            const filteredContacts = waContacts.filter(c => 
              activePlatform === 'telegram' ? c.id.endsWith('@telegram') : !c.id.endsWith('@telegram')
            );
            
            if (filteredContacts.length === 0) {
              return (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#A1A1AA', fontSize: '0.9rem' }}>
                  {activePlatform === 'telegram' ? (
                    <>
                      <p>O Telegram está conectado, mas ainda não há mensagens recentes aqui.</p>
                      <p style={{ marginTop: '8px', fontSize: '0.8rem' }}>As conversas aparecerão assim que novos contatos enviarem mensagens pelo bot.</p>
                    </>
                  ) : (
                    <p>Nenhuma conversa no WhatsApp ainda.</p>
                  )}
                </div>
              );
            }

            return filteredContacts.map(contact => (
              <div 
                key={contact.id} 
                className={`chat-item ${contact.id === activeContactId ? 'active' : ''}`}
                onClick={() => setActiveContactId(contact.id)}
              >
                <div className="chat-avatar">
                  <img src={contact.avatar} onError={(e) => { e.target.onerror = null; e.target.src = contact.fallbackAvatar; }} alt={contact.name} />
                </div>
                <div className="chat-item-content">
                  <div className="chat-item-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name}</span>
                    {(autoRespondAll || (chatAgents[contact.id] && chatAgents[contact.id] !== 'none')) && (
                      <span 
                        title={chatAgents[contact.id] && chatAgents[contact.id] !== 'none' ? 'Agente dedicado neste chat' : (autoRespondType === 'automation' ? 'Automação Global Ativa' : 'IA Global Ativa')}
                        style={{
                          fontSize: '0.65rem',
                          padding: '2px 5px',
                          borderRadius: '4px',
                          backgroundColor: autoRespondAll ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: autoRespondAll ? '#34D399' : '#FBBF24',
                          fontWeight: 600,
                          marginLeft: '6px',
                          flexShrink: 0
                        }}
                      >
                        {autoRespondType === 'automation' ? '⚡ AUTO' : '🤖 IA'}
                      </span>
                    )}
                  </div>
                  <div className="chat-item-msg">{contact.msg}</div>
                </div>
                <div className="chat-item-right">
                  <Star size={14} className={contact.star ? "star-icon" : ""} fill={contact.star ? "currentColor" : "none"} color={contact.star ? "var(--danger)" : "rgba(255,255,255,0.3)"} />
                  <span className="chat-item-time">{contact.time}</span>
                </div>
              </div>
            ));
          })()}
        </div>
      </aside>

      {/* Área Principal do Chat */}
      <main className="chat-main">
        <header className="chat-main-header">
          <div className="chat-main-user">
            <div className="chat-main-avatar" style={{ backgroundColor: '#E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {activeContact ? (
                <img src={activeContact.avatar} onError={(e) => { e.target.onerror = null; e.target.src = activeContact.fallbackAvatar; }} alt={activeContact.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={24} color="#71717A" />
              )}
            </div>
            <span className="chat-main-name" style={{ color: activeContact ? 'var(--text)' : '#71717A' }}>
              {activeContact ? activeContact.name : 'Nenhum chat selecionado'}
            </span>
          </div>
          <div className="chat-main-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Caixa de seleção Global: Responder todos os chats com IA ou Automação */}
            <div 
              className="global-auto-respond-container"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: autoRespondAll ? '#ECFDF5' : '#F4F4F5',
                border: `1px solid ${autoRespondAll ? '#10B981' : 'var(--border)'}`,
                padding: '5px 10px',
                borderRadius: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <label 
                htmlFor="auto-respond-all-checkbox"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: autoRespondAll ? '#065F46' : '#52525B',
                  userSelect: 'none'
                }}
                title="Marque a caixa de seleção para responder todos os chats automaticamente com IA ou Automação"
              >
                <input 
                  id="auto-respond-all-checkbox"
                  type="checkbox"
                  checked={autoRespondAll}
                  onChange={(e) => handleToggleAutoRespondAll(e.target.checked)}
                  style={{
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    accentColor: '#10B981'
                  }}
                />
                <span title="Resposta automática para todos os chats">Todos:</span>
              </label>

              <select 
                id="auto-respond-target-select"
                value={
                  !autoRespondAll || autoRespondTarget === 'none' 
                    ? 'none' 
                    : (autoRespondType === 'automation' ? `auto_${autoRespondTarget.replace('auto_', '')}` : `agent_${autoRespondTarget}`)
                }
                onChange={(e) => handleTargetSelectChange(e.target.value)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${autoRespondAll ? '#10B981' : 'var(--border)'}`,
                  backgroundColor: '#FFFFFF',
                  color: autoRespondAll ? '#065F46' : 'var(--text)',
                  fontSize: '0.82rem',
                  fontWeight: autoRespondAll ? 600 : 400,
                  outline: 'none',
                  cursor: 'pointer',
                  maxWidth: '145px',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap'
                }}
                title="Selecione se o Agente de IA ou Automação vai responder todos os chats ou não"
              >
                <option value="none">⚪ Manual (Sem IA)</option>
                <optgroup label="🤖 Agentes de IA">
                  {agentsList.filter(a => a.id !== 'none').map(agent => (
                    <option key={`agent_${agent.id}`} value={`agent_${agent.id}`}>
                      🤖 {agent.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="⚡ Automações">
                  {automationsList.map(auto => (
                    <option key={`auto_${auto.id}`} value={`auto_${auto.id}`}>
                      ⚡ {auto.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Atribuição específica do chat ativo */}
            {activeContactId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.75rem', color: '#71717A', fontWeight: 500, whiteSpace: 'nowrap' }}>Chat:</span>
                <select 
                  value={chatAgents[activeContactId] || (autoRespondAll ? 'global' : 'none')}
                  onChange={(e) => handleAgentChange(activeContactId, e.target.value)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    outline: 'none',
                    cursor: 'pointer',
                    maxWidth: '145px',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap'
                  }}
                  title="Configurar agente específico para esta conversa"
                >
                  {autoRespondAll && (
                    <option value="global">
                      🌐 Padrão Global ({autoRespondType === 'automation' ? 'Automação' : 'IA'})
                    </option>
                  )}
                  <option value="none">Manual (Sem Agente)</option>
                  <optgroup label="Agentes de IA">
                    {agentsList.filter(a => a.id !== 'none').map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.icon && !agent.icon.startsWith('/') && !agent.icon.startsWith('http') ? agent.icon + ' ' : '🤖 '}{agent.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Automações">
                    {automationsList.map(auto => (
                      <option key={`auto_${auto.id}`} value={`auto_${auto.id}`}>
                        ⚡ {auto.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}
            {activeContactId && (
              <button 
                onClick={deleteChat}
                style={{
                  background: 'transparent', 
                  border: 'none', 
                  color: '#ef4444', 
                  cursor: 'pointer',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Deletar Conversa"
              >
                <Trash size={20} />
              </button>
            )}
            <button><MoreVertical size={20} /></button>
          </div>
        </header>

        <div className="chat-messages" ref={chatMessagesRef} onScroll={handleScroll} style={{ position: 'relative' }}>
          {displayMessages.map((msg) => {
            if (!msg.text && !msg.fileUrl && msg.type !== 'audio') return null;

            return (
              <div key={msg.id} className={`message-row ${msg.from}`}>
                <div className="message-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.type === 'image' && msg.fileUrl && (
                    <>
                      <img 
                        src={msg.fileUrl} 
                        alt={msg.text || 'Imagem'} 
                        style={{maxWidth: '220px', borderRadius: '4px', display: 'block'}} 
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                      <div style={{ display: 'none', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <ImageIcon size={16} />
                        <span>{msg.text || 'Imagem'}</span>
                      </div>
                    </>
                  )}
                  {msg.type === 'audio' && (
                    msg.fileUrl ? (
                      <audio controls src={msg.fileUrl} style={{maxWidth: '250px', display: 'block', height: '40px'}} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <Mic size={16} />
                        <span>{msg.text || 'Mensagem de áudio'}</span>
                      </div>
                    )
                  )}
                  {msg.type === 'video' && msg.fileUrl && (
                    <video controls src={msg.fileUrl} style={{maxWidth: '250px', borderRadius: '4px', display: 'block'}} />
                  )}
                  {msg.type === 'file' && (
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'rgba(0,0,0,0.05)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.1)'}}>
                      <Attachment size={20} />
                      <span style={{fontWeight: 500, fontSize: '0.85rem', wordBreak: 'break-all'}}>{msg.text || 'Arquivo'}</span>
                    </div>
                  )}
                  {(!msg.type || msg.type === 'text') && msg.text}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
          
          {showScrollButton && (
            <button 
              onClick={() => scrollToBottom('smooth')}
              style={{
                position: 'absolute',
                bottom: '20px',
                right: '24px',
                backgroundColor: 'var(--primary)',
                color: '#000000',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 20
              }}
              title="Novas mensagens abaixo"
            >
              <ChevronDownIcon size={24} />
            </button>
          )}
        </div>

        <div className="chat-input-container">
          {isRecording ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', color: 'var(--danger)', fontWeight: 'bold' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--danger)', marginRight: 10, animation: 'pulse 1s infinite' }}></div>
              Gravando Áudio...
            </div>
          ) : (
            <input 
              type="text" 
              placeholder="Write Message" 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
          
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple onChange={handleFileUpload} />
          <input type="file" ref={mediaInputRef} style={{ display: 'none' }} accept="image/*,video/*" multiple onChange={handleFileUpload} />
          
          <div className="chat-input-actions" style={{ position: 'relative' }}>
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile size={20} /></button>
            
            {showEmojiPicker && (
              <div style={{ position: 'absolute', bottom: '60px', right: '0', zIndex: 50 }}>
                <Picker data={data} onEmojiSelect={onEmojiClick} theme="light" />
              </div>
            )}
            
            <button onClick={() => fileInputRef.current?.click()}><Attachment size={20} /></button>
            <button onClick={() => mediaInputRef.current?.click()}><ImageIcon size={20} /></button>
            
            {inputValue.trim() ? (
              <button className="send-btn" onClick={handleSend}><Send size={20} fill="currentColor" /></button>
            ) : isRecording ? (
              <button className="send-btn" onClick={stopRecording} style={{backgroundColor: 'var(--danger)'}}><Square size={20} fill="currentColor" /></button>
            ) : (
              <button className="send-btn" onClick={startRecording}><Mic size={20} /></button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
