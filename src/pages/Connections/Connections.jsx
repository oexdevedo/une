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

export default function Connections({ isSubpage = false }) {
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waQR, setWaQR] = useState('');
  const [isLoadingWA, setIsLoadingWA] = useState(false);

  const [tgToken, setTgToken] = useState(() => localStorage.getItem('unne_tg_token') || '');
  const [tgStatus, setTgStatus] = useState('disconnected');
  const [tgBotInfo, setTgBotInfo] = useState(null);
  const [isLoadingTG, setIsLoadingTG] = useState(false);
  const [isReconnectingAll, setIsReconnectingAll] = useState(false);

  const [calToken, setCalToken] = useState(() => localStorage.getItem('unne_cal_api_key') || '');
  const [calStatus, setCalStatus] = useState(() => localStorage.getItem('unne_cal_api_key') ? 'connected' : 'disconnected');
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

  const workspaceId = 1; // Padrão para testes

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
      const res = await fetch(`http://localhost:3001/api/connections/whatsapp?workspace_id=${workspaceId}`);
      const data = await res.json();
      setWaStatus(data.status);
      setWaQR(data.qr || '');
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTGStatus = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/connections/telegram?workspace_id=${workspaceId}`);
      const data = await res.json();
      setTgStatus(data.status);
      if (data.botInfo) {
        setTgBotInfo(data.botInfo);
      }
      if (data.token) {
        setTgToken(data.token);
        localStorage.setItem('unne_tg_token', data.token);
      }
    } catch (e) {
      console.error('Erro ao buscar status do Telegram:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/workspaces/${workspaceId}/settings`);
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
      const calRes = await fetch(`http://localhost:3001/api/calendar/settings?workspace_id=${workspaceId}`);
      const calData = await calRes.json();
      if (calData && calData.cal_api_key) {
        setCalToken(calData.cal_api_key);
        setCalStatus('connected');
        localStorage.setItem('unne_cal_api_key', calData.cal_api_key);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchWAStatus();
    fetchTGStatus();
    fetchSettings();
  }, []);

  const startWhatsApp = async () => {
    setIsLoadingWA(true);
    try {
      await fetch('http://localhost:3001/api/connections/whatsapp/start', { 
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
      const res = await fetch('http://localhost:3001/api/connections/telegram/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tgToken.trim(), workspace_id: workspaceId })
      });
      const data = await res.json();
      if (data.success) {
        setTgStatus('connected');
        if (data.botInfo) setTgBotInfo(data.botInfo);
        localStorage.setItem('unne_tg_token', tgToken.trim());
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
      const res = await fetch('http://localhost:3001/api/connections/telegram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, clear_token: clearToken })
      });
      const data = await res.json();
      if (data.success) {
        if (clearToken) {
          localStorage.removeItem('unne_tg_token');
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
      const res = await fetch('http://localhost:3001/api/connections/telegram/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, token: tgToken.trim() })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('unne_tg_token', tgToken.trim());
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
      const res = await fetch('http://localhost:3001/api/connections/reconnect-all', {
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
      await fetch(`http://localhost:3001/api/workspaces/${workspaceId}/settings`, {
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
      localStorage.setItem('unne_cal_api_key', calToken);
      
      // Persiste no banco de dados SQLite
      await fetch('http://localhost:3001/api/calendar/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, cal_api_key: calToken })
      });

      setCalStatus('connected');
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
      await fetch(`http://localhost:3001/api/workspaces/${workspaceId}/settings`, {
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
                <button className="btn-secondary" style={{ marginTop: '16px' }} onClick={() => { localStorage.removeItem('unne_cal_api_key'); setCalToken(''); setCalStatus('disconnected'); }}>
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
        <EmailConnectionCard workspaceId={1} />
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
            <label>Provedor</label>
            <select name="ai_provider" value={settings.ai_provider} onChange={handleLocalChange}>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="gemini">Google Gemini</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="bedrock">AWS Bedrock</option>
              <option value="custom">Custom / Outros (LLaMA, Ollama...)</option>
            </select>
          </div>

          <div className="form-group">
            <label>Chave de API (API Key)</label>
            <input 
              type="password" 
              name="ai_api_key" 
              placeholder="Ex: sk-..." 
              value={settings.ai_api_key} 
              onChange={handleLocalChange}
            />
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Nome do Modelo (Opcional)</label>
              <input 
                type="text" 
                name="ai_model" 
                placeholder="Ex: gpt-4o, gemini-1.5-pro, claude-3-5-sonnet..." 
                value={settings.ai_model} 
                onChange={handleLocalChange}
              />
            </div>
            
            <div className="form-group" style={{ flex: 1 }}>
              <label>Base URL (Custom endpoint)</label>
              <input 
                type="text" 
                name="ai_base_url" 
                placeholder="Ex: https://api.openai.com/v1" 
                value={settings.ai_base_url} 
                onChange={handleLocalChange}
              />
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn-primary" onClick={saveSettings} disabled={isSavingSettings}>
              {isSavingSettings ? 'Salvando...' : 'Salvar Configurações de IA'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
