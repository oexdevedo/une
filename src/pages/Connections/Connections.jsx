import React, { useState, useEffect } from 'react';
import './Connections.css';
import {
  Smartphone,
  Send,
  QrCode,
  CheckDouble,
  Refresh,
  Close,
  Algorithm,
  Calendar as CalendarIcon
} from 'pixelarticons/react';
import { QRCodeSVG } from 'qrcode.react';
import EmailConnectionCard from './EmailConnectionCard';
import DatabaseConnectionCard from './DatabaseConnectionCard';
import { getWorkspaceId } from '../../utils/workspace';

export default function Connections({ isSubpage = false }) {
  const workspaceId = getWorkspaceId();

  const [waStatus, setWaStatus] = useState('disconnected');
  const [waQR, setWaQR] = useState('');
  const [isLoadingWA, setIsLoadingWA] = useState(false);

  const [tgToken, setTgToken] = useState(() => localStorage.getItem(`unne_tg_token_ws_${workspaceId}`) || '');
  const [tgStatus, setTgStatus] = useState('disconnected');
  const [tgBotInfo, setTgBotInfo] = useState(null);
  const [isLoadingTG, setIsLoadingTG] = useState(false);
  const [isReconnectingAll, setIsReconnectingAll] = useState(false);

  const [calToken, setCalToken] = useState(() => localStorage.getItem(`unne_cal_api_key_ws_${workspaceId}`) || '');
  const [calStatus, setCalStatus] = useState(() => localStorage.getItem(`unne_cal_api_key_ws_${workspaceId}`) ? 'connected' : 'disconnected');
  const [isLoadingCal, setIsLoadingCal] = useState(false);

  const [settings, setSettings] = useState({
    allow_stories: true,
    allow_ephemeral: true,
    allow_groups: true,
    ai_provider: 'openai',
    ai_api_key: '',
    ai_base_url: '',
    ai_model: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);

  // Poll WhatsApp status every 3 seconds if connecting
  useEffect(() => {
    let interval;
    if (waStatus === 'connecting' || waStatus === 'disconnected') {
      interval = setInterval(fetchWAStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [waStatus]);

  const fetchWAStatus = async () => {
    try {
      const res = await fetch(`/api/connections/whatsapp?workspace_id=${workspaceId}`);
      const data = await res.json();
      setWaStatus(data.status);
      setWaQR(data.qr || '');
      window.dispatchEvent(new Event('channels-updated'));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTGStatus = async () => {
    try {
      const res = await fetch(`/api/connections/telegram?workspace_id=${workspaceId}`);
      const data = await res.json();
      setTgStatus(data.status);
      if (data.botInfo) {
        setTgBotInfo(data.botInfo);
      }
      if (data.token) {
        setTgToken(data.token);
        localStorage.setItem(`unne_tg_token_ws_${workspaceId}`, data.token);
      } else {
        setTgToken('');
        localStorage.removeItem(`unne_tg_token_ws_${workspaceId}`);
      }
      window.dispatchEvent(new Event('channels-updated'));
    } catch (e) {
      console.error('Erro ao buscar status do Telegram:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/settings`);
      const data = await res.json();
      setSettings({
        allow_stories: Boolean(data.allow_stories),
        allow_ephemeral: Boolean(data.allow_ephemeral),
        allow_groups: Boolean(data.allow_groups),
        ai_provider: data.ai_provider || 'openai',
        ai_api_key: data.ai_api_key || '',
        ai_base_url: data.ai_base_url || '',
        ai_model: data.ai_model || ''
      });

      // Carrega Cal.com do banco de dados
      const calRes = await fetch(`/api/calendar/settings?workspace_id=${workspaceId}`);
      const calData = await calRes.json();
      if (calData && calData.cal_api_key && calData.cal_api_key.trim()) {
        setCalToken(calData.cal_api_key.trim());
        setCalStatus('connected');
        localStorage.setItem(`unne_cal_api_key_ws_${workspaceId}`, calData.cal_api_key.trim());
      } else {
        setCalToken('');
        setCalStatus('disconnected');
        localStorage.removeItem(`unne_cal_api_key_ws_${workspaceId}`);
        localStorage.removeItem('unne_cal_api_key');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchWAStatus();
    fetchTGStatus();
    fetchSettings();
  }, [workspaceId]);

  const startWhatsApp = async () => {
    setIsLoadingWA(true);
    try {
      await fetch('/api/connections/whatsapp/start', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId })
      });
      await fetchWAStatus();
    } catch (e) {
      console.error(e);
    }
    setIsLoadingWA(false);
  };

  const connectTelegram = async () => {
    if (!tgToken.trim()) return;
    setIsLoadingTG(true);
    try {
      const res = await fetch('/api/connections/telegram/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tgToken.trim(), workspace_id: workspaceId })
      });
      const data = await res.json();
      if (data.success) {
        setTgStatus('connected');
        if (data.botInfo) setTgBotInfo(data.botInfo);
        localStorage.setItem(`unne_tg_token_ws_${workspaceId}`, tgToken.trim());
        await fetchTGStatus();
      } else {
        alert('Erro ao conectar o Telegram: ' + (data.error || 'Token inválido'));
      }
    } catch (e) {
      console.error(e);
      alert('Erro de comunicação com o servidor ao conectar o Telegram.');
    }
    setIsLoadingTG(false);
  };

  const disconnectTelegram = async (clearToken = false) => {
    const confirmMsg = clearToken 
      ? 'Deseja realmente remover o token do Telegram do banco de dados?' 
      : 'Deseja desconectar a sessão do bot? O token permanecerá salvo no banco para reconectar quando quiser.';
    if (!window.confirm(confirmMsg)) return;

    setIsLoadingTG(true);
    try {
      const res = await fetch('/api/connections/telegram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, clear_token: clearToken })
      });
      const data = await res.json();
      if (data.success) {
        if (clearToken) {
          localStorage.removeItem(`unne_tg_token_ws_${workspaceId}`);
          setTgToken('');
        }
        setTgStatus('disconnected');
        setTgBotInfo(null);
        await fetchTGStatus();
      } else {
        alert('Erro ao desconectar: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao desconectar o bot do Telegram.');
    }
    setIsLoadingTG(false);
  };

  const saveTelegramTokenOnly = async () => {
    if (!tgToken.trim()) return alert('Insira um token válido.');
    setIsLoadingTG(true);
    try {
      const res = await fetch('/api/connections/telegram/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, token: tgToken.trim() })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem(`unne_tg_token_ws_${workspaceId}`, tgToken.trim());
        alert('Token do Telegram salvo no banco de dados com sucesso!');
      } else {
        alert('Erro ao salvar token: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar token do Telegram.');
    }
    setIsLoadingTG(false);
  };

  const reconnectAllServices = async () => {
    setIsReconnectingAll(true);
    try {
      const res = await fetch('/api/connections/reconnect-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId })
      });
      const data = await res.json();
      if (data.success) {
        await fetchWAStatus();
        await fetchTGStatus();
        await fetchSettings();
      }
    } catch (e) {
      console.error('Erro ao reconectar todos os canais:', e);
    }
    setIsReconnectingAll(false);
  };

  const handleFilterChange = async (e) => {
    const { name, checked } = e.target;
    const newSettings = { ...settings, [name]: checked };
    setSettings(newSettings);
    
    setIsSavingSettings(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch (err) {
      console.error(err);
    }
    setIsSavingSettings(false);
  };

  const connectCalCom = async () => {
    if (!calToken.trim()) return;
    setIsLoadingCal(true);
    try {
      const res = await fetch('/cal-api/v2/event-types', {
        headers: { 'Authorization': `Bearer ${calToken}`, 'cal-api-version': '2024-06-14' }
      });
      if (!res.ok) throw new Error('API Key inválida');
      localStorage.setItem(`unne_cal_api_key_ws_${workspaceId}`, calToken);
      
      // Persiste no banco de dados SQLite
      await fetch('/api/calendar/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, cal_api_key: calToken })
      });

      setCalStatus('connected');
      window.dispatchEvent(new Event('channels-updated'));
      alert('Conta do Cal.com conectada e salva no banco de dados com sucesso!');
    } catch (e) {
      alert('Erro ao conectar: ' + e.message);
      setCalStatus('disconnected');
    }
    setIsLoadingCal(false);
  };

  const handleLocalChange = (e) => {
    const { name, value } = e.target;
    setSettings({ ...settings, [name]: value });
  };

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      alert('Configurações salvas com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar configurações.');
    }
    setIsSavingSettings(false);
  };

  const handleTestAi = async () => {
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setAiTestResult(data);
    } catch (err) {
      setAiTestResult({ success: false, error: err.message });
    } finally {
      setIsTestingAi(false);
    }
  };

  return (
    <div className={`connections-container ${isSubpage ? 'is-subpage' : ''}`}>
      {!isSubpage && (
        <header className="connections-header">
          <h1>Conexões e Integrações</h1>
          <p>Gerencie as conexões de WhatsApp, Telegram, E-mail e Agenda do seu CRM para enviar e receber mensagens.</p>
        </header>
      )}

      {/* Barra de Ações Rápidas de Sincronização */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#FFFFFF',
        border: '1px solid #E4E4E7',
        borderRadius: '12px',
        padding: '14px 20px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#18181B' }}>
            Persistência Automática das Contas
          </h4>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#71717A' }}>
            Suas chaves e tokens ficam salvos no banco SQLite e conectam WhatsApp, Telegram, Cal.com e E-mail a cada login.
          </p>
        </div>
        <button
          className="btn-secondary"
          onClick={reconnectAllServices}
          disabled={isReconnectingAll}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 600, fontSize: '0.85rem' }}
        >
          <Refresh size={16} />
          {isReconnectingAll ? 'Reconectando...' : 'Reconectar Todas as Contas'}
        </button>
      </div>

      <div className="connections-grid">
        {/* WhatsApp Card */}
        <div className="connection-card">
          <div className="connection-card-header">
            <div className="connection-icon" style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
              <Smartphone size={24} />
            </div>
            <div className="connection-title">
              <h2>WhatsApp</h2>
              <span className={`status-badge status-${waStatus}`}>
                {waStatus === 'connected' ? 'Conectado' : waStatus === 'connecting' ? 'Aguardando QR Code' : 'Desconectado'}
              </span>
            </div>
          </div>

          <div className="connection-body">
            {waStatus === 'connected' ? (
              <div className="success-state">
                <CheckDouble size={48} color="#16A34A" />
                <p>Seu WhatsApp está conectado e pronto para uso!</p>
                <button className="btn-secondary" style={{ marginTop: '16px' }} onClick={startWhatsApp}>
                  <Refresh size={16} /> Reconectar
                </button>
              </div>
            ) : waStatus === 'connecting' && waQR ? (
              <div className="qr-state">
                <p>Abra o WhatsApp no celular e escaneie o código abaixo:</p>
                <div className="qr-box">
                  <QRCodeSVG value={waQR} size={200} />
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <QrCode size={48} color="#A1A1AA" />
                <p>Nenhuma sessão do WhatsApp ativa no momento.</p>
                <button className="btn-primary" onClick={startWhatsApp} disabled={isLoadingWA}>
                  {isLoadingWA ? 'Iniciando...' : 'Gerar QR Code'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Telegram Card */}
        <div className="connection-card">
          <div className="connection-card-header">
            <div className="connection-icon" style={{ backgroundColor: '#E0F2FE', color: '#0284C7' }}>
              <Send size={24} />
            </div>
            <div className="connection-title">
              <h2>Telegram</h2>
              <span className={`status-badge status-${tgStatus}`}>
                {tgStatus === 'connected' ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>

          <div className="connection-body">
            {tgStatus === 'connected' ? (
              <div className="success-state">
                <CheckDouble size={48} color="#0284C7" />
                <p>Seu Bot do Telegram está online e recebendo mensagens!</p>
                {tgBotInfo && (
                  <div style={{ marginTop: '-8px', marginBottom: '16px', fontSize: '0.9rem', color: '#0284C7', fontWeight: 600 }}>
                    @{tgBotInfo.username} {tgBotInfo.first_name ? `(${tgBotInfo.first_name})` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => disconnectTelegram(false)}
                    disabled={isLoadingTG}
                    title="Desconecta a sessão em tempo real mas mantém o token no banco"
                  >
                    <Refresh size={16} /> {isLoadingTG ? 'Aguarde...' : 'Desconectar Bot'}
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ color: '#EF4444', borderColor: '#FCA5A5' }}
                    onClick={() => disconnectTelegram(true)}
                    disabled={isLoadingTG}
                    title="Exclui o token permanentemente do banco"
                  >
                    <Close size={16} /> Limpar Token
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-state">
                <p style={{ color: '#71717A', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Para conectar o Telegram, crie um bot através do <strong>@BotFather</strong> e cole o token gerado abaixo.
                </p>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0 }}>Bot Token</label>
                    {tgToken && (
                      <span style={{ fontSize: '0.75rem', color: '#16A34A', fontWeight: 600 }}>
                        ● Salvo no Banco
                      </span>
                    )}
                  </div>
                  <input 
                    type="text" 
                    placeholder="Ex: 123456789:ABCdefGHI..." 
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button 
                    className="btn-primary" 
                    style={{ flex: 1 }}
                    onClick={connectTelegram} 
                    disabled={!tgToken.trim() || isLoadingTG}
                  >
                    {isLoadingTG ? 'Conectando...' : (tgToken ? 'Salvar & Conectar Bot' : 'Conectar Bot')}
                  </button>
                  {tgToken && (
                    <button 
                      className="btn-secondary"
                      onClick={() => disconnectTelegram(true)}
                      disabled={isLoadingTG}
                      title="Excluir token do banco"
                    >
                      <Close size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cal.com Card */}
        <div className="connection-card">
          <div className="connection-card-header">
            <div className="connection-icon" style={{ backgroundColor: '#F3E8FF', color: '#9333EA' }}>
              <CalendarIcon size={24} />
            </div>
            <div className="connection-title">
              <h2>Cal.com / Agenda</h2>
              <span className={`status-badge status-${calStatus}`}>
                {calStatus === 'connected' ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          </div>

          <div className="connection-body">
            {calStatus === 'connected' ? (
              <div className="success-state">
                <CheckDouble size={48} color="#9333EA" />
                <p>Sua API do Cal.com está conectada e pronta para agendamentos!</p>
                <button className="btn-secondary" style={{ marginTop: '16px' }} onClick={async () => {
                  localStorage.removeItem(`unne_cal_api_key_ws_${workspaceId}`);
                  localStorage.removeItem('unne_cal_api_key');
                  setCalToken('');
                  setCalStatus('disconnected');
                  try {
                    await fetch('/api/calendar/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ workspace_id: workspaceId, cal_api_key: '' })
                    });
                    window.dispatchEvent(new Event('channels-updated'));
                  } catch (e) {
                    console.error(e);
                  }
                }}>
                  <Refresh size={16} /> Desconectar
                </button>
              </div>
            ) : (
              <div className="form-state">
                <p style={{ color: '#71717A', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Para conectar sua Agenda, insira sua <strong>API Key</strong> do Cal.com.
                </p>
                <div className="form-group">
                  <label>API Key</label>
                  <input 
                    type="password" 
                    placeholder="Ex: cal_live_xxxxxxxxxxxxxxxx" 
                    value={calToken}
                    onChange={(e) => setCalToken(e.target.value)}
                  />
                </div>
                <button className="btn-primary" onClick={connectCalCom} disabled={!calToken.trim() || isLoadingCal}>
                  {isLoadingCal ? 'Conectando...' : 'Conectar Conta'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* E-mail Hostinger Card */}
        <EmailConnectionCard workspaceId={workspaceId} />
      </div>

      {/* Database Connection & Environment Variables Card */}
      <DatabaseConnectionCard />

      <div className="connection-card" style={{ marginTop: '24px' }}>
        <div className="connection-card-header">
          <div className="connection-title">
            <h2>Filtro de Mensagens do WhatsApp</h2>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginTop: '4px' }}>
              Selecione os tipos de interações que deseja receber no chat. O que estiver desmarcado será ignorado pelo sistema.
            </p>
          </div>
        </div>
        <div className="connection-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              name="allow_stories" 
              checked={settings.allow_stories} 
              onChange={handleFilterChange} 
              disabled={isSavingSettings}
            />
            <span>Receber respostas a <b>Stories (Status)</b></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              name="allow_ephemeral" 
              checked={settings.allow_ephemeral} 
              onChange={handleFilterChange} 
              disabled={isSavingSettings}
            />
            <span>Receber <b>Mensagens Temporárias</b></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              name="allow_groups" 
              checked={settings.allow_groups} 
              onChange={handleFilterChange} 
              disabled={isSavingSettings}
            />
            <span>Receber <b>Mensagens de Grupo</b></span>
          </label>
          {isSavingSettings && <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>Salvando...</span>}
        </div>
      </div>

      <div className="connection-card" style={{ marginTop: '24px' }}>
        <div className="connection-card-header">
          <div className="connection-icon" style={{ backgroundColor: '#F3E8FF', color: '#9333EA' }}>
            <Algorithm size={24} />
          </div>
          <div className="connection-title">
            <h2>Provedor de Inteligência Artificial</h2>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem', marginTop: '4px' }}>
              Conecte a API de IA compatível com os agentes do CRM.
            </p>
          </div>
        </div>
        <div className="connection-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="form-group">
            <label>Provedor de Inteligência Artificial</label>
            <select name="ai_provider" value={settings.ai_provider} onChange={handleLocalChange}>
              <option value="anythingllm">AnythingLLM (Self-hosted)</option>
              <option value="openai">OpenAI (ChatGPT / GPT-4o)</option>
              <option value="gemini">Google Gemini (Gemini 1.5 / 2.0)</option>
              <option value="custom">Custom / Outros (Groq, DeepSeek, OpenRouter, Ollama...)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="bedrock">AWS Bedrock</option>
            </select>
          </div>

          {settings.ai_provider === 'anythingllm' && (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#92400E',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: '1.5'
            }}>
              <strong>💡 Importante sobre o AnythingLLM:</strong>
              <div style={{ marginTop: '4px' }}>
                O AnythingLLM precisa de uma chave de modelo (OpenAI, Groq, Ollama ou Gemini) configurada nas configurações internas dele (<strong>Settings &gt; LLM Preference</strong>) para conseguir gerar respostas. Caso ele esteja sem chave de LLM cadastrada lá, o chat não responderá.
              </div>
            </div>
          )}

          <div className="form-group">
            <label>
              {settings.ai_provider === 'anythingllm' ? 'Chave de API do AnythingLLM (Bearer Token)' :
               settings.ai_provider === 'openai' ? 'Chave de API OpenAI (sk-proj-...)' :
               settings.ai_provider === 'gemini' ? 'Chave de API Google AI Studio (AIzaSy...)' :
               'Chave de API (API Key)'}
            </label>
            <input 
              type="password" 
              name="ai_api_key" 
              placeholder={
                settings.ai_provider === 'anythingllm' ? 'Ex: SDD1V84-F1EMHXV-H0B7XHQ-3ZT4HS5' :
                settings.ai_provider === 'openai' ? 'Ex: sk-proj-...' :
                settings.ai_provider === 'gemini' ? 'Ex: AIzaSy...' :
                'Ex: gsk_... ou sk-...'
              } 
              value={settings.ai_api_key} 
              onChange={handleLocalChange}
            />
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>
                {settings.ai_provider === 'anythingllm' ? 'Slug do Workspace no AnythingLLM' :
                 settings.ai_provider === 'gemini' ? 'Modelo Gemini' :
                 settings.ai_provider === 'openai' ? 'Modelo OpenAI' :
                 'Nome do Modelo'}
              </label>
              <input 
                type="text" 
                name="ai_model" 
                placeholder={
                  settings.ai_provider === 'anythingllm' ? 'Ex: meu-workspace' :
                  settings.ai_provider === 'gemini' ? 'Ex: gemini-1.5-flash ou gemini-2.0-flash' :
                  settings.ai_provider === 'openai' ? 'Ex: gpt-4o-mini ou gpt-4o' :
                  'Ex: llama-3.3-70b-versatile, deepseek-chat...'
                } 
                value={settings.ai_model} 
                onChange={handleLocalChange}
              />
            </div>
            
            <div className="form-group" style={{ flex: 1 }}>
              <label>
                {settings.ai_provider === 'anythingllm' ? 'URL da API do AnythingLLM' :
                 settings.ai_provider === 'custom' ? 'Endpoint OpenAI-compatível' :
                 'Base URL (Opcional)'}
              </label>
              <input 
                type="text" 
                name="ai_base_url" 
                placeholder={
                  settings.ai_provider === 'anythingllm' ? 'Ex: https://area-51-anything-llm.mypaeg.easypanel.host/api/v1' :
                  settings.ai_provider === 'custom' ? 'Ex: https://api.groq.com/openai/v1 ou https://api.deepseek.com/v1' :
                  'Ex: https://api.openai.com/v1'
                } 
                value={settings.ai_base_url} 
                onChange={handleLocalChange}
              />
            </div>
          </div>

          {aiTestResult && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              lineHeight: '1.5',
              background: aiTestResult.success ? '#ECFDF5' : '#FEF2F2',
              border: `1px solid ${aiTestResult.success ? '#A7F3D0' : '#FECACA'}`,
              color: aiTestResult.success ? '#065F46' : '#991B1B'
            }}>
              <strong>{aiTestResult.success ? '✅ Teste Realizado com Sucesso!' : '❌ Falha no Teste de Conexão:'}</strong>
              <div style={{ marginTop: '6px', whiteSpace: 'pre-wrap' }}>
                {aiTestResult.success ? `Resposta do Modelo (${aiTestResult.provider || settings.ai_provider}): "${aiTestResult.reply}"` : aiTestResult.error}
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
            <button 
              type="button"
              className="btn-secondary" 
              onClick={handleTestAi} 
              disabled={isTestingAi}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#F9FAFB', cursor: 'pointer', fontWeight: 500 }}
            >
              {isTestingAi ? 'Testando Conexão...' : '⚡ Testar Conexão de IA'}
            </button>
            <button className="btn-primary" onClick={saveSettings} disabled={isSavingSettings}>
              {isSavingSettings ? 'Salvando...' : 'Salvar Configurações de IA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
