import React, { useState } from 'react';
import './Settings.css';
import {
  User,
  Mail,
  Lock,
  Save,
  Shield,
  Logout
} from 'pixelarticons/react';

export default function Settings() {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  React.useEffect(() => {
    fetch('http://localhost:3001/api/users/me')
      .then(r => r.json())
      .then(data => {
        if (data) {
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
    try {
      const res = await fetch('http://localhost:3001/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          username: formData.username,
          email: formData.email,
          password: formData.newPassword || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Configurações da conta salvas no banco de dados com sucesso!');
        // Atualiza cache local
        const cachedUser = JSON.parse(localStorage.getItem('unne_user') || '{}');
        localStorage.setItem('unne_user', JSON.stringify({
          ...cachedUser,
          name: formData.name,
          username: `@${formData.username.replace(/^@+/, '')}`,
          email: formData.email
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
        <h1>Configurações da Conta</h1>
        <p>Gerencie seus dados pessoais, seu @usuário exclusivo, email e segurança.</p>
      </header>

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
    </div>
  );
}
