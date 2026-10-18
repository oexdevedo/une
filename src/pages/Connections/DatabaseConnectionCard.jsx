import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckDouble,
  Refresh,
  Close,
  Server,
  CloudServer,
  FileText
} from 'pixelarticons/react';

const API = '';

export default function DatabaseConnectionCard() {
  const [dbConfig, setDbConfig] = useState({
    db_type: 'mysql',
    db_host: '',
    db_port: '3306',
    db_user: '',
    db_password: '',
    db_name: '',
    db_ssl: false,
    database_url: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showEnvSnippet, setShowEnvSnippet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Carrega as variáveis de ambiente atuais
  const fetchDbConfig = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API}/api/connections/database`);
      if (res.ok) {
        const data = await res.json();
        setDbConfig({
          db_type: data.db_type || 'mysql',
          db_host: data.db_host || '',
          db_port: data.db_port || '3306',
          db_user: data.db_user || '',
          db_password: data.db_password || '',
          db_name: data.db_name || '',
          db_ssl: Boolean(data.db_ssl),
          database_url: data.database_url || ''
        });
      }
    } catch (err) {
      console.error('Erro ao buscar configurações de banco:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDbConfig();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setDbConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    setTestResult(null);
    setSaveSuccess(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API}/api/connections/database/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig)
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({
        success: false,
        message: 'Erro na requisição de teste: ' + err.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${API}/api/connections/database/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig)
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        alert(data.error || 'Erro ao salvar configurações.');
      }
    } catch (err) {
      console.error('Erro ao salvar .env do banco:', err);
      alert('Erro ao salvar variáveis de ambiente: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // String no formato .env
  const envSnippet = [
    `# Configurações do Banco de Dados (${dbConfig.db_type.toUpperCase()})`,
    `DB_TYPE=${dbConfig.db_type}`,
    `DB_HOST=${dbConfig.db_host}`,
    `DB_PORT=${dbConfig.db_port}`,
    `DB_NAME=${dbConfig.db_name}`,
    `DB_USER=${dbConfig.db_user}`,
    `DB_PASSWORD=${dbConfig.db_password}`,
    `DB_SSL=${dbConfig.db_ssl ? 'true' : 'false'}`,
    `DATABASE_URL=${dbConfig.db_type}://${encodeURIComponent(dbConfig.db_user)}:${encodeURIComponent(dbConfig.db_password)}@${dbConfig.db_host}:${dbConfig.db_port}/${dbConfig.db_name}`
  ].join('\n');

  const handleCopyEnv = () => {
    navigator.clipboard.writeText(envSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="connection-card" style={{ marginTop: '24px' }}>
      {/* Header */}
      <div className="connection-card-header">
        <div className="connection-icon" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
          <Database size={24} />
        </div>
        <div className="connection-title" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Banco de Dados & Variáveis de Ambiente</h2>
            <span
              className={`status-badge ${
                testResult?.success
                  ? 'status-connected'
                  : testResult && !testResult.success
                  ? 'status-connecting'
                  : 'status-connected'
              }`}
            >
              {testResult?.success
                ? 'Conexão Testada com Sucesso'
                : testResult && !testResult.success
                ? 'Aviso de Conexão'
                : 'SQLite Ativo / .env Configurado'}
            </span>
          </div>
          <p style={{ color: 'var(--text-light, #71717A)', fontSize: '0.9rem', marginTop: '4px' }}>
            Gerencie as variáveis de ambiente (<code>.env</code>) para conectar o CRM a um banco de dados externo ou remoto.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="connection-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Row 1: Tipo do Banco e Host */}
        <div className="form-row" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#18181B', marginBottom: '6px', display: 'block' }}>
              Tipo de Banco (DB_TYPE)
            </label>
            <select
              name="db_type"
              value={dbConfig.db_type}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.9rem',
                outline: 'none',
                background: '#FAFAFA'
              }}
            >
              <option value="mysql">MySQL / MariaDB (Recomendado)</option>
              <option value="postgres">PostgreSQL</option>
              <option value="sqlite">SQLite (Arquivo Local)</option>
            </select>
          </div>

          <div className="form-group" style={{ flex: '2 1 260px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#18181B', marginBottom: '6px', display: 'block' }}>
              Host do Banco (DB_HOST)
            </label>
            <input
              type="text"
              name="db_host"
              placeholder="Ex: 179.197.71.222, localhost, db.easypanel.host..."
              value={dbConfig.db_host}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.9rem',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div className="form-group" style={{ flex: '0 1 120px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#18181B', marginBottom: '6px', display: 'block' }}>
              Porta (DB_PORT)
            </label>
            <input
              type="text"
              name="db_port"
              placeholder={dbConfig.db_type === 'postgres' ? '5432' : '3306'}
              value={dbConfig.db_port}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.9rem',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Row 2: Nome do Banco, Usuário e Senha */}
        <div className="form-row" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#18181B', marginBottom: '6px', display: 'block' }}>
              Nome do Banco (DB_NAME)
            </label>
            <input
              type="text"
              name="db_name"
              placeholder="Ex: unico, unne_crm..."
              value={dbConfig.db_name}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.9rem',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#18181B', marginBottom: '6px', display: 'block' }}>
              Usuário (DB_USER)
            </label>
            <input
              type="text"
              name="db_user"
              placeholder="Ex: mysql, root, postgres..."
              value={dbConfig.db_user}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.9rem',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div className="form-group" style={{ flex: '1 1 220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#18181B' }}>
                Senha (DB_PASSWORD)
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary, #D97706)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  padding: 0
                }}
              >
                {showPassword ? 'Ocultar' : 'Visualizar'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              name="db_password"
              placeholder="••••••••••••"
              value={dbConfig.db_password}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #E4E4E7',
                fontSize: '0.9rem',
                outline: 'none',
                background: '#FAFAFA',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* SSL checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          <input
            type="checkbox"
            id="db_ssl_check"
            name="db_ssl"
            checked={dbConfig.db_ssl}
            onChange={handleChange}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="db_ssl_check" style={{ fontSize: '0.85rem', color: '#4B5563', cursor: 'pointer' }}>
            Exigir conexão segura <strong>SSL/TLS</strong> (obrigatório para provedores em nuvem como AWS RDS, Supabase, PlanetScale)
          </label>
        </div>

        {/* Test Result Message Box */}
        {testResult && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: testResult.success ? '#DCFCE7' : '#FEE2E2',
              color: testResult.success ? '#15803D' : '#DC2626',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}
          >
            <span>
              <strong>{testResult.success ? '✅ Conexão bem-sucedida:' : '❌ Falha na conexão:'}</strong>{' '}
              {testResult.message}
            </span>
            <button
              onClick={() => setTestResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
            >
              <Close size={16} />
            </button>
          </div>
        )}

        {/* Save Success Alert */}
        {saveSuccess && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#DCFCE7',
              color: '#15803D',
              fontSize: '0.875rem'
            }}
          >
            ✅ Variáveis de ambiente salvas com sucesso no arquivo <strong>backend/.env</strong>!
          </div>
        )}

        {/* Toggle View .env Snippet */}
        <div style={{ marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => setShowEnvSnippet(!showEnvSnippet)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#4B5563',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: 0,
              fontWeight: 600
            }}
          >
            <FileText size={16} />
            <span>{showEnvSnippet ? 'Ocultar bloco de texto do .env' : 'Ver e copiar variáveis no formato .env'}</span>
          </button>

          {showEnvSnippet && (
            <div style={{ marginTop: '10px', position: 'relative' }}>
              <pre
                style={{
                  background: '#18181B',
                  color: '#F4F4F5',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  margin: 0,
                  lineHeight: 1.5
                }}
              >
                {envSnippet}
              </pre>
              <button
                type="button"
                onClick={handleCopyEnv}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  backgroundColor: copied ? '#10B981' : '#27272A',
                  color: '#FFFFFF',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copied ? '✓ Copiado!' : 'Copiar .env'}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px',
            marginTop: '12px',
            paddingTop: '16px',
            borderTop: '1px solid #F4F4F5'
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting || !dbConfig.db_host}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Refresh size={16} className={isTesting ? 'spinning' : ''} />
            <span>{isTesting ? 'Testando Conexão...' : 'Testar Conexão'}</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleSaveConfig}
            disabled={isSaving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <CheckDouble size={16} />
            <span>{isSaving ? 'Salvando...' : 'Salvar Variáveis no .env'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
