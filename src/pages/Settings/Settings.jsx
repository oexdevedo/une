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
  Link as LinkIcon
} from 'pixelarticons/react';
import Connections from '../Connections/Connections';

export default function Settings({ initialTab }) {
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
