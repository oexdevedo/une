import React, { useState, useEffect } from 'react';
import { Mail, CheckDouble, Refresh, Close, Robot } from 'pixelarticons/react';

const API = '';

const emptyForm = {
  name: 'Hostinger Atendimento',
  email_address: '',
  password: '',
  display_name: 'Equipe de Atendimento',
  imap_host: 'imap.hostinger.com',
  imap_port: 993,
  smtp_host: 'smtp.hostinger.com',
  smtp_port: 465,
  agent_id: '',
  auto_reply_enabled: false
};

export default function EmailConnectionCard({ workspaceId = 1 }) {
  const [accounts, setAccounts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchAccounts();
    fetchAgents();
  }, [workspaceId]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API}/api/emails/accounts?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAccounts(data);
        window.dispatchEvent(new Event('channels-updated'));
      }
    } catch (e) {
      console.error('Erro ao buscar contas de e-mail:', e);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API}/api/agents?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (Array.isArray(data)) setAgents(data);
    } catch (e) {
      console.error('Erro ao buscar agentes:', e);
    }
  };

  const payload = () => ({ ...form, username: form.email_address, imap_secure: true, smtp_secure: true, workspace_id: workspaceId });

  const handleTest = async () => {
    if (!form.email_address || !form.password) return alert('Informe e-mail e senha.');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/emails/accounts/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload())
      });
      setTestResult(await res.json());
    } catch (e) {
      setTestResult({ success: false, message: 'Erro na requisição: ' + e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.email_address || !form.password) return alert('Informe e-mail e senha.');
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/emails/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload())
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setForm(emptyForm);
        setTestResult(null);
        // dá um tempo para a sincronização inicial atualizar o status
        setTimeout(fetchAccounts, 3000);
        fetchAccounts();
      } else {
        alert(data.error || 'Erro ao conectar conta');
      }
    } catch (e) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateAccount = async (acc, changes) => {
    await fetch(`${API}/api/emails/accounts/${acc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    });
    fetchAccounts();
  };

  const handleSync = async (acc) => {
    setSyncingId(acc.id);
    try {
      const res = await fetch(`${API}/api/emails/accounts/${acc.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) alert(data.error || 'Falha na sincronização');
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setSyncingId(null);
      fetchAccounts();
    }
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(`Desconectar ${acc.email_address}? As mensagens salvas também serão apagadas.`)) return;
    await fetch(`${API}/api/emails/accounts/${acc.id}`, { method: 'DELETE' });
    fetchAccounts();
  };

  const anyConnected = accounts.some(a => a.status === 'connected');
  const statusKey = anyConnected ? 'connected' : 'disconnected';

  return (
    <div className="connection-card">
      <div className="connection-card-header">
        <div className="connection-icon" style={{ backgroundColor: '#EDE7F6', color: '#673AB7' }}>
          <Mail size={24} />
        </div>
        <div className="connection-title">
          <h2>E-mail</h2>
          <span className={`status-badge status-${statusKey}`}>
            {anyConnected ? `${accounts.length} conta(s) conectada(s)` : 'Desconectado'}
          </span>
        </div>
      </div>

      <div className="connection-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
        {accounts.map(acc => (
          <div key={acc.id} style={{ border: '1px solid #E4E4E7', borderRadius: '10px', padding: '12px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acc.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.email_address}</div>
              </div>
              <span style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', whiteSpace: 'nowrap',
                background: acc.status === 'connected' ? '#DCFCE7' : acc.status === 'error' ? '#FEE2E2' : '#F1F5F9',
                color: acc.status === 'connected' ? '#15803D' : acc.status === 'error' ? '#B91C1C' : '#64748B'
              }}>
                {acc.status === 'connected' ? '● Online' : acc.status === 'error' ? '● Erro' : '● Aguardando'}
              </span>
            </div>

            {acc.status === 'error' && acc.status_message && (
              <div style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '6px' }}>{acc.status_message}</div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.8rem' }}>
              <Robot size={16} color="#673AB7" />
              <select
                value={acc.agent_id || ''}
                onChange={(e) => updateAccount(acc, { agent_id: e.target.value || null })}
                style={{ flex: 1, padding: '4px 6px', borderRadius: '6px', border: '1px solid #E4E4E7', fontSize: '0.8rem' }}
              >
                <option value="">Sem agente</option>
                {agents.map(ag => <option key={ag.id} value={ag.id}>{ag.icon} {ag.name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acc.auto_reply_enabled === 1}
                onChange={(e) => updateAccount(acc, { auto_reply_enabled: e.target.checked })}
              />
              Agente responde e-mails automaticamente
            </label>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => handleSync(acc)} disabled={syncingId === acc.id}>
                <Refresh size={14} /> {syncingId === acc.id ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button className="btn-secondary" onClick={() => handleDelete(acc)} title="Desconectar">
                <Close size={14} />
              </button>
            </div>
          </div>
        ))}

        {!showForm ? (
          <>
            {accounts.length === 0 && (
              <div className="success-state" style={{ padding: '8px 0' }}>
                <p style={{ color: '#71717A', fontSize: '0.9rem' }}>
                  Conecte um e-mail da Hostinger para que o agente de IA receba e envie e-mails.
                </p>
              </div>
            )}
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Conectar e-mail Hostinger
            </button>
          </>
        ) : (
          <div className="form-state" style={{ textAlign: 'left' }}>
            <p style={{ color: '#71717A', fontSize: '0.85rem', marginBottom: '12px' }}>
              Use o e-mail e a senha da caixa criada no <strong>hPanel da Hostinger</strong>. IMAP (993/SSL) e SMTP (465/SSL) já vêm configurados.
            </p>
            <div className="form-group">
              <label>E-mail</label>
              <input type="email" placeholder="contato@seudominio.com" value={form.email_address}
                onChange={(e) => setForm({ ...form, email_address: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Senha</label>
              <input type="password" placeholder="Senha da caixa de e-mail" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Nome da conta</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Nome do remetente</label>
              <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Agente de IA</label>
              <select value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}>
                <option value="">Sem agente (somente manual)</option>
                {agents.map(ag => <option key={ag.id} value={ag.id}>{ag.icon} {ag.name}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginBottom: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.auto_reply_enabled}
                onChange={(e) => setForm({ ...form, auto_reply_enabled: e.target.checked })} />
              Responder automaticamente com o agente
            </label>

            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ background: 'none', border: 'none', color: '#673AB7', fontSize: '0.8rem', padding: 0, marginBottom: '8px', cursor: 'pointer' }}>
              {showAdvanced ? '▾' : '▸'} Configurações avançadas de servidor
            </button>
            {showAdvanced && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                <div className="form-group"><label>IMAP</label>
                  <input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} /></div>
                <div className="form-group"><label>Porta</label>
                  <input type="number" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: Number(e.target.value) })} /></div>
                <div className="form-group"><label>SMTP</label>
                  <input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} /></div>
                <div className="form-group"><label>Porta</label>
                  <input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })} /></div>
              </div>
            )}

            {testResult && (
              <div style={{
                padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '10px',
                background: testResult.success ? '#DCFCE7' : '#FEE2E2',
                color: testResult.success ? '#15803D' : '#B91C1C'
              }}>
                {testResult.success && <CheckDouble size={14} />} {testResult.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setTestResult(null); }}>Cancelar</button>
              <button className="btn-secondary" onClick={handleTest} disabled={testing}>
                {testing ? 'Testando...' : 'Testar'}
              </button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Conectando...' : 'Conectar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
