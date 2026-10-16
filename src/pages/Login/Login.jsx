import React, { useState } from 'react';
import {
  Eye,
  EyeOff
} from 'pixelarticons/react';
import './Login.css';

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  return (
    <div className="login-container">
      
      {/* Lado Esquerdo - Formulário */}
      <div className="login-left">
        <div className="login-form-wrapper">
          <div className="login-header">
            {isRegistering ? (
              <>
                <h1>Crie sua conta</h1>
                <p>Comece a gerenciar tudo em um Único Sistema.</p>
              </>
            ) : (
              <>
                <h1>Bem vindo<br/>ao Unico.</h1>
                <p>Um Único Sistema, Mil funcionários.</p>
              </>
            )}
          </div>

          <form className="login-form" onSubmit={(e) => { e.preventDefault(); window.location.href = '/'; }}>
            
            {isRegistering && (
              <div className="form-group">
                <input 
                  type="text" 
                  className="login-input" 
                  placeholder="Nome Completo" 
                  required 
                />
              </div>
            )}

            <div className="form-group">
              <input 
                type={isRegistering ? "email" : "text"} 
                className="login-input" 
                placeholder={isRegistering ? "E-mail" : "E-mail ou Usuário"} 
                required 
              />
            </div>

            <div className="form-group password-group">
              <input 
                type={showPassword ? 'text' : 'password'} 
                className="login-input" 
                placeholder="Senha" 
                required 
              />
              <button 
                type="button" 
                className="toggle-password" 
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            {isRegistering && (
              <div className="form-group password-group">
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  className="login-input" 
                  placeholder="Confirmar Senha" 
                  required 
                />
              </div>
            )}

            {!isRegistering && (
              <div className="forgot-password">
                <a href="#">Esqueceu a senha?</a>
              </div>
            )}

            <button type="submit" className="btn-login-submit" style={{ marginTop: isRegistering ? '24px' : '0' }}>
              {isRegistering ? 'Cadastrar' : 'Entrar'}
            </button>

            <p className="register-link">
              {isRegistering ? (
                <>Já tem uma conta? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(false); }}>Entre agora</a></>
              ) : (
                <>Não tem uma conta? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); }}>Registre-se agora</a></>
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
