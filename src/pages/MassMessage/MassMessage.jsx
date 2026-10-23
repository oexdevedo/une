import React, { useState, useEffect, useRef } from 'react';
import './MassMessage.css';
import {
  Users,
  Message,
  Sliders,
  Play,
  Refresh,
  Clock,
  Send,
  Attachment,
  Upload,
  Bulletlist,
  Plus,
  Calendar,
  FileText,
  ChartBarBig,
  Check,
  Close,
  WarningDiamond,
  Trash,
  Telegram,
  Smartphone
} from 'pixelarticons/react';
import { getWorkspaceId } from '../../utils/workspace';

export default function MassMessage() {
  const workspaceId = getWorkspaceId();
  const [activeTab, setActiveTab] = useState('mensagem');
  const [channel, setChannel] = useState('whatsapp'); // 'whatsapp' | 'telegram'
  const [waStatus, setWaStatus] = useState('disconnected');
  const [tgStatus, setTgStatus] = useState('disconnected');
  const [tgBotInfo, setTgBotInfo] = useState(null);
  const [isImportingChannel, setIsImportingChannel] = useState(false);

  const [messageText, setMessageText] = useState('Oi {primeiro_nome}! {Tudo bem?|Como vai?}\n\nAqui é a equipe Unne, passando para avisar sobre a nossa novidade.');
  const [previewText, setPreviewText] = useState('');
  
  // Listas e Contatos reais do banco
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [contacts, setContacts] = useState([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // Modal de Listas Salvas
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Modal de Templates
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);

  // Anexo e CSV
  const [attachment, setAttachment] = useState(null);
  const fileInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [defaultDdi, setDefaultDdi] = useState('66');

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/settings`)
      .then(res => res.json())
      .then(data => {
        if (data && data.default_ddi) setDefaultDdi(data.default_ddi);
      })
      .catch(() => {});
  }, [workspaceId]);

  // Configurações Anti-Ban
  const [minDelay, setMinDelay] = useState(15);
  const [maxDelay, setMaxDelay] = useState(40);
  const [batchSize, setBatchSize] = useState(15);
  const [batchPause, setBatchPause] = useState(60);

  // Disparo e Logs
  const [isDispatching, setIsDispatching] = useState(false);
  const isStopRequestedRef = useRef(false);
  const [dispatchLogs, setDispatchLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString('pt-BR'), type: 'info', text: 'Sistema pronto. Selecione uma lista de contatos e inicie o disparo.' }
  ]);
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0 });

  const handleStopDispatch = () => {
    isStopRequestedRef.current = true;
    const time = new Date().toLocaleTimeString('pt-BR');
    setDispatchLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      time,
      type: 'warning',
      text: '⏹️ Solicitação de interrupção recebida. Parando envio...'
    }]);
  };

  // 1. Carrega as Listas do Workspace
  const fetchLists = async (preferredId) => {
    setIsLoadingLists(true);
    try {
      const res = await fetch(`/api/lists?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLists(data);
        if (preferredId) {
          setSelectedListId(String(preferredId));
        } else if (data.length > 0 && !selectedListId) {
          setSelectedListId(String(data[0].id));
        }
      }
    } catch (err) {
      console.error('Erro ao buscar listas:', err);
    } finally {
      setIsLoadingLists(false);
    }
  };

  // 2. Carrega os Contatos da Lista Selecionada
  const fetchContacts = async (listId) => {
    if (!listId) {
      setContacts([]);
      return;
    }
    setIsLoadingContacts(true);
    try {
      const res = await fetch(`/api/contacts?workspace_id=${workspaceId}&list_id=${listId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setContacts(data);
      } else {
        setContacts([]);
      }
    } catch (err) {
      console.error('Erro ao carregar contatos da lista:', err);
      setContacts([]);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const fetchChannelStatuses = async () => {
    try {
      const [waRes, tgRes] = await Promise.all([
        fetch(`/api/connections/whatsapp?workspace_id=${workspaceId}`),
        fetch(`/api/connections/telegram?workspace_id=${workspaceId}`)
      ]);
      const waData = await waRes.json();
      const tgData = await tgRes.json();
      setWaStatus(waData.status || 'disconnected');
      setTgStatus(tgData.status || 'disconnected');
      if (tgData.botInfo) {
        setTgBotInfo(tgData.botInfo);
      }
    } catch (e) {
      console.error('Erro ao verificar status das conexões:', e);
    }
  };

  useEffect(() => {
    fetchLists();
    fetchChannelStatuses();
    const interval = setInterval(fetchChannelStatuses, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedListId) {
      fetchContacts(selectedListId);
    } else {
      setContacts([]);
    }
  }, [selectedListId]);

  // Importar contatos das conversas do WhatsApp ou Telegram para a lista selecionada
  const handleImportChannelContacts = async (targetChannel) => {
    if (!selectedListId) {
      alert('Selecione ou crie uma lista antes de importar contatos.');
      return;
    }
    const channelName = targetChannel === 'telegram' ? 'Telegram' : 'WhatsApp';
    setIsImportingChannel(true);
    try {
      const res = await fetch(`/api/lists/${selectedListId}/import-channel-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, channel: targetChannel })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${data.count} contato(s) do ${channelName} importado(s) para a lista com sucesso!`);
        fetchLists(selectedListId);
        fetchContacts(selectedListId);
      } else {
        alert('Erro ao importar contatos: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error(err);
      alert('Falha ao importar contatos do canal.');
    } finally {
      setIsImportingChannel(false);
    }
  };

  // Carrega Templates salvos
  useEffect(() => {
    if (isTemplateModalOpen) {
      fetch(`/api/templates?workspace_id=${workspaceId}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setSavedTemplates(data);
          } else {
            const st = localStorage.getItem(`unne_templates_ws_${workspaceId}`) || localStorage.getItem('unne_templates');
            if (st) {
              try { setSavedTemplates(JSON.parse(st)); } catch (e) {}
            }
          }
        })
        .catch(err => {
          console.error(err);
          const st = localStorage.getItem(`unne_templates_ws_${workspaceId}`) || localStorage.getItem('unne_templates');
          if (st) {
            try { setSavedTemplates(JSON.parse(st)); } catch (e) {}
          }
        });
    }
  }, [isTemplateModalOpen, workspaceId]);

  const handleLoadTemplate = (content) => {
    setMessageText(content);
    setIsTemplateModalOpen(false);
  };

  // Criação rápida de Lista
  const handleCreateList = async (e) => {
    if (e) e.preventDefault();
    if (!newListName.trim()) return;
    setIsCreatingList(true);
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, name: newListName.trim() })
      });
      const data = await res.json();
      if (data.success && data.id) {
        const createdId = data.id;
        setNewListName('');
        await fetchLists(createdId);
        setIsListModalOpen(false);
        alert('Lista criada com sucesso!');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao criar lista.');
    } finally {
      setIsCreatingList(false);
    }
  };

  // Exclusão de Lista
  const handleDeleteList = async (id, name) => {
    if (name === 'Agendados') {
      alert('A lista automática "Agendados" é gerenciada pelo sistema e não pode ser excluída.');
      return;
    }
    if (!confirm(`Deseja realmente excluir a lista "${name}" e todos os seus contatos?`)) return;
    try {
      const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (String(selectedListId) === String(id)) {
          setSelectedListId('');
        }
        fetchLists();
      } else {
        alert(data.error || 'Erro ao excluir lista.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir lista.');
    }
  };

  // Importação de CSV para a Lista Selecionada
  const handleImportCSV = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!selectedListId) {
      alert('Por favor, selecione ou crie uma lista antes de importar contatos.');
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) {
          alert('O arquivo selecionado está vazio.');
          return;
        }

        const parsePhone = (val) => {
          const raw = String(val || '').trim();
          const hasPlus = raw.startsWith('+');
          const digits = raw.replace(/\D/g, '');
          if (!digits) return '';
          return hasPlus ? `+${digits}` : digits;
        };

        const parsedContacts = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (i === 0 && /(nome|phone|telefone|contato|celular)/i.test(line)) {
            continue;
          }

          const parts = line.split(/[;,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
          let name = '';
          let phone = '';

          if (parts.length >= 2) {
            if (/\d{8,}/.test(parts[0].replace(/\D/g, ''))) {
              phone = parsePhone(parts[0]);
              name = parts[1];
            } else {
              name = parts[0];
              phone = parsePhone(parts[1]);
            }
          } else if (parts.length === 1) {
            phone = parsePhone(parts[0]);
            name = 'Contato ' + (i + 1);
          }

          if (phone && phone.replace(/\D/g, '').length >= 8) {
            parsedContacts.push({ name: name || 'Lead', phone });
          }
        }

        if (parsedContacts.length === 0) {
          alert('Nenhum contato com telefone válido foi encontrado no arquivo.');
          return;
        }

        const res = await fetch('/api/contacts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: workspaceId,
            list_id: selectedListId,
            contacts: parsedContacts
          })
        });
        const data = await res.json();
        if (data.success) {
          alert(`✅ ${data.count || parsedContacts.length} contatos importados com sucesso!`);
          fetchLists(selectedListId);
          fetchContacts(selectedListId);
        } else {
          alert('Erro ao importar contatos: ' + (data.error || 'Erro desconhecido'));
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao processar arquivo: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const variables = ['{primeiro_nome}', '{nome}', '{saudacao}', '{profissao}', '{regiao}', '{email}'];

  const parseSpintax = (text) => {
    let parsed = text;
    parsed = parsed.replace(/{primeiro_nome}/g, 'João');
    parsed = parsed.replace(/{nome}/g, 'João Silva');
    parsed = parsed.replace(/{saudacao}/g, 'Bom dia');
    
    const spintaxRegex = /\{([^{}]*)\}/g;
    parsed = parsed.replace(spintaxRegex, (match, contents) => {
      if (!contents.includes('|')) return match;
      const options = contents.split('|');
      const randomOption = options[Math.floor(Math.random() * options.length)];
      return randomOption;
    });
    
    return parsed;
  };

  useEffect(() => {
    setPreviewText(parseSpintax(messageText));
  }, [messageText]);

  const insertVariable = (variable) => {
    setMessageText(prev => prev + ' ' + variable);
  };

  const handleTestSpintax = () => {
    setPreviewText(parseSpintax(messageText));
  };

  // Motor de Disparo em Massa Multi-Canal (WhatsApp e Telegram)
  const handleStartDispatch = async () => {
    if (contacts.length === 0) {
      alert('A lista selecionada não possui contatos cadastrados para envio.');
      return;
    }
    if (!messageText.trim()) {
      alert('Escreva uma mensagem antes de iniciar o disparo.');
      return;
    }
    if (isDispatching) return;

    const channelName = channel === 'telegram' ? 'Telegram' : 'WhatsApp';

    // Validação estrita de conexão do canal selecionado
    if (channel === 'telegram' && tgStatus !== 'connected') {
      alert('⚠️ O Telegram está desconectado!\n\nAcesse o menu "Conexões" para conectar sua conta ou bot do Telegram antes de iniciar o disparo em massa.');
      return;
    } else if (channel === 'whatsapp' && waStatus !== 'connected') {
      alert('⚠️ O WhatsApp está desconectado!\n\nPara que as mensagens sejam entregues, acesse o menu "Conexões", escaneie o QR Code do WhatsApp e depois retorne para realizar o disparo.');
      return;
    }

    if (!confirm(`Deseja iniciar o disparo em massa para ${contacts.length} contatos via ${channelName}?`)) return;

    isStopRequestedRef.current = false;
    setIsDispatching(true);
    setActiveTab('logs');
    setStats({ total: contacts.length, sent: 0, failed: 0 });

    const addLog = (type, text) => {
      const time = new Date().toLocaleTimeString('pt-BR');
      setDispatchLogs(prev => [...prev, { id: Date.now() + Math.random(), time, type, text }]);
    };

    addLog('info', `🚀 Campanha iniciada via ${channelName} para ${contacts.length} contatos da lista.`);

    let sentCount = 0;
    let failCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      if (isStopRequestedRef.current) {
        addLog('warning', `⏹️ Disparo interrompido pelo usuário.`);
        break;
      }

      const contact = contacts[i];

      // Pausa Anti-Ban a cada lote de envios bem sucedidos
      if (sentCount > 0 && sentCount % batchSize === 0) {
        addLog('warning', `⏸️ Pausa anti-ban acionada: aguardando ${batchPause} segundos após ${batchSize} envios...`);
        for (let p = 0; p < batchPause; p++) {
          if (isStopRequestedRef.current) break;
          await new Promise(r => setTimeout(r, 1000));
        }
        if (isStopRequestedRef.current) break;
        addLog('info', `▶️ Retomando envios via ${channelName}...`);
      }

      try {
        let contactMsg = parseSpintax(messageText);
        const firstName = contact.name ? contact.name.split(' ')[0] : 'Cliente';
        contactMsg = contactMsg.replace(/{primeiro_nome}/g, firstName);
        contactMsg = contactMsg.replace(/{nome}/g, contact.name || 'Cliente');
        contactMsg = contactMsg.replace(/{email}/g, contact.email || '');

        let targetDest = '';
        if (channel === 'telegram') {
          let raw = String(contact.phone || contact.remote_jid || '').trim();
          if (!raw) {
            failCount++;
            addLog('error', `✗ [TELEGRAM] Ignorado: Contato ${contact.name} não possui número ou Chat ID cadastrado.`);
            setStats({ total: contacts.length, sent: sentCount, failed: failCount });
            continue;
          }
          if (raw.endsWith('@telegram')) {
            targetDest = raw;
          } else {
            let clean = raw.replace('@telegram', '').trim();
            targetDest = `${clean}@telegram`;
          }
        } else {
          let rawPhone = String(contact.phone || contact.remote_jid || '').trim();
          if (!rawPhone || rawPhone === '@s.whatsapp.net' || rawPhone === '@lid') {
            failCount++;
            addLog('error', `✗ [WHATSAPP] Ignorado: Contato ${contact.name} não possui número de telefone cadastrado.`);
            setStats({ total: contacts.length, sent: sentCount, failed: failCount });
            continue;
          }
          if (rawPhone.endsWith('@s.whatsapp.net') || rawPhone.endsWith('@lid')) {
            targetDest = rawPhone;
          } else {
            const hasPlus = rawPhone.startsWith('+');
            let digits = rawPhone.replace(/\D/g, '');
            if (!digits) {
              failCount++;
              addLog('error', `✗ [WHATSAPP] Ignorado: Número de telefone inválido para ${contact.name}.`);
              setStats({ total: contacts.length, sent: sentCount, failed: failCount });
              continue;
            }

            if (hasPlus) {
              if (digits.startsWith('66')) {
                let rest = digits.slice(2);
                if (rest.startsWith('0')) rest = rest.slice(1);
                targetDest = `66${rest}@s.whatsapp.net`;
              } else {
                targetDest = `${digits}@s.whatsapp.net`;
              }
            } else if (digits.startsWith('66')) {
              let rest = digits.slice(2);
              if (rest.startsWith('0')) rest = rest.slice(1);
              targetDest = `66${rest}@s.whatsapp.net`;
            } else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
              targetDest = `${digits}@s.whatsapp.net`;
            } else if (digits.startsWith('0') && (defaultDdi === '66' || !defaultDdi)) {
              // Tronco local da Tailândia: 08x, 09x, 06x
              targetDest = `66${digits.slice(1)}@s.whatsapp.net`;
            } else if (digits.length === 9 && ['8', '9', '6'].includes(digits[0]) && (defaultDdi === '66' || !defaultDdi)) {
              // Celular da Tailândia sem o zero inicial
              targetDest = `66${digits}@s.whatsapp.net`;
            } else if (defaultDdi === '55' && (digits.length === 10 || digits.length === 11)) {
              targetDest = `55${digits}@s.whatsapp.net`;
            } else if (defaultDdi && !digits.startsWith(defaultDdi)) {
              targetDest = `${defaultDdi}${digits}@s.whatsapp.net`;
            } else {
              targetDest = `${digits}@s.whatsapp.net`;
            }
          }
        }

        const displayDest = targetDest.replace('@s.whatsapp.net', '').replace('@telegram', '').replace('@lid', '');
        addLog('info', `[${i + 1}/${contacts.length}] [${channelName.toUpperCase()}] Enviando para ${contact.name} (${displayDest})...`);

        let res;
        if (attachment) {
          const formData = new FormData();
          formData.append('workspace_id', String(workspaceId));
          formData.append('to', targetDest);
          formData.append('contact_name', contact.name || '');
          formData.append('text', contactMsg);
          formData.append('file', attachment);
          res = await fetch('/api/messages/send', {
            method: 'POST',
            body: formData
          });
        } else {
          res = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: workspaceId,
              to: targetDest,
              contact_name: contact.name || '',
              text: contactMsg
            })
          });
        }

        const data = await res.json();

        if (data.success) {
          sentCount++;
          addLog('success', `✓ [${channelName.toUpperCase()}] Enviado com sucesso para ${contact.name} (${displayDest})`);
        } else {
          failCount++;
          const errDetail = data.error || 'Erro na resposta do servidor';
          addLog('error', `✗ [${channelName.toUpperCase()}] Falha ao enviar para ${contact.name}: ${errDetail}`);
          // Se o canal desconectou no meio do disparo, aborta imediatamente
          if (errDetail.toLowerCase().includes('desconectado') || errDetail.toLowerCase().includes('não está conectado')) {
            addLog('error', `🛑 [${channelName.toUpperCase()}] Disparo interrompido: o canal foi desconectado.`);
            alert(`O disparo foi interrompido porque o ${channelName} está desconectado.`);
            break;
          }
        }
      } catch (e) {
        failCount++;
        addLog('error', `✗ [${channelName.toUpperCase()}] Erro no envio para ${contact.name}: ${e.message}`);
      }

      setStats({ total: contacts.length, sent: sentCount, failed: failCount });

      if (i < contacts.length - 1 && !isStopRequestedRef.current) {
        const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        addLog('info', `⏳ Intervalo de segurança: aguardando ${delaySec}s...`);
        for (let s = 0; s < delaySec; s++) {
          if (isStopRequestedRef.current) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    addLog('success', `🎉 Disparo via ${channelName} finalizado! Total: ${contacts.length} | Enviados: ${sentCount} | Falhas: ${failCount}`);
    setIsDispatching(false);
  };

  const currentList = lists.find(l => String(l.id) === String(selectedListId));

  return (
    <div className="mass-container">
      
      {/* TOP NAVIGATION (TAB BAR) */}
      <div className="mass-tab-nav">
        <div className="tab-nav-left">
          <div className="brand-title">
            <Send size={24} style={{color: 'var(--primary)'}} />
            <h2>Msg em Massa</h2>
          </div>
        </div>
        <div className="tab-nav-center">
          <button 
            className={`tab-btn ${activeTab === 'mensagem' ? 'active' : ''}`}
            onClick={() => setActiveTab('mensagem')}
          >
            Mensagem
          </button>
          <button 
            className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuração
          </button>
          <button 
            className={`tab-btn ${activeTab === 'disparo' ? 'active' : ''}`}
            onClick={() => setActiveTab('disparo')}
          >
            Disparo
          </button>
          <button 
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Relatórios
          </button>
        </div>
        <div className="tab-nav-right">
          <div className="nav-badges" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span 
              className={`badge ${waStatus === 'connected' ? 'success' : 'light'}`}
              style={{ cursor: 'pointer', transition: 'all 0.2s' }}
              title="Clique para alternar envio para WhatsApp"
              onClick={() => setChannel('whatsapp')}
            >
              <Smartphone size={14} />
              WhatsApp {waStatus === 'connected' ? 'Conectado' : 'Desconectado'}
            </span>
            <span 
              className={`badge ${tgStatus === 'connected' ? 'info' : 'light'}`}
              style={{ 
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: tgStatus === 'connected' ? '#0369a1' : undefined, 
                backgroundColor: tgStatus === 'connected' ? '#e0f2fe' : undefined 
              }}
              title="Clique para alternar envio para Telegram"
              onClick={() => setChannel('telegram')}
            >
              <Telegram size={14} />
              Telegram {tgStatus === 'connected' ? (tgBotInfo?.username ? `@${tgBotInfo.username}` : 'Conectado') : 'Desconectado'}
            </span>
            <span 
              className="badge" 
              style={{ 
                backgroundColor: channel === 'whatsapp' ? '#16a34a' : '#0284c7', 
                color: '#ffffff', 
                fontWeight: 700 
              }}
            >
              Canal: {channel === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
            </span>
          </div>
        </div>
      </div>

      <div className="mass-content-area">
        
        {/* TAB 1: MENSAGEM */}
        {activeTab === 'mensagem' && (
          <div className="tab-pane active animated-fade">
            
            {/* SELETOR DE CANAL (WHATSAPP vs TELEGRAM) */}
            <div className="premium-card" style={{ marginBottom: '24px' }}>
              <div className="card-header" style={{ marginBottom: '16px' }}>
                <div className="card-title">
                  <Send size={20} /> Canal de Disparo da Campanha
                </div>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Selecione se a mensagem em massa sairá pelo WhatsApp ou pelo Telegram
                </span>
              </div>

              <div className="channel-selector-grid">
                {/* Opção WhatsApp */}
                <div 
                  className={`channel-card ${channel === 'whatsapp' ? 'active-whatsapp' : ''}`}
                  onClick={() => setChannel('whatsapp')}
                >
                  <div className="channel-info">
                    <div className="channel-icon whatsapp">
                      <Smartphone size={24} />
                    </div>
                    <div className="channel-meta">
                      <h4>WhatsApp</h4>
                      <p>Disparo direto para números de telefone com DDI e DDD</p>
                      <span className={`channel-status-pill ${waStatus === 'connected' ? 'connected' : 'disconnected'}`}>
                        {waStatus === 'connected' ? '● WhatsApp Conectado' : '○ Desconectado (Conectar na aba Conexões)'}
                      </span>
                    </div>
                  </div>
                  {channel === 'whatsapp' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#22c55e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={18} />
                    </div>
                  )}
                </div>

                {/* Opção Telegram */}
                <div 
                  className={`channel-card ${channel === 'telegram' ? 'active-telegram' : ''}`}
                  onClick={() => setChannel('telegram')}
                >
                  <div className="channel-info">
                    <div className="channel-icon telegram">
                      <Telegram size={24} />
                    </div>
                    <div className="channel-meta">
                      <h4>Telegram Bot</h4>
                      <p>Disparo via Bot do Telegram para Chat IDs ou @usuários</p>
                      <span className={`channel-status-pill ${tgStatus === 'connected' ? 'connected-tg' : 'disconnected'}`}>
                        {tgStatus === 'connected' ? `● ${tgBotInfo?.username ? '@' + tgBotInfo.username : 'Bot Conectado'}` : '○ Desconectado (Conectar na aba Conexões)'}
                      </span>
                    </div>
                  </div>
                  {channel === 'telegram' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#0284c7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={18} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mass-dashboard-2col">
              
              <div className="premium-card">
                <div className="card-header">
                  <div className="card-title"><Users size={20} /> Destinatários da Campanha</div>
                  <button className="btn-pill btn-light" onClick={() => setIsListModalOpen(true)}>
                    <Bulletlist size={14}/> Listas Salvas
                  </button>
                </div>
                
                <div className="form-group">
                  <label>Selecionar Lista de Contatos:</label>
                  <select 
                    className="modern-input"
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    disabled={isLoadingLists}
                  >
                    {lists.length === 0 ? (
                      <option value="">Nenhuma lista cadastrada (clique em Listas Salvas para criar)</option>
                    ) : (
                      lists.map(list => (
                        <option key={list.id} value={list.id}>
                          {list.is_system || list.name === 'Agendados' ? `📅 [Automática] ${list.name}` : list.name} ({list.count || 0} contatos)
                        </option>
                      ))
                    )}
                  </select>
                </div>
                
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'}}>
                  <span style={{fontSize: '0.85rem', color: '#a1a5b7'}}>
                    {isLoadingContacts ? 'Carregando contatos...' : `${contacts.length} contato(s) carregado(s)`}
                  </span>
                  
                  <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap'}}>
                    <input 
                      type="file" 
                      ref={csvInputRef} 
                      style={{display: 'none'}} 
                      accept=".csv,.txt"
                      onChange={handleImportCSV} 
                    />
                    <button className="btn-pill btn-light" onClick={() => csvInputRef.current?.click()} title="Importar arquivo CSV com contatos">
                      <Plus size={14}/> CSV
                    </button>
                    <button 
                      className="btn-pill btn-light" 
                      onClick={() => handleImportChannelContacts('whatsapp')}
                      disabled={isImportingChannel || !selectedListId}
                      title="Puxar contatos que interagiram pelo WhatsApp para esta lista"
                    >
                      <Smartphone size={14}/> Puxar WhatsApp
                    </button>
                    <button 
                      className="btn-pill btn-light" 
                      onClick={() => handleImportChannelContacts('telegram')}
                      disabled={isImportingChannel || !selectedListId}
                      title="Puxar contatos que interagiram pelo Telegram para esta lista"
                    >
                      <Telegram size={14}/> Puxar Telegram
                    </button>
                  </div>
                </div>

                {channel === 'telegram' ? (
                  <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd', fontSize: '0.82rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Telegram size={20} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <strong>Dica Telegram:</strong> Bots do Telegram só conseguem enviar mensagens para quem já enviou <code>/start</code> para o bot {tgBotInfo?.username ? (<a href={`https://t.me/${tgBotInfo.username}`} target="_blank" rel="noreferrer" style={{ color: '#0284c7', fontWeight: 700 }}>@{tgBotInfo.username}</a>) : ''}. Use o botão <strong>"Puxar Telegram"</strong> acima para sincronizar quem já interagiu com o bot!
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0', fontSize: '0.82rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Smartphone size={20} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>Dica WhatsApp:</strong> Sistema adaptado para múltiplos DDIs (Tailândia +66 com celulares 08x/09x/06x, Brasil +55 com 9º dígito/LID e internacional via +). Validação automática no WhatsApp antes do envio.
                    </div>
                  </div>
                )}
              </div>

              <div className="premium-card" style={{gridColumn: '1 / -1'}}>
                <div className="card-header">
                  <div className="card-title"><Message size={20} /> Compor Mensagem</div>
                  <button className="btn-pill btn-light" onClick={() => setIsTemplateModalOpen(true)}>
                    <Plus size={14}/> Carregar Template
                  </button>
                </div>
                
                <div className="form-group">
                  <textarea 
                    className="modern-input message-textarea"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="{Olá|Oi} {primeiro_nome}! Escreva sua mensagem aqui..."
                  />
                  
                  <div className="variables-bar">
                    {variables.map(v => (
                      <div key={v} className="var-tag" onClick={() => insertVariable(v)}>
                        + {v}
                      </div>
                    ))}
                    <div className="var-tag" style={{border: '1px dashed var(--primary)', color: 'var(--text-main)', backgroundColor: 'var(--primary-light)'}} onClick={() => insertVariable('{OpçãoA|OpçãoB}')}>
                      + Inserir Spintax
                    </div>
                  </div>
                </div>

                <div className="attachment-box">
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#3f4254', fontWeight: 600}}>
                    <Attachment size={18} /> 
                    {attachment ? (
                      <span style={{color: 'var(--primary-dark)', wordBreak: 'break-all'}}>{attachment.name}</span>
                    ) : (
                      <span>Anexar Arquivo (Mídia/Documento para WhatsApp e Telegram)</span>
                    )}
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{display: 'none'}} 
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileChange}
                  />
                  {attachment ? (
                    <button 
                      className="btn-pill btn-light" 
                      style={{color: '#ef4444', borderColor: '#fecaca'}} 
                      onClick={() => setAttachment(null)}
                    >
                      <Close size={16}/> Remover
                    </button>
                  ) : (
                    <button className="btn-pill btn-light" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={16}/> Escolher Mídia
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: CONFIGURAÇÃO */}
        {activeTab === 'config' && (
          <div className="tab-pane active animated-fade">
            <div className="premium-card" style={{maxWidth: '800px', margin: '0 auto'}}>
              <div className="card-header">
                <div className="card-title"><Sliders size={20} /> Configurações de Motor Anti-Ban & Rate Limits</div>
              </div>
              
              <p style={{color: '#a1a5b7', marginBottom: '32px', fontSize: '0.95rem'}}>
                Configure o comportamento do disparo para simular o uso humano e evitar bloqueios na sua conta de WhatsApp ou limites no Telegram.
              </p>
              
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Atraso Mínimo entre mensagens (segundos)</label>
                  <input 
                    type="number" 
                    className="modern-input" 
                    value={minDelay}
                    onChange={(e) => setMinDelay(Math.max(1, Number(e.target.value)))} 
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Atraso Máximo (segundos)</label>
                  <input 
                    type="number" 
                    className="modern-input" 
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(Math.max(minDelay, Number(e.target.value)))} 
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Pausar envio a cada (qtd de mensagens)</label>
                  <input 
                    type="number" 
                    className="modern-input" 
                    value={batchSize}
                    onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value)))} 
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Tempo de pausa em lote (segundos)</label>
                  <input 
                    type="number" 
                    className="modern-input" 
                    value={batchPause}
                    onChange={(e) => setBatchPause(Math.max(5, Number(e.target.value)))} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Canal e Linha de Remetente Ativa</label>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '16px 20px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  {channel === 'whatsapp' ? (
                    <>
                      <div className="channel-icon whatsapp" style={{ width: 38, height: 38 }}>
                        <Smartphone size={20} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#1e1e2d' }}>Linha WhatsApp (Principal)</div>
                        <div style={{ fontSize: '0.8rem', color: waStatus === 'connected' ? '#16a34a' : '#ef4444' }}>
                          ● {waStatus === 'connected' ? 'Sessão Baileys Conectada e Pronta' : 'Desconectado - Conecte na página Conexões'}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="channel-icon telegram" style={{ width: 38, height: 38 }}>
                        <Telegram size={20} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#1e1e2d' }}>Bot Telegram {tgBotInfo?.username ? `(@${tgBotInfo.username})` : ''}</div>
                        <div style={{ fontSize: '0.8rem', color: tgStatus === 'connected' ? '#0284c7' : '#ef4444' }}>
                          ● {tgStatus === 'connected' ? `Conectado como ${tgBotInfo?.first_name || 'Bot'}` : 'Desconectado - Conecte na página Conexões'}
                        </div>
                      </div>
                    </>
                  )}
                  <button className="btn-pill btn-light" onClick={() => setChannel(channel === 'whatsapp' ? 'telegram' : 'whatsapp')} style={{ fontSize: '0.8rem' }}>
                    Alternar para {channel === 'whatsapp' ? 'Telegram' : 'WhatsApp'}
                  </button>
                </div>
              </div>
              
              <div style={{marginTop: '24px', padding: '16px', backgroundColor: channel === 'telegram' ? '#f0f9ff' : '#fff8db', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start', border: channel === 'telegram' ? '1px solid #bae6fd' : '1px solid #fef08a'}}>
                {channel === 'telegram' ? (
                  <Telegram size={24} color="#0284c7" style={{flexShrink: 0}} />
                ) : (
                  <WarningDiamond size={24} color="#b48300" style={{flexShrink: 0}} />
                )}
                <div>
                  <h4 style={{margin: '0 0 4px 0', color: channel === 'telegram' ? '#0369a1' : '#b48300', fontSize: '0.95rem'}}>
                    {channel === 'telegram' ? 'Diretrizes de Segurança Telegram' : 'Recomendação de Segurança WhatsApp'}
                  </h4>
                  <p style={{margin: 0, color: channel === 'telegram' ? '#0c4a6e' : '#8c6600', fontSize: '0.85rem'}}>
                    {channel === 'telegram'
                      ? 'O Telegram Bot API permite até 30 mensagens por segundo em broadcasts globais e cerca de 1 mensagem por segundo por chat individual para evitar erros 429 Too Many Requests.'
                      : 'Para listas frias no WhatsApp, recomendamos enviar com intervalos de 15 a 40 segundos por mensagem e utilizar spintax ativamente para evitar denúncias ou bloqueios temporários.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DISPARO */}
        {activeTab === 'disparo' && (
          <div className="tab-pane active animated-fade">
            <div className="mass-dashboard-2col" style={{gridTemplateColumns: '1fr 1fr'}}>
              
              {/* Preview Box */}
              <div className="premium-card">
                 <div className="card-header">
                   <div className="card-title">
                     <FileText size={20} /> Preview da Mensagem ({channel === 'telegram' ? 'Telegram' : 'WhatsApp'})
                   </div>
                 </div>
                 
                 <div className={`preview-window ${channel === 'telegram' ? 'telegram' : ''}`}>
                    <div className="preview-top">
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                        <div style={{width: 36, height: 36, borderRadius: '50%', backgroundColor: 'white', color: channel === 'telegram' ? '#229ED9' : '#075E54', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'}}>
                          {channel === 'telegram' ? 'TG' : 'WA'}
                        </div>
                        <div>
                          <div style={{fontWeight: 600, fontSize: '0.95rem'}}>
                            {channel === 'telegram' ? (tgBotInfo?.first_name || 'Bot Telegram') : 'Exemplo de Lead'}
                          </div>
                          <div style={{fontSize: '0.75rem', opacity: 0.9}}>online</div>
                        </div>
                      </div>
                    </div>
                    <div className="preview-chat">
                      <div className="chat-bubble">
                        {previewText ? (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{previewText}</div>
                        ) : (
                          <span style={{color: '#667781', fontStyle: 'italic', fontSize: '0.85rem'}}>Clique no botão abaixo para gerar uma simulação com spintax e variáveis...</span>
                        )}
                      </div>
                    </div>
                 </div>
                 
                 <div style={{display: 'flex', justifyContent: 'center', marginTop: '24px'}}>
                    <button className="btn-pill btn-light" onClick={handleTestSpintax}>
                      <Refresh size={14}/> Gerar Variação Aleatória
                    </button>
                 </div>
              </div>

              {/* Action Box */}
              <div style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
                <div className="premium-card">
                  <div className="card-header">
                    <div className="card-title"><Clock size={20} /> Agendamento & Canal</div>
                  </div>
                  <p style={{fontSize: '0.9rem', color: '#a1a5b7', marginBottom: '8px'}}>
                    Lista selecionada: <strong>{currentList ? currentList.name : 'Nenhuma'}</strong>
                  </p>
                  <p style={{fontSize: '0.9rem', color: '#a1a5b7', marginBottom: '16px'}}>
                    Canal ativo: <strong style={{ color: channel === 'telegram' ? '#0284c7' : '#16a34a' }}>{channel === 'telegram' ? 'Telegram Bot' : 'WhatsApp'}</strong>
                  </p>
                  <input type="datetime-local" className="modern-input" />
                </div>
                
                <div className="premium-card" style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                  <div style={{textAlign: 'center', marginBottom: '24px'}}>
                    <div style={{fontSize: '3rem', fontWeight: 800, color: '#1e1e2d'}}>
                      {contacts.length}
                    </div>
                    <div style={{fontSize: '0.9rem', color: '#a1a5b7', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>
                      Contatos Prontos Para Envio
                    </div>
                    <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', backgroundColor: channel === 'telegram' ? '#e0f2fe' : '#dcfce7', color: channel === 'telegram' ? '#0369a1' : '#15803d', fontWeight: 700, fontSize: '0.85rem' }}>
                      {channel === 'telegram' ? <Telegram size={16}/> : <Smartphone size={16}/>}
                      Disparo configurado via {channel === 'telegram' ? 'Telegram' : 'WhatsApp'}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button 
                      className={`btn-huge ${channel === 'telegram' ? 'btn-telegram' : 'btn-whatsapp'}`}
                      onClick={handleStartDispatch}
                      disabled={isDispatching || contacts.length === 0}
                      style={{ opacity: (isDispatching || contacts.length === 0) ? 0.6 : 1 }}
                    >
                      <Send size={24} /> {isDispatching ? 'DISPARANDO MENSAGENS...' : `INICIAR DISPARO VIA ${channel.toUpperCase()}`}
                    </button>

                    {isDispatching && (
                      <button 
                        className="btn-huge"
                        onClick={handleStopDispatch}
                        style={{ background: '#DC2626', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
                        title="Interromper envio em massa imediatamente"
                      >
                        <Close size={24} /> PARAR DISPARO
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: RELATÓRIOS E LOGS */}
        {activeTab === 'logs' && (
          <div className="tab-pane active animated-fade">
            <div className="premium-card" style={{marginBottom: '24px'}}>
              <div className="card-header">
                <div className="card-title"><ChartBarBig size={20} /> Desempenho da Campanha</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {currentList ? currentList.name : 'Campanha Atual'}
                </div>
              </div>
              
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-value">{stats.total || contacts.length}</div>
                  <div className="stat-label">Total de Contatos</div>
                </div>
                <div className="stat-box success">
                  <div className="stat-value">{stats.sent}</div>
                  <div className="stat-label">Enviadas <Check size={14}/></div>
                </div>
                <div className="stat-box error">
                  <div className="stat-value">{stats.failed}</div>
                  <div className="stat-label">Falhas <Close size={14}/></div>
                </div>
              </div>
            </div>

            <div className="premium-card">
              <div className="card-header">
                <div className="card-title">Console de Logs em Tempo Real</div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {isDispatching && (
                    <button 
                      className="btn-pill"
                      style={{ background: '#FEE2E2', color: '#DC2626', borderColor: '#FCA5A5', fontWeight: 600 }}
                      onClick={handleStopDispatch}
                    >
                      <Close size={14} /> Parar Disparo
                    </button>
                  )}
                  <button 
                    className="btn-pill btn-light"
                    onClick={() => {
                      const csvContent = "data:text/csv;charset=utf-8," + dispatchLogs.map(l => `"${l.time}","${l.type}","${l.text}"`).join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", "logs_disparo.csv");
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    Exportar CSV
                  </button>
                </div>
              </div>
              
              <div className="logs-terminal">
                {dispatchLogs.map(log => (
                  <div key={log.id} className={`log-entry ${log.type}`}>
                    [{log.time}] {log.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* MODAL DE LISTAS SALVAS */}
      {isListModalOpen && (
        <div className="modal-overlay" onClick={() => setIsListModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h2>Gerenciar Listas de Contatos</h2>
              <button className="btn-icon" onClick={() => setIsListModalOpen(false)}>
                <Close size={24} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Formulário de Criação Rápida */}
              <form onSubmit={handleCreateList} style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  className="modern-input" 
                  placeholder="Nome da nova lista (ex: Leads Instagram)" 
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isCreatingList || !newListName.trim()}
                  style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
                >
                  {isCreatingList ? 'Criando...' : '+ Criar Lista'}
                </button>
              </form>

              {/* Lista de Listas Salvas */}
              <div>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Listas Disponíveis:</h4>
                {lists.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                    Nenhuma lista cadastrada ainda. Crie uma acima!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {lists.map(l => (
                      <div 
                        key={l.id} 
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          border: String(selectedListId) === String(l.id) ? '2px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '8px',
                          backgroundColor: String(selectedListId) === String(l.id) ? '#F0FDF4' : 'var(--surface)',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedListId(String(l.id));
                          setIsListModalOpen(false);
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>{l.name}</strong>
                            {(l.is_system || l.name === 'Agendados') && (
                              <span style={{ fontSize: '0.7rem', background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                Automática • Agenda
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {l.count || 0} contato(s)
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          <button 
                            className="btn-pill btn-light"
                            onClick={() => {
                              setSelectedListId(String(l.id));
                              setIsListModalOpen(false);
                            }}
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                          >
                            Selecionar
                          </button>
                          {!(l.is_system || l.name === 'Agendados') && (
                            <button 
                              className="btn-icon" 
                              title="Excluir lista"
                              onClick={() => handleDeleteList(l.id, l.name)}
                              style={{ color: '#EF4444', padding: '6px' }}
                            >
                              <Trash size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* MODAL DE TEMPLATES */}
      {isTemplateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTemplateModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Carregar Template</h2>
              <button className="btn-icon" onClick={() => setIsTemplateModalOpen(false)}>
                <Close size={24} />
              </button>
            </div>
            <div className="modal-body">
              {savedTemplates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                  Você ainda não salvou nenhum template. Crie-os na página Templates.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                  {savedTemplates.map(t => (
                    <div 
                      key={t.id} 
                      onClick={() => handleLoadTemplate(t.content)}
                      style={{ 
                        padding: '12px', 
                        border: '1px solid var(--border)', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        backgroundColor: 'var(--surface)',
                        transition: 'background 0.2s' 
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                    >
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'var(--text-main)' }}>{t.title || 'Sem título'}</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
