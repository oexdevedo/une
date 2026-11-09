import React, { useState, useEffect, useRef } from 'react';
import './MassMessage.css';
import {
  Users,
  Message,
  Sliders,
  Play,
  Pause,
  Refresh,
  Reload,
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
  Smartphone,
  Shield
} from 'pixelarticons/react';
import { getWorkspaceId } from '../../utils/workspace';
import { parseContactLines, resultToText } from '../../utils/contactParser';

export default function MassMessage() {
  const workspaceId = getWorkspaceId();
  const draftStorageKey = `unne_mass_draft_ws_${workspaceId}`;

  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const initialDraft = loadDraft();

  const [activeTab, setActiveTab] = useState(initialDraft.activeTab || 'mensagem');
  const [channel, setChannel] = useState(initialDraft.channel || 'whatsapp'); // 'whatsapp' | 'telegram'
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waConnectedCount, setWaConnectedCount] = useState(0);
  const [waSlots, setWaSlots] = useState([]);
  const [tgStatus, setTgStatus] = useState('disconnected');
  const [tgBotInfo, setTgBotInfo] = useState(null);
  const [isImportingChannel, setIsImportingChannel] = useState(false);

  const [messageText, setMessageText] = useState(
    initialDraft.messageText !== undefined
      ? initialDraft.messageText
      : 'Oi {primeiro_nome}! {Tudo bem?|Como vai?}\n\nAqui é a equipe Unne, passando para avisar sobre a nossa novidade.'
  );
  const [previewText, setPreviewText] = useState('');
  
  // Listas e Contatos reais do banco
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(initialDraft.selectedListId || '');
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

  // Configurações Anti-Ban Inteligentes
  const [minDelay, setMinDelay] = useState(initialDraft.minDelay || 25);
  const [maxDelay, setMaxDelay] = useState(initialDraft.maxDelay || 50);
  const [batchSize, setBatchSize] = useState(initialDraft.batchSize || 12);
  const [batchPause, setBatchPause] = useState(initialDraft.batchPause || 120);
  const [simulateTyping, setSimulateTyping] = useState(initialDraft.simulateTyping !== undefined ? initialDraft.simulateTyping : true);
  const [enableDailyLimit, setEnableDailyLimit] = useState(initialDraft.enableDailyLimit !== undefined ? initialDraft.enableDailyLimit : true);
  const [dailySafeLimit, setDailySafeLimit] = useState(initialDraft.dailySafeLimit || 35);

  // Persiste rascunho e configurações para não perder ao trocar de aba/página
  useEffect(() => {
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify({
        activeTab,
        channel,
        messageText,
        selectedListId,
        minDelay,
        maxDelay,
        batchSize,
        batchPause,
        simulateTyping,
        enableDailyLimit,
        dailySafeLimit
      }));
    } catch (e) {}
  }, [
    draftStorageKey,
    activeTab,
    channel,
    messageText,
    selectedListId,
    minDelay,
    maxDelay,
    batchSize,
    batchPause,
    simulateTyping,
    enableDailyLimit,
    dailySafeLimit
  ]);

  // Disparo, Pausa, Retomada e Logs
  const [isDispatching, setIsDispatching] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [resumeIndex, setResumeIndex] = useState(0);
  const [processedKeys, setProcessedKeys] = useState([]);
  const isStopRequestedRef = useRef(false);
  const isPauseRequestedRef = useRef(false);
  const sleepResolveRef = useRef(null);
  const [dispatchLogs, setDispatchLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString('pt-BR'), type: 'info', text: 'Sistema pronto. Selecione uma lista de contatos e inicie o disparo.' }
  ]);
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0 });

  const getCheckpointKey = (listId = selectedListId) => `unne_mass_checkpoint_ws_${workspaceId}_list_${listId}`;

  const getContactUniqueKey = (contact, idx) => {
    if (!contact) return `idx_${idx}`;
    return String(contact.id || contact.phone || contact.remote_jid || `idx_${idx}`);
  };

  const saveCheckpoint = (listId, data) => {
    if (!listId) return;
    try {
      localStorage.setItem(getCheckpointKey(listId), JSON.stringify({
        ...data,
        updatedAt: Date.now()
      }));
    } catch (e) {
      console.error('Erro ao salvar checkpoint de disparo:', e);
    }
  };

  const clearCheckpoint = (listId = selectedListId) => {
    if (!listId) return;
    try {
      localStorage.removeItem(getCheckpointKey(listId));
    } catch (e) {}
  };

  const interruptibleSleep = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => {
      sleepResolveRef.current = null;
      resolve();
    }, ms);
    sleepResolveRef.current = () => {
      clearTimeout(timer);
      sleepResolveRef.current = null;
      resolve();
    };
  });

  const applyServerCampaignState = (camp) => {
    if (!camp) return false;
    const isRunning = camp.status === 'running';
    const isPausedState = camp.status === 'paused' && camp.resumeIndex > 0;
    setIsDispatching(isRunning);
    setIsPaused(isPausedState);
    setResumeIndex(Number(camp.resumeIndex) || 0);
    setProcessedKeys(Array.isArray(camp.processedKeys) ? camp.processedKeys : []);
    setStats({
      total: Number(camp.total) || contacts.length,
      sent: Number(camp.sent) || 0,
      failed: Number(camp.failed) || 0
    });
    if (Array.isArray(camp.logs) && camp.logs.length > 0) {
      setDispatchLogs(camp.logs);
    }
    if (camp.resumeIndex > 0 || isPausedState || isRunning) {
      saveCheckpoint(camp.listId || selectedListId, {
        resumeIndex: Number(camp.resumeIndex) || 0,
        sent: Number(camp.sent) || 0,
        failed: Number(camp.failed) || 0,
        processedKeys: Array.isArray(camp.processedKeys) ? camp.processedKeys : [],
        channel: camp.channel || channel
      });
    } else if (camp.status === 'completed' || camp.status === 'idle') {
      clearCheckpoint(camp.listId || selectedListId);
    }
    return true;
  };

  const handlePauseDispatch = async () => {
    isPauseRequestedRef.current = true;
    if (sleepResolveRef.current) sleepResolveRef.current();
    try {
      const res = await fetch('/api/mass-dispatch/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, list_id: selectedListId })
      });
      const data = await res.json();
      if (data && data.campaign) {
        applyServerCampaignState(data.campaign);
        return;
      }
    } catch (e) {
      console.error('Erro ao pausar disparo no servidor:', e);
    }
    const time = new Date().toLocaleTimeString('pt-BR');
    setDispatchLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      time,
      type: 'warning',
      text: '⏸️ Solicitação de pausa recebida. Salvando posição atual da fila...'
    }]);
  };

  const handleStopDispatch = async () => {
    if (isDispatching && !confirm('Deseja encerrar o disparo e zerar o progresso desta lista? (Se quiser apenas pausar para continuar depois, clique em "Pausar Disparo").')) {
      return;
    }
    isStopRequestedRef.current = true;
    isPauseRequestedRef.current = false;
    if (sleepResolveRef.current) sleepResolveRef.current();
    clearCheckpoint(selectedListId);
    setIsPaused(false);
    setResumeIndex(0);
    setProcessedKeys([]);
    try {
      const res = await fetch('/api/mass-dispatch/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, list_id: selectedListId })
      });
      const data = await res.json();
      if (data && data.campaign) {
        applyServerCampaignState(data.campaign);
        return;
      }
    } catch (e) {
      console.error('Erro ao parar disparo no servidor:', e);
    }
    const time = new Date().toLocaleTimeString('pt-BR');
    setDispatchLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      time,
      type: 'warning',
      text: '⏹️ Solicitação de encerramento recebida. Parando envio e zerando fila...'
    }]);
  };

  const handleResetProgress = async () => {
    if (!confirm('Deseja descartar o progresso salvo e voltar a fila para o início (contato #1)?')) return;
    clearCheckpoint(selectedListId);
    setIsPaused(false);
    setResumeIndex(0);
    setProcessedKeys([]);
    setStats({ total: contacts.length, sent: 0, failed: 0 });
    try {
      const res = await fetch('/api/mass-dispatch/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, list_id: selectedListId })
      });
      const data = await res.json();
      if (data && data.campaign) {
        applyServerCampaignState(data.campaign);
        return;
      }
    } catch (e) {
      console.error('Erro ao zerar fila no servidor:', e);
    }
    const time = new Date().toLocaleTimeString('pt-BR');
    setDispatchLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      time,
      type: 'info',
      text: '🔄 Progresso reiniciado. O próximo disparo começará do primeiro contato da lista.'
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
      const [waRes, tgRes, tgUserRes] = await Promise.all([
        fetch(`/api/connections/whatsapp?workspace_id=${workspaceId}`),
        fetch(`/api/connections/telegram?workspace_id=${workspaceId}`),
        fetch(`/api/connections/telegram-user?workspace_id=${workspaceId}`).catch(() => null)
      ]);
      const waData = await waRes.json();
      const tgData = await tgRes.json();
      const tgUserData = tgUserRes && tgUserRes.ok ? await tgUserRes.json().catch(() => null) : null;

      setWaStatus(waData.status || 'disconnected');
      setWaConnectedCount(typeof waData.connectedCount === 'number' ? waData.connectedCount : (waData.status === 'connected' ? 1 : 0));
      if (Array.isArray(waData.slots)) {
        setWaSlots(waData.slots);
      }

      if (tgUserData && tgUserData.connected) {
        setTgStatus('connected');
        setTgBotInfo({
          username: tgUserData.username || tgUserData.phone || '',
          first_name: tgUserData.firstName || 'Minha Conta Telegram',
          isUserAccount: true
        });
      } else if (tgData && tgData.status === 'connected') {
        setTgStatus('connected');
        if (tgData.botInfo) {
          setTgBotInfo(tgData.botInfo);
        }
      } else {
        setTgStatus('disconnected');
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
      setIsPaused(false);
      setResumeIndex(0);
      setProcessedKeys([]);
    }
  }, [selectedListId]);

  // Sincroniza em tempo real com o motor de disparo em segundo plano no servidor
  // Assim o disparo continua ativo mesmo se o usuário navegar para outras abas/páginas ou fechar o navegador
  useEffect(() => {
    let isMounted = true;
    const syncWithServer = async () => {
      try {
        const res = await fetch(`/api/mass-dispatch/status?workspace_id=${workspaceId}&list_id=${selectedListId || ''}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data || !data.success) return;

        // Se existe uma campanha rodando em outra lista deste workspace e a lista atual não está rodando, seleciona a lista ativa
        if (
          data.activeInWorkspace &&
          data.activeInWorkspace.status === 'running' &&
          String(data.activeInWorkspace.listId) !== String(selectedListId)
        ) {
          setSelectedListId(String(data.activeInWorkspace.listId));
          applyServerCampaignState(data.activeInWorkspace);
          return;
        }

        if (data.campaign) {
          applyServerCampaignState(data.campaign);
        }
      } catch (e) {}
    };

    syncWithServer();
    const timer = setInterval(syncWithServer, 1500);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [workspaceId, selectedListId, contacts.length]);

  // Restaura progresso salvo (checkpoint local) sempre que a lista de contatos carregada mudar
  useEffect(() => {
    if (!selectedListId || contacts.length === 0 || isDispatching) return;
    try {
      const raw = localStorage.getItem(getCheckpointKey(selectedListId));
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved.resumeIndex === 'number' && saved.resumeIndex > 0 && saved.resumeIndex < contacts.length) {
          setIsPaused(true);
          setResumeIndex(saved.resumeIndex);
          setProcessedKeys(Array.isArray(saved.processedKeys) ? saved.processedKeys : []);
          setStats({
            total: contacts.length,
            sent: saved.sent || 0,
            failed: saved.failed || 0
          });
          if (saved.channel === 'whatsapp' || saved.channel === 'telegram') {
            setChannel(saved.channel);
          }
          return;
        }
      }
    } catch (e) {
      console.error('Erro ao ler checkpoint salvo:', e);
    }
    setIsPaused(false);
    setResumeIndex(0);
    setProcessedKeys([]);
    setStats({ total: contacts.length, sent: 0, failed: 0 });
  }, [selectedListId, contacts.length]);

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
        const text = resultToText(event.target.result);
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

        const parsedContacts = parseContactLines(lines);

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
    if (/\.xlsx?$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
    e.target.value = null;
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const variables = ['{primeiro_nome}', '{nome}', '{saudacao}', '{telefone}', '{email}', '{profissao}', '{regiao}'];

  // Resolve sintaxe Spintax {Opção A|Opção B|Opção C} isoladamente (sem alterar variáveis como {nome})
  const resolveSpintax = (text) => {
    if (!text) return '';
    const spintaxRegex = /\{([^{}]+)\}/g;
    let result = text;
    let iterations = 0;
    while (spintaxRegex.test(result) && iterations < 10) {
      result = result.replace(spintaxRegex, (match, contents) => {
        if (!contents.includes('|')) return match; // Mantém tags {nome}, {saudacao}, etc.
        const options = contents.split('|');
        const randomOption = options[Math.floor(Math.random() * options.length)];
        return randomOption;
      });
      iterations++;
    }
    return result;
  };

  // Formata a mensagem com dados reais de cada contato individual da lista
  const formatMessageForContact = (template, contact) => {
    if (!template) return '';

    // 1. Resolve o Spintax primeiro (permite variações com tags de contato)
    let parsed = resolveSpintax(template);

    // 2. Extrai nome do contato com fallback
    const rawName = (contact?.name || '').trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : 'Cliente';
    const fullName = rawName || 'Cliente';

    // 3. Saudação dinâmica de acordo com o horário (Bom dia / Boa tarde / Boa noite)
    const hour = new Date().getHours();
    const saudacao = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';

    // 4. Substituição case-insensitive de variáveis
    parsed = parsed.replace(/\{(?:primeiro[_\s]?nome|first[_\s]?name)\}/gi, firstName);
    parsed = parsed.replace(/\{(?:nome|name)\}/gi, fullName);
    parsed = parsed.replace(/\{(?:saudacao|saudação|greeting)\}/gi, saudacao);
    parsed = parsed.replace(/\{(?:telefone|phone|celular)\}/gi, contact?.phone || '');
    parsed = parsed.replace(/\{(?:email)\}/gi, contact?.email || '');
    parsed = parsed.replace(/\{(?:profissao|profissão|cargo)\}/gi, contact?.profession || contact?.cargo || '');
    parsed = parsed.replace(/\{(?:regiao|região|cidade)\}/gi, contact?.region || contact?.cidade || '');

    return parsed;
  };

  const getPreviewContact = () => {
    if (contacts && contacts.length > 0 && contacts[0]?.name) {
      return contacts[0];
    }
    return {
      name: 'João Silva',
      phone: '11999999999',
      email: 'joao.silva@exemplo.com'
    };
  };

  useEffect(() => {
    const previewContact = getPreviewContact();
    setPreviewText(formatMessageForContact(messageText, previewContact));
  }, [messageText, contacts]);

  const insertVariable = (variable) => {
    setMessageText(prev => prev + ' ' + variable);
  };

  const handleTestSpintax = () => {
    const previewContact = getPreviewContact();
    setPreviewText(formatMessageForContact(messageText, previewContact));
  };

  // Motor de Disparo em Massa Multi-Canal (WhatsApp e Telegram) com suporte a Pausar e Retomar
  const handleStartDispatch = async (options = {}) => {
    const isResuming = Boolean(options && options.resume === true && resumeIndex > 0 && resumeIndex < contacts.length);

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

    const startIdx = isResuming ? resumeIndex : 0;
    const remainingCount = contacts.length - startIdx;

    const confirmMsg = isResuming
      ? `Deseja retomar o disparo de onde parou (a partir do contato #${startIdx + 1}, faltando ${remainingCount} de ${contacts.length} contatos) via ${channelName}?`
      : `Deseja iniciar o disparo em massa para ${contacts.length} contatos via ${channelName}?`;

    if (!confirm(confirmMsg)) return;

    isStopRequestedRef.current = false;
    isPauseRequestedRef.current = false;
    setIsDispatching(true);
    setIsPaused(false);
    setActiveTab('logs');

    // Inicia o disparo em segundo plano no servidor para que continue rodando mesmo se o usuário sair da aba ou fechar o navegador
    try {
      let startRes;
      if (attachment) {
        const formData = new FormData();
        formData.append('workspace_id', String(workspaceId));
        formData.append('list_id', String(selectedListId));
        formData.append('channel', channel);
        formData.append('message_text', messageText);
        formData.append('resume', String(isResuming));
        formData.append('min_delay', String(minDelay));
        formData.append('max_delay', String(maxDelay));
        formData.append('batch_size', String(batchSize));
        formData.append('batch_pause', String(batchPause));
        formData.append('simulate_typing', String(simulateTyping));
        formData.append('enable_daily_limit', String(enableDailyLimit));
        formData.append('daily_safe_limit', String(dailySafeLimit));
        formData.append('default_ddi', String(defaultDdi));
        formData.append('file', attachment);
        startRes = await fetch('/api/mass-dispatch/start', {
          method: 'POST',
          body: formData
        });
      } else {
        startRes = await fetch('/api/mass-dispatch/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: workspaceId,
            list_id: selectedListId,
            channel,
            message_text: messageText,
            resume: isResuming,
            min_delay: minDelay,
            max_delay: maxDelay,
            batch_size: batchSize,
            batch_pause: batchPause,
            simulate_typing: simulateTyping,
            enable_daily_limit: enableDailyLimit,
            daily_safe_limit: dailySafeLimit,
            default_ddi: defaultDdi
          })
        });
      }

      if (startRes && startRes.ok) {
        const startData = await startRes.json();
        if (startData && startData.success && startData.campaign) {
          applyServerCampaignState(startData.campaign);
          return;
        }
      }
    } catch (serverErr) {
      console.warn('Fallback para disparo local:', serverErr);
    }

    let sentCount = isResuming ? (stats.sent || 0) : 0;
    let failCount = isResuming ? (stats.failed || 0) : 0;
    let sessionSentCount = 0; // Contagem desta sessão para permitir retomar mesmo após trava diária
    const sentSet = new Set(isResuming ? processedKeys : []);

    if (!isResuming) {
      clearCheckpoint(selectedListId);
      setResumeIndex(0);
      setProcessedKeys([]);
      setStats({ total: contacts.length, sent: 0, failed: 0 });
    } else {
      setStats({ total: contacts.length, sent: sentCount, failed: failCount });
    }

    const addLog = (type, text) => {
      const time = new Date().toLocaleTimeString('pt-BR');
      setDispatchLogs(prev => [...prev, { id: Date.now() + Math.random(), time, type, text }]);
    };

    if (isResuming) {
      addLog('info', `▶️ Retomando campanha via ${channelName} a partir do contato #${startIdx + 1} (${remainingCount} restantes de ${contacts.length}).`);
    } else {
      addLog('info', `🚀 Campanha iniciada via ${channelName} para ${contacts.length} contatos da lista.`);
    }

    let pausedAtIndex = null;

    for (let i = startIdx; i < contacts.length; i++) {
      if (isStopRequestedRef.current) {
        addLog('warning', `⏹️ Disparo encerrado pelo usuário.`);
        break;
      }

      if (isPauseRequestedRef.current) {
        pausedAtIndex = i;
        addLog('warning', `⏸️ Disparo pausado no contato #${i + 1} de ${contacts.length}. Você pode retomar de onde parou quando desejar.`);
        break;
      }

      const contact = contacts[i];
      const contactKey = getContactUniqueKey(contact, i);

      // Evita reenviar caso o contato já tenha sido processado nesta campanha
      if (sentSet.has(contactKey)) {
        continue;
      }

      // Verificação de Opt-out (Anti-Ban: não envia para contatos que pediram cancelamento)
      if (channel === 'whatsapp' && contact.status === 'Opt-out') {
        addLog('warning', `⏭️ [WHATSAPP] Ignorado: Contato ${contact.name} solicitou Opt-out previamente.`);
        sentSet.add(contactKey);
        saveCheckpoint(selectedListId, {
          resumeIndex: i + 1,
          sent: sentCount,
          failed: failCount,
          processedKeys: Array.from(sentSet),
          channel
        });
        setResumeIndex(i + 1);
        setProcessedKeys(Array.from(sentSet));
        continue;
      }

      // Trava de Segurança Diária Anti-Ban (Pausa automaticamente salvando posição para continuar depois)
      if (channel === 'whatsapp' && enableDailyLimit && sessionSentCount >= dailySafeLimit) {
        pausedAtIndex = i;
        addLog('warning', `🛡️ [ANTI-BAN] Trava de segurança atingida (${dailySafeLimit} envios nesta etapa). Disparo pausado no contato #${i + 1} para proteger seu número — você pode retomar de onde parou depois.`);
        alert(`🛡️ Trava de Segurança Anti-Ban Ativada!\n\nForam disparadas ${sessionSentCount} mensagens nesta etapa (${sentCount} no total). O disparo foi PAUSADO com segurança no contato #${i + 1}.\n\nQuando quiser continuar para os ${contacts.length - i} contatos restantes, basta clicar em "Continuar de onde parou".`);
        break;
      }

      // Pausa Anti-Ban a cada lote de envios bem sucedidos nesta etapa
      if (sessionSentCount > 0 && sessionSentCount % batchSize === 0) {
        addLog('warning', `⏸️ Pausa anti-ban automática: aguardando ${batchPause} segundos após ${batchSize} envios...`);
        for (let p = 0; p < batchPause; p++) {
          if (isStopRequestedRef.current || isPauseRequestedRef.current) break;
          await interruptibleSleep(1000);
        }
        if (isStopRequestedRef.current) {
          addLog('warning', `⏹️ Disparo encerrado pelo usuário.`);
          break;
        }
        if (isPauseRequestedRef.current) {
          pausedAtIndex = i;
          addLog('warning', `⏸️ Disparo pausado no contato #${i + 1} de ${contacts.length}. Você pode retomar de onde parou quando desejar.`);
          break;
        }
        addLog('info', `▶️ Retomando envios via ${channelName}...`);
      }

      let channelDisconnected = false;

      try {
        const contactMsg = formatMessageForContact(messageText, contact);

        let targetDest = '';
        if (channel === 'telegram') {
          let raw = String(contact.phone || contact.remote_jid || '').trim();
          if (!raw) {
            failCount++;
            addLog('error', `✗ [TELEGRAM] Ignorado: Contato ${contact.name} não possui número ou Chat ID cadastrado.`);
            sentSet.add(contactKey);
            setStats({ total: contacts.length, sent: sentCount, failed: failCount });
            saveCheckpoint(selectedListId, {
              resumeIndex: i + 1,
              sent: sentCount,
              failed: failCount,
              processedKeys: Array.from(sentSet),
              channel
            });
            setResumeIndex(i + 1);
            setProcessedKeys(Array.from(sentSet));
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
            sentSet.add(contactKey);
            setStats({ total: contacts.length, sent: sentCount, failed: failCount });
            saveCheckpoint(selectedListId, {
              resumeIndex: i + 1,
              sent: sentCount,
              failed: failCount,
              processedKeys: Array.from(sentSet),
              channel
            });
            setResumeIndex(i + 1);
            setProcessedKeys(Array.from(sentSet));
            continue;
          }
          if (rawPhone.endsWith('@s.whatsapp.net') || rawPhone.endsWith('@lid')) {
            targetDest = rawPhone;
          } else {
            const hasPlus = rawPhone.startsWith('+') || rawPhone.startsWith('00');
            let digits = rawPhone.replace(/^00/, '').replace(/\D/g, '');
            if (!digits) {
              failCount++;
              addLog('error', `✗ [WHATSAPP] Ignorado: Número de telefone inválido para ${contact.name}.`);
              sentSet.add(contactKey);
              setStats({ total: contacts.length, sent: sentCount, failed: failCount });
              saveCheckpoint(selectedListId, {
                resumeIndex: i + 1,
                sent: sentCount,
                failed: failCount,
                processedKeys: Array.from(sentSet),
                channel
              });
              setResumeIndex(i + 1);
              setProcessedKeys(Array.from(sentSet));
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
            } else if (digits.startsWith('66') && digits.length >= 10 && digits.length <= 12) {
              let rest = digits.slice(2);
              if (rest.startsWith('0')) rest = rest.slice(1);
              targetDest = `66${rest}@s.whatsapp.net`;
            } else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
              targetDest = `${digits}@s.whatsapp.net`;
            } else if (digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
              // Tronco local da Tailândia: 08x, 09x, 06x
              targetDest = `66${digits.slice(1)}@s.whatsapp.net`;
            } else if (digits.length === 9 && ['8', '9', '6'].includes(digits[0]) && defaultDdi === '66') {
              // Celular da Tailândia sem o zero inicial
              targetDest = `66${digits}@s.whatsapp.net`;
            } else if (digits.length >= 12) {
              // Número internacional completo sem + (ex: Portugal 351..., Reino Unido 44..., Alemanha 49..., Argentina 54...)
              targetDest = `${digits}@s.whatsapp.net`;
            } else if (digits.length === 11 && digits.startsWith('1') && !['11','12','13','14','15','16','17','18','19'].includes(digits.slice(0, 2))) {
              // EUA / Canadá sem + (11 dígitos começando com 1)
              targetDest = `${digits}@s.whatsapp.net`;
            } else if (digits.length === 11 && (digits.startsWith('34') || digits.startsWith('33') || digits.startsWith('56'))) {
              // Espanha (34), França (33) ou Chile (56)
              targetDest = `${digits}@s.whatsapp.net`;
            } else if (defaultDdi === '55' && (digits.length === 10 || (digits.length === 11 && digits[2] === '9'))) {
              // Brasil local (DDD + 8 ou 9 dígitos)
              targetDest = `55${digits}@s.whatsapp.net`;
            } else if (defaultDdi && digits.length <= 10) {
              let rest = digits;
              if (defaultDdi === '66' && rest.startsWith('0')) rest = rest.slice(1);
              targetDest = `${defaultDdi}${rest}@s.whatsapp.net`;
            } else {
              targetDest = `${digits}@s.whatsapp.net`;
            }
          }
        }

        const displayDest = targetDest.replace('@s.whatsapp.net', '').replace('@telegram', '').replace('@lid', '');
        if (channel === 'whatsapp' && simulateTyping) {
          addLog('info', `✍️ [${channelName.toUpperCase()}] Simulando presença "Digitando..." para ${contact.name}...`);
        }
        addLog('info', `[${i + 1}/${contacts.length}] [${channelName.toUpperCase()}] Enviando para ${contact.name} (${displayDest})...`);

        let res;
        if (attachment) {
          const formData = new FormData();
          formData.append('workspace_id', String(workspaceId));
          formData.append('to', targetDest);
          formData.append('contact_name', contact.name || '');
          formData.append('text', contactMsg);
          formData.append('file', attachment);
          formData.append('simulate_typing', String(simulateTyping));
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
              text: contactMsg,
              simulate_typing: simulateTyping
            })
          });
        }

        const data = await res.json();

        if (data.success) {
          sentCount++;
          sessionSentCount++;
          sentSet.add(contactKey);
          addLog('success', `✓ [${channelName.toUpperCase()}] Enviado com sucesso para ${contact.name} (${displayDest})`);
        } else {
          const errDetail = data.error || 'Erro na resposta do servidor';
          // Se o canal desconectou no meio do disparo, pausa no contato atual sem marcá-lo como concluído
          if (errDetail.toLowerCase().includes('desconectado') || errDetail.toLowerCase().includes('não está conectado')) {
            pausedAtIndex = i;
            channelDisconnected = true;
            addLog('error', `🛑 [${channelName.toUpperCase()}] Disparo pausado no contato #${i + 1}: o canal foi desconectado. Reconecte e clique em "Continuar de onde parou".`);
            alert(`O disparo foi pausado no contato #${i + 1} porque o ${channelName} desconectou. Reconecte o canal e clique em "Continuar de onde parou".`);
          } else {
            failCount++;
            sentSet.add(contactKey);
            addLog('error', `✗ [${channelName.toUpperCase()}] Falha ao enviar para ${contact.name}: ${errDetail}`);
          }
        }
      } catch (e) {
        failCount++;
        sentSet.add(contactKey);
        addLog('error', `✗ [${channelName.toUpperCase()}] Erro no envio para ${contact.name}: ${e.message}`);
      }

      setStats({ total: contacts.length, sent: sentCount, failed: failCount });

      if (channelDisconnected) {
        break;
      }

      // Salva checkpoint após cada contato processado
      const nextIdx = i + 1;
      if (nextIdx < contacts.length) {
        saveCheckpoint(selectedListId, {
          resumeIndex: nextIdx,
          sent: sentCount,
          failed: failCount,
          processedKeys: Array.from(sentSet),
          channel
        });
        setResumeIndex(nextIdx);
        setProcessedKeys(Array.from(sentSet));
      }

      if (isPauseRequestedRef.current) {
        pausedAtIndex = nextIdx;
        if (pausedAtIndex < contacts.length) {
          addLog('warning', `⏸️ Disparo pausado após o contato #${i + 1}. Próximo da fila: #${pausedAtIndex + 1} (${contacts[pausedAtIndex]?.name || 'Contato'}).`);
        }
        break;
      }

      if (i < contacts.length - 1 && !isStopRequestedRef.current) {
        const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        addLog('info', `⏳ Intervalo de segurança: aguardando ${delaySec}s...`);
        for (let s = 0; s < delaySec; s++) {
          if (isStopRequestedRef.current || isPauseRequestedRef.current) break;
          await interruptibleSleep(1000);
        }
        if (isPauseRequestedRef.current) {
          pausedAtIndex = i + 1;
          addLog('warning', `⏸️ Disparo pausado no intervalo. Próximo contato ao retomar: #${pausedAtIndex + 1} (${contacts[pausedAtIndex]?.name || 'Contato'}).`);
          break;
        }
      }
    }

    if (isStopRequestedRef.current) {
      clearCheckpoint(selectedListId);
      setIsPaused(false);
      setResumeIndex(0);
      setProcessedKeys([]);
    } else if (pausedAtIndex !== null && pausedAtIndex < contacts.length) {
      saveCheckpoint(selectedListId, {
        resumeIndex: pausedAtIndex,
        sent: sentCount,
        failed: failCount,
        processedKeys: Array.from(sentSet),
        channel
      });
      setIsPaused(true);
      setResumeIndex(pausedAtIndex);
      setProcessedKeys(Array.from(sentSet));
    } else {
      clearCheckpoint(selectedListId);
      setIsPaused(false);
      setResumeIndex(0);
      setProcessedKeys([]);
      addLog('success', `🎉 Disparo via ${channelName} finalizado! Total: ${contacts.length} | Enviados: ${sentCount} | Falhas: ${failCount}`);
    }

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
          <div className="nav-badges">
            <span 
              className={`badge ${waStatus === 'connected' ? 'success' : 'light'}`}
              style={{ cursor: 'pointer', transition: 'all 0.2s' }}
              title="Clique para alternar envio para WhatsApp"
              onClick={() => setChannel('whatsapp')}
            >
              <Smartphone size={14} />
              WhatsApp: {waStatus === 'connected' ? `${waConnectedCount || 1}/5 Conectado(s)` : 'Off'}
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
              Telegram: {tgStatus === 'connected' ? (tgBotInfo?.username ? `@${tgBotInfo.username}` : 'Conectado') : 'Off'}
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
                      <h4>WhatsApp (Até 5 Linhas em Rodízio)</h4>
                      <p>Disparo direto alternando entre todos os números conectados</p>
                      <span className={`channel-status-pill ${waStatus === 'connected' ? 'connected' : 'disconnected'}`}>
                        {waStatus === 'connected'
                          ? `● ${waConnectedCount || 1}/5 Linha(s) Conectada(s)${waConnectedCount > 1 ? ' (Rodízio Ativo)' : ''}`
                          : '○ Desconectado (Conectar até 5 linhas na aba Conexões)'}
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

            {/* DESTINATÁRIOS DA CAMPANHA */}
            <div className="premium-card" style={{ marginBottom: '24px' }}>
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
                    accept=".csv,.txt,.xlsx,.xls"
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

            {/* COMPOR MENSAGEM */}
            <div className="premium-card">
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
                  <div 
                    className="var-tag" 
                    style={{ border: '1px solid #fed7aa', color: '#c2410c', backgroundColor: '#fff7ed', fontWeight: 600 }}
                    onClick={() => setMessageText(prev => prev.trim() + '\n\n_Para não receber mais mensagens, responda SAIR._')}
                    title="Adiciona aviso de cancelamento no rodapé para evitar que o lead clique em Denunciar Spam"
                  >
                    + Opt-out (Responda SAIR)
                  </div>
                </div>

                {channel === 'whatsapp' && (!messageText.includes('{') || !messageText.includes('|')) && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#92400e' }}>
                    <WarningDiamond size={18} style={{ flexShrink: 0, color: '#d97706' }} />
                    <div>
                      <strong>Aviso Anti-Ban:</strong> Sua mensagem não possui variações (Spintax). Enviar o mesmo texto idêntico para dezenas de contatos é uma das principais causas de bloqueio no WhatsApp. Recomendamos usar <code>{'{Olá|Oi|Como vai}'}</code>.
                    </div>
                  </div>
                )}
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

              {/* CONTROLES AVANÇADOS DE ANTI-BAN */}
              <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={18} color="#16a34a" /> Recursos Ativos de Proteção da Conta
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={simulateTyping} 
                    onChange={(e) => setSimulateTyping(e.target.checked)} 
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>Simular Digitação Humana ('Digitando...' / 'Gravando...')</span>
                    <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                      Envia pacotes de presença para o WhatsApp antes de cada envio, aguardando um intervalo realista de acordo com a extensão da mensagem.
                    </p>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={enableDailyLimit} 
                    onChange={(e) => setEnableDailyLimit(e.target.checked)} 
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>Trava Diária Anti-Ban (Chips Novos / Em Maturação)</span>
                    <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                      Interrompe o envio automaticamente ao atingir o limite estipulado abaixo para proteger seu número contra o banimento automático de 50 mensagens.
                    </p>
                  </div>
                </label>

                {enableDailyLimit && (
                  <div style={{ paddingLeft: '26px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Limite seguro de envios por campanha (Recomendado: 25 a 35 para chips novos):
                    </label>
                    <input 
                      type="number" 
                      className="modern-input" 
                      style={{ maxWidth: '160px', padding: '6px 10px', fontSize: '0.85rem' }}
                      value={dailySafeLimit}
                      onChange={(e) => setDailySafeLimit(Math.max(5, Number(e.target.value)))}
                    />
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '20px' }}>
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
              
              {/* GUIA COMPLETO ANTI-BAN */}
              <div style={{marginTop: '24px', padding: '18px', backgroundColor: '#f0fdf4', borderRadius: '14px', display: 'flex', gap: '14px', alignItems: 'flex-start', border: '1px solid #bbf7d0'}}>
                <Shield size={24} color="#16a34a" style={{flexShrink: 0, marginTop: '2px'}} />
                <div>
                  <h4 style={{margin: '0 0 6px 0', color: '#15803d', fontSize: '0.98rem'}}>
                    🛡️ Por que o WhatsApp bloqueia por volta de 50 mensagens?
                  </h4>
                  <p style={{margin: '0 0 10px 0', color: '#166534', fontSize: '0.85rem', lineHeight: '1.5'}}>
                    O algoritmo da Meta possui um <strong>limite heurístico estrito</strong> para contatos desconhecidos. Quando um número envia 40 a 50 mensagens frias (para quem não tem o número na agenda) sem interação bidirecional, <strong>apenas 2 a 3 cliques no botão "Denunciar Spam"</strong> acionam o banimento imediato.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginTop: '12px' }}>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7', fontSize: '0.8rem', color: '#14532d' }}>
                      <strong>1. Maturação de Chip (Warm-up):</strong> Nunca inicie com 50 envios em chips com menos de 20 dias. Comece com 15 a 20 e aumente gradualmente.
                    </div>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7', fontSize: '0.8rem', color: '#14532d' }}>
                      <strong>2. Spintax Obrigatório:</strong> Use variações <code>{'{Olá|Oi|Tudo bem}'}</code>. Mensagens com o mesmo hash idêntico são rotuladas como robô pelo WhatsApp.
                    </div>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7', fontSize: '0.8rem', color: '#14532d' }}>
                      <strong>3. Cláusula de Opt-out:</strong> Adicione "Responda SAIR". Quando a pessoa responde SAIR, o sistema a bloqueia no CRM e você evita a denúncia.
                    </div>
                    <div style={{ background: '#ffffff', padding: '10px', borderRadius: '8px', border: '1px solid #dcfce7', fontSize: '0.8rem', color: '#14532d' }}>
                      <strong>4. Intervalos Amplos:</strong> Mantenha o atraso entre 25s e 50s com pausas de 2 a 3 minutos a cada lote de 12 mensagens.
                    </div>
                  </div>
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
                            {channel === 'telegram' 
                              ? (tgBotInfo?.first_name || 'Bot Telegram') 
                              : (contacts.length > 0 && contacts[0]?.name ? `${contacts[0].name} (1º contato da lista)` : 'Exemplo de Contato')}
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
                  <div style={{textAlign: 'center', marginBottom: '20px'}}>
                    <div style={{fontSize: '3rem', fontWeight: 800, color: '#1e1e2d'}}>
                      {isPaused && resumeIndex > 0 && resumeIndex < contacts.length
                        ? `${contacts.length - resumeIndex} / ${contacts.length}`
                        : contacts.length}
                    </div>
                    <div style={{fontSize: '0.9rem', color: '#a1a5b7', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>
                      {isPaused && resumeIndex > 0 && resumeIndex < contacts.length
                        ? 'Contatos Restantes Para Retomar'
                        : 'Contatos Prontos Para Envio'}
                    </div>
                    <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', backgroundColor: channel === 'telegram' ? '#e0f2fe' : '#dcfce7', color: channel === 'telegram' ? '#0369a1' : '#15803d', fontWeight: 700, fontSize: '0.85rem' }}>
                      {channel === 'telegram' ? <Telegram size={16}/> : <Smartphone size={16}/>}
                      Disparo configurado via {channel === 'telegram' ? 'Telegram' : 'WhatsApp'}
                    </div>
                  </div>

                  {/* Card de Progresso Pausado */}
                  {(isPaused || isDispatching) && resumeIndex > 0 && resumeIndex < contacts.length && (
                    <div style={{
                      marginBottom: '20px',
                      padding: '14px 16px',
                      borderRadius: '14px',
                      backgroundColor: isDispatching ? '#eff6ff' : '#fffbeb',
                      border: `1px solid ${isDispatching ? '#bfdbfe' : '#fde68a'}`,
                      color: isDispatching ? '#1e40af' : '#92400e',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontWeight: 700 }}>
                        <span>
                          {isDispatching ? '🚀 Disparo em andamento' : '⏸️ Disparo pausado — ponto de retomada salvo'}
                        </span>
                        <span>{Math.round((resumeIndex / contacts.length) * 100)}% ({resumeIndex}/{contacts.length})</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{
                          width: `${Math.min(100, Math.round((resumeIndex / contacts.length) * 100))}%`,
                          height: '100%',
                          backgroundColor: isDispatching ? '#2563eb' : '#f59e0b',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '0.8rem' }}>
                        <span>
                          Próximo da fila: <strong>#{resumeIndex + 1} - {contacts[resumeIndex]?.name || 'Contato'}</strong> ({contacts[resumeIndex]?.phone || ''})
                        </span>
                        <span>
                          Enviados: <strong>{stats.sent}</strong> | Falhas: <strong>{stats.failed}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {!isDispatching && isPaused && resumeIndex > 0 && resumeIndex < contacts.length ? (
                      <>
                        <button 
                          className={`btn-huge ${channel === 'telegram' ? 'btn-telegram' : 'btn-whatsapp'}`}
                          onClick={() => handleStartDispatch({ resume: true })}
                          disabled={contacts.length === 0}
                          style={{ width: '100%' }}
                        >
                          <Play size={24} /> CONTINUAR DE ONDE PAROU ({contacts.length - resumeIndex} RESTANTES)
                        </button>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button 
                            className="btn-huge"
                            onClick={() => handleStartDispatch({ resume: false })}
                            style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', cursor: 'pointer', flex: 1, fontSize: '0.9rem', padding: '12px 16px' }}
                            title="Ignorar pausa e enviar novamente desde o primeiro contato"
                          >
                            <Send size={18} /> Disparar Tudo do Início
                          </button>
                          <button 
                            className="btn-huge"
                            onClick={handleResetProgress}
                            style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer', flex: 1, fontSize: '0.9rem', padding: '12px 16px' }}
                            title="Zerar o progresso salvo desta lista"
                          >
                            <Reload size={18} /> Zerar Fila Salva
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button 
                          className={`btn-huge ${channel === 'telegram' ? 'btn-telegram' : 'btn-whatsapp'}`}
                          onClick={() => handleStartDispatch({ resume: false })}
                          disabled={isDispatching || contacts.length === 0}
                          style={{ opacity: (isDispatching || contacts.length === 0) ? 0.6 : 1, flex: 1, minWidth: '220px' }}
                        >
                          <Send size={24} /> {isDispatching ? 'DISPARANDO MENSAGENS...' : `INICIAR DISPARO VIA ${channel.toUpperCase()}`}
                        </button>

                        {isDispatching && (
                          <>
                            <button 
                              className="btn-huge"
                              onClick={handlePauseDispatch}
                              style={{ background: '#F59E0B', color: '#FFFFFF', border: 'none', cursor: 'pointer', flex: 1, minWidth: '180px' }}
                              title="Pausar disparo mantendo a posição exata para retomar depois"
                            >
                              <Pause size={24} /> PAUSAR DISPARO
                            </button>
                            <button 
                              className="btn-huge"
                              onClick={handleStopDispatch}
                              style={{ background: '#DC2626', color: '#FFFFFF', border: 'none', cursor: 'pointer', flex: 1, minWidth: '180px' }}
                              title="Encerrar e zerar o progresso da fila"
                            >
                              <Close size={24} /> ENCERRAR E ZERAR
                            </button>
                          </>
                        )}
                      </div>
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

              {/* Barra de Progresso e Retomada na aba de Relatórios */}
              {(isDispatching || (isPaused && resumeIndex > 0 && resumeIndex < contacts.length)) && (
                <div style={{
                  marginTop: '20px',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  backgroundColor: isDispatching ? '#eff6ff' : '#fffbeb',
                  border: `1px solid ${isDispatching ? '#bfdbfe' : '#fde68a'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontWeight: 700, color: isDispatching ? '#1e40af' : '#92400e', fontSize: '0.9rem' }}>
                      {isDispatching
                        ? `🚀 Processando fila: ${resumeIndex} de ${contacts.length} concluídos (${contacts.length - resumeIndex} restantes)`
                        : `⏸️ Disparo pausado no contato #${resumeIndex + 1} (${contacts[resumeIndex]?.name || 'Contato'}) — faltam ${contacts.length - resumeIndex} envios`}
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isDispatching ? '#1d4ed8' : '#b45309' }}>
                      {Math.round((resumeIndex / Math.max(1, contacts.length)) * 100)}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.round((resumeIndex / Math.max(1, contacts.length)) * 100))}%`,
                      height: '100%',
                      backgroundColor: isDispatching ? '#2563eb' : '#f59e0b',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
            </div>

            <div className="premium-card">
              <div className="card-header">
                <div className="card-title">Console de Logs em Tempo Real</div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {isDispatching && (
                    <>
                      <button 
                        className="btn-pill"
                        style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', fontWeight: 700 }}
                        onClick={handlePauseDispatch}
                      >
                        <Pause size={14} /> Pausar Disparo
                      </button>
                      <button 
                        className="btn-pill"
                        style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', fontWeight: 600 }}
                        onClick={handleStopDispatch}
                      >
                        <Close size={14} /> Encerrar e Zerar
                      </button>
                    </>
                  )}
                  {!isDispatching && isPaused && resumeIndex > 0 && resumeIndex < contacts.length && (
                    <>
                      <button 
                        className="btn-pill"
                        style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', fontWeight: 700 }}
                        onClick={() => handleStartDispatch({ resume: true })}
                      >
                        <Play size={14} /> Continuar de onde parou ({contacts.length - resumeIndex} restantes)
                      </button>
                      <button 
                        className="btn-pill btn-light"
                        style={{ color: '#B91C1C' }}
                        onClick={handleResetProgress}
                      >
                        <Reload size={14} /> Zerar Fila
                      </button>
                    </>
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
