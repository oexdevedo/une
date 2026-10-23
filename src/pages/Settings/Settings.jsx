import React, { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import './Settings.css';
import {
  User,
  Mail,
  Lock,
  Save,
  Shield,
  Logout,
  Download,
  Upload,
  Link as LinkIcon
} from 'pixelarticons/react';
import Connections from '../Connections/Connections';
import { getCurrentUser, isUserAdmin } from '../../utils/workspace';

export default function Settings({ initialTab }) {
  const currentUser = getCurrentUser();
  const isAdmin = isUserAdmin(currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab) return initialTab;
    if (tabParam === 'conexoes' || location.pathname.includes('/conexoes')) return 'conexoes';
    return 'perfil';
  });

  useEffect(() => {
    if (tabParam === 'conexoes' || location.pathname.includes('/conexoes')) {
      setActiveTab('conexoes');
    } else if (tabParam === 'perfil' || location.pathname === '/configuracoes') {
      if (!tabParam) setActiveTab('perfil');
    }
  }, [tabParam, location.pathname]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const [uploadingDb, setUploadingDb] = useState(false);
  const [formData, setFormData] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('unne_user') || 'null');
      return {
        name: u?.name || '',
        username: (u?.username || '').replace(/^@+/, ''),
        email: u?.email || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    } catch {
      return {
        name: '',
        username: '',
        email: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    }
  });

  useEffect(() => {
    const cachedUser = JSON.parse(localStorage.getItem('unne_user') || 'null');
    if (!cachedUser || !cachedUser.id) {
      window.location.href = '/login';
      return;
    }

    fetch('/api/users/me', {
      headers: {
        'x-user-id': cachedUser.id
      }
    })
      .then(r => {
        if (r.status === 401 || r.status === 404) {
          localStorage.removeItem('unne_user');
          window.location.href = '/login';
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (data && data.name) {
          setFormData(prev => ({
            ...prev,
            name: data.name || '',
            username: (data.username || '').replace(/^@+/, ''),
            email: data.email || ''
          }));
        }
      })
      .catch(console.error);
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      alert('A nova senha e a confirmação não batem.');
      return;
    }

    const cachedUser = JSON.parse(localStorage.getItem('unne_user') || 'null');
    if (!cachedUser || !cachedUser.id) {
      alert('Sessão expirada. Faça login novamente.');
      window.location.href = '/login';
      return;
    }

    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': cachedUser.id
        },
        body: JSON.stringify({
          user_id: cachedUser.id,
          name: formData.name,
          username: formData.username,
          email: formData.email,
          password: formData.newPassword || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Configurações da conta salvas com sucesso!');
        // Atualiza cache local
        const updatedUser = {
          ...cachedUser,
          name: formData.name,
          username: `@${formData.username.replace(/^@+/, '')}`,
          email: formData.email
        };
        localStorage.setItem('unne_user', JSON.stringify(updatedUser));
        window.dispatchEvent(new Event('user-updated'));
        setFormData(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));
      } else {
        alert('Erro ao salvar: ' + (data.error || 'Verifique os dados informados'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar no banco de dados.');
    }
  };

  const handleUploadDatabase = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm(`Tem certeza que deseja restaurar o banco de dados com o arquivo "${file.name}"? Todos os dados serão sincronizados com este arquivo.`)) {
      e.target.value = '';
      return;
    }

    setUploadingDb(true);
    const formDataUpload = new FormData();
    formDataUpload.append('database', file);

    try {
      const res = await fetch('/api/admin/database/upload', {
        method: 'POST',
        headers: {
          'x-user-id': String(currentUser?.id || '')
        },
        body: formDataUpload
      });
      const data = await res.json();
      if (data.success) {
        alert('Banco de dados importado com sucesso! A página será recarregada.');
        window.location.reload();
      } else {
        alert('Erro ao importar banco: ' + (data.error || 'Falha no processamento.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao enviar o arquivo de banco de dados.');
    } finally {
      setUploadingDb(false);
      e.target.value = '';
    }
  };

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h1>Configurações</h1>
        <p>
          {activeTab === 'perfil' 
            ? 'Gerencie seus dados pessoais, seu @usuário exclusivo, email e segurança.'
            : 'Gerencie as conexões de WhatsApp, Telegram, E-mail, Banco de Dados e IA do seu sistema.'
          }
        </p>

        {/* Tab Navigation */}
        <div className="settings-tabs">
          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'perfil' ? 'active' : ''}`}
            onClick={() => handleTabChange('perfil')}
          >
            <User size={18} />
            <span>Minha Conta</span>
          </button>

          <button 
            type="button" 
            className={`settings-tab-btn ${activeTab === 'conexoes' ? 'active' : ''}`}
            onClick={() => handleTabChange('conexoes')}
          >
            <LinkIcon size={18} />
            <span>Conexões e Integrações</span>
          </button>
        </div>
      </header>

      {activeTab === 'conexoes' ? (
        <div className="settings-tab-content">
          <Connections isSubpage={true} />
        </div>
      ) : (
        <div className="settings-content">
          <form className="settings-card" onSubmit={handleSave}>
          
          <div className="settings-section">
            <h2 className="section-title"><User size={20} /> Informações Pessoais</h2>
            
            <div className="form-group">
              <label>Nome Completo</label>
              <input 
                type="text" 
                name="name"
                className="modern-input" 
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Nome de Usuário (@)</label>
              <div className="input-with-icon">
                <span className="input-icon" style={{ fontWeight: 800, fontSize: '1rem', color: '#71717A' }}>@</span>
                <input 
                  type="text" 
                  name="username"
                  className="modern-input has-icon" 
                  placeholder="seu_usuario (estilo Instagram)"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.replace(/^@+/, '').replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase() })}
                  required
                />
              </div>
              <span style={{ fontSize: '0.8rem', color: '#71717A', marginTop: '6px', display: 'block' }}>
                Seu identificador único no sistema. Você pode usá-lo para fazer login (ex: <strong>@{formData.username || 'usuario'}</strong>).
              </span>
            </div>

            <div className="form-group">
              <label>Endereço de E-mail</label>
              <div className="input-with-icon">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  name="email"
                  className="modern-input has-icon" 
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div className="settings-section">
            <h2 className="section-title"><Shield size={20} /> Segurança e Senha</h2>
            <p className="section-subtitle">Preencha apenas se desejar alterar sua senha atual.</p>

            <div className="form-group">
              <label>Senha Atual</label>
              <div className="input-with-icon">
                <Lock size={18} className="input-icon" />
                <input 
                  type="password" 
                  name="currentPassword"
                  className="modern-input has-icon" 
                  placeholder="Sua senha atual"
                  value={formData.currentPassword}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Nova Senha</label>
                <div className="input-with-icon">
                  <Lock size={18} className="input-icon" />
                  <input 
                    type="password" 
                    name="newPassword"
                    className="modern-input has-icon" 
                    placeholder="Mínimo de 8 caracteres"
                    value={formData.newPassword}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Confirmar Nova Senha</label>
                <div className="input-with-icon">
                  <Lock size={18} className="input-icon" />
                  <input 
                    type="password" 
                    name="confirmPassword"
                    className="modern-input has-icon" 
                    placeholder="Repita a nova senha"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Gerenciamento do Banco de Dados & Backup - Restrito a Admin */}
          {isAdmin && (
            <div className="settings-section">
              <div className="section-header">
                <div className="section-icon">
                  <Download size={20} />
                </div>
                <div className="section-title-wrap">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2>Banco de Dados & Backup</h2>
                    <span style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA', padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700 }}>
                      🔒 Apenas Admin
                    </span>
                  </div>
                  <p>Baixe o backup local ou restaure no Easypanel para sincronizar todos os contatos e mensagens.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
                <a 
                  href={`/api/admin/database/download?user_id=${currentUser?.id || ''}`} 
                  download="database.sqlite" 
                  className="btn-light" 
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#F4F4F5', fontWeight: 600, color: 'var(--text-main)' }}
                >
                  <Download size={18} />
                  <span>Baixar Backup (.sqlite)</span>
                </a>

                <label 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', background: 'var(--primary)', color: '#18181B', fontWeight: 600, cursor: uploadingDb ? 'not-allowed' : 'pointer' }}
                >
                  <Upload size={18} />
                  <span>{uploadingDb ? 'Importando...' : 'Restaurar / Importar (.sqlite)'}</span>
                  <input 
                    type="file" 
                    accept=".sqlite,.db" 
                    onChange={handleUploadDatabase} 
                    disabled={uploadingDb} 
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>
            </div>
          )}

          <div className="settings-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn-danger-outline"
              onClick={() => {
                if (window.confirm('Deseja realmente sair da conta?')) {
                  localStorage.removeItem('unne_user');
                  window.location.href = '/login';
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Logout size={18} />
              <span>Sair da conta</span>
            </button>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button type="button" className="btn-light">Cancelar</button>
              <button type="submit" className="btn-primary"><Save size={18} /> Salvar Alterações</button>
            </div>
          </div>

        </form>
      </div>
      )}
    </div>
  );
}
