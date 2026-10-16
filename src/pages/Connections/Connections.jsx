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

export default function Connections() {
  const [waStatus, setWaStatus] = useState('disconnected');
  const [waQR, setWaQR] = useState('');
  const [isLoadingWA, setIsLoadingWA] = useState(false);

  const [tgToken, setTgToken] = useState(() => localStorage.getItem('unne_tg_token') || '');
  const [tgStatus, setTgStatus] = useState('disconnected');
  const [tgBotInfo, setTgBotInfo] = useState(null);
  const [isLoadingTG, setIsLoadingTG] = useState(false);

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

  const disconnectTelegram = async () => {
    if (!window.confirm('Deseja realmente desconectar o bot do Telegram?')) return;
    setIsLoadingTG(true);
    try {
      const res = await fetch('http://localhost:3001/api/connections/telegram/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.removeItem('unne_tg_token');
        setTgToken('');
        setTgStatus('disconnected');
        setTgBotInfo(null);
      } else {
        alert('Erro ao desconectar: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao desconectar o bot do Telegram.');
    }
    setIsLoadingTG(false);
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
    <div className="connections-container">
      <header className="connections-header">
        <h1>Conexões e Integrações</h1>
        <p>Gerencie as conexões de WhatsApp, Telegram, E-mail e Agenda do seu CRM para enviar e receber mensagens.</p>
      </header>

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
                <button 
                  className="btn-secondary" 
                  style={{ marginTop: '8px' }} 
                  onClick={disconnectTelegram}
                  disabled={isLoadingTG}
                >
                  <Refresh size={16} /> {isLoadingTG ? 'Desconectando...' : 'Desconectar Bot'}
                </button>
              </div>
            ) : (
              <div className="form-state">
                <p style={{ color: '#71717A', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Para conectar o Telegram, crie um bot através do <strong>@BotFather</strong> e cole o token gerado abaixo.
                </p>
                <div className="form-group">
                  <label>Bot Token</label>
                  <input 
                    type="text" 
                    placeholder="Ex: 123456789:ABCdefGHI..." 
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                  />
                </div>
                <button className="btn-primary" onClick={connectTelegram} disabled={!tgToken.trim() || isLoadingTG}>
                  {isLoadingTG ? 'Conectando...' : 'Salvar & Conectar Bot'}
                </button>
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
