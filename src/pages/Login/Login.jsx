import React, { useState } from 'react';
import {
  Eye,
  EyeOff
} from 'pixelarticons/react';
import './Login.css';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Estados de Login
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Estados de Cadastro
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const [usernameStatus, setUsernameStatus] = useState({ available: null, message: '' });
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Validação em tempo real do @username (estilo Instagram)
  const handleUsernameChange = async (value) => {
    const clean = value.replace(/^@+/, '').replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
    setRegUsername(clean);

    if (clean.length < 2) {
      setUsernameStatus({ available: null, message: '' });
      return;
    }

    try {
      const res = await fetch(`http://localhost:3001/api/users/check-username/${clean}`);
      const data = await res.json();
      if (data.available) {
        setUsernameStatus({ available: true, message: 'Disponível' });
      } else {
        setUsernameStatus({ available: false, message: 'Já em uso' });
      }
    } catch (e) {
      // silencia falha de rede temporária
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, password: loginPassword })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('unne_user', JSON.stringify(data.user));
        setSuccessMessage(`Olá, ${data.user.name || data.user.username}! Entrando no sistema...`);
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      } else {
        setErrorMessage(data.error || 'Credenciais inválidas.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Erro de comunicação com o servidor.');
    }
    setIsLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('As senhas digitadas não coincidem.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (!regUsername || regUsername.length < 2) {
      setErrorMessage('Defina um @ de usuário válido (mínimo 2 caracteres).');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName,
          username: regUsername,
          email: regEmail,
          password: regPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('unne_user', JSON.stringify(data.user));
        setSuccessMessage(`Conta @${regUsername} criada com sucesso! Entrando...`);
        setTimeout(() => {
          window.location.href = '/';
        }, 700);
      } else {
        setErrorMessage(data.error || 'Erro ao cadastrar conta.');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Erro de conexão ao cadastrar nova conta.');
    }
    setIsLoading(false);
  };

  return (
    <div className="login-container">
      
      {/* Lado Esquerdo - Formulário */}
      <div className="login-left">
        <div className="login-form-wrapper">
          <div className="login-header">
            {isRegistering ? (
              <>
                <h1>Crie sua conta</h1>
                <p>Cadastre seu <strong>@usuário exclusivo</strong> e comece agora.</p>
              </>
            ) : (
              <>
                <h1>Bem vindo<br/>ao Unico.</h1>
                <p>Um Único Sistema, Mil funcionários.</p>
              </>
            )}
          </div>

          {errorMessage && (
            <div className="login-error-alert">
              <span>⚠️ {errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="login-success-alert">
              <span>✅ {successMessage}</span>
            </div>
          )}

          <form className="login-form" onSubmit={isRegistering ? handleRegister : handleLogin}>
            
            {/* Campo Nome (Apenas Registro) */}
            {isRegistering && (
              <div className="form-group">
                <input 
                  type="text" 
                  className="login-input" 
                  placeholder="Nome Completo" 
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required 
                />
              </div>
            )}

            {/* Campo @ de Usuário estilo Instagram (Apenas Registro) */}
            {isRegistering && (
              <div className="form-group">
                <div className="input-handle-wrapper">
                  <span className="input-handle-prefix">@</span>
                  <input 
                    type="text" 
                    className="login-input has-prefix" 
                    placeholder="usuario (estilo Instagram)" 
                    value={regUsername}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    required 
                  />
                  {usernameStatus.available !== null && (
                    <span className={`handle-badge-status ${usernameStatus.available ? 'available' : 'taken'}`}>
                      {usernameStatus.message}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Campo E-mail ou @Usuário para Login / Apenas E-mail no Registro */}
            <div className="form-group">
              {isRegistering ? (
                <input 
                  type="email" 
                  className="login-input" 
                  placeholder="Endereço de E-mail" 
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required 
                />
              ) : (
                <input 
                  type="text" 
                  className="login-input" 
                  placeholder="Seu @usuário ou e-mail" 
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  autoFocus
                  required 
                />
              )}
            </div>

            {/* Campo Senha */}
            <div className="form-group password-group">
              <input 
                type={showPassword ? 'text' : 'password'} 
                className="login-input" 
                placeholder="Senha" 
                value={isRegistering ? regPassword : loginPassword}
                onChange={(e) => isRegistering ? setRegPassword(e.target.value) : setLoginPassword(e.target.value)}
                required 
              />
              <button 
                type="button" 
                className="toggle-password" 
                onClick={() => setShowPassword(!showPassword)}
                tabIndex="-1"
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            {/* Confirmação de Senha (Apenas Registro) */}
            {isRegistering && (
              <div className="form-group password-group">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  className="login-input" 
                  placeholder="Confirmar Senha" 
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  required 
                />
              </div>
            )}

            {!isRegistering && (
              <div className="forgot-password">
                <a href="#" onClick={(e) => { e.preventDefault(); alert('Para redefinir sua senha, solicite ao administrador ou use o painel de configurações.'); }}>
                  Esqueceu a senha?
                </a>
              </div>
            )}

            <button 
              type="submit" 
              className="btn-login-submit" 
              style={{ marginTop: isRegistering ? '16px' : '0' }}
              disabled={isLoading}
            >
              {isLoading ? 'Carregando...' : isRegistering ? 'Cadastrar e Entrar' : 'Entrar com @ ou E-mail'}
            </button>

            <p className="register-link">
              {isRegistering ? (
                <>Já tem uma conta? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(false); setErrorMessage(''); }}>Entre agora</a></>
              ) : (
                <>Não tem uma conta? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); setErrorMessage(''); }}>Cadastre seu @ agora</a></>
              )}
            </p>
          </form>
        </div>
      </div>

      {/* Lado Direito - Ilustração */}
      <div className="login-right">
        <div className="illustration-card" style={{ padding: 0, backgroundColor: 'transparent' }}>
          <img 
            src="/login-illustration.jpg" 
            alt="Unne CRM Illustration" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        </div>
      </div>

    </div>
  );
}
