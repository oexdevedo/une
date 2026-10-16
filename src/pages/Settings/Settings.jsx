import React, { useState } from 'react';
import './Settings.css';
import {
  User,
  Mail,
  Lock,
  Save,
  Shield
} from 'pixelarticons/react';

export default function Settings() {
  const [formData, setFormData] = useState({
    name: '',
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
      await fetch('http://localhost:3001/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.newPassword || undefined
        })
      });
      alert('Configurações da conta salvas no banco de dados com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar no banco de dados.');
    }
  };

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h1>Configurações da Conta</h1>
        <p>Gerencie seus dados pessoais, email e segurança.</p>
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

          <div className="settings-footer">
            <button type="button" className="btn-light">Cancelar</button>
            <button type="submit" className="btn-primary"><Save size={18} /> Salvar Alterações</button>
          </div>

        </form>
      </div>
    </div>
  );
}
