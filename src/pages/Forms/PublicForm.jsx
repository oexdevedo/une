// File: src/pages/Forms/PublicForm.jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './PublicForm.css';
import { Check, ClipboardNote, Message, ExternalLink } from 'pixelarticons/react';

export default function PublicForm() {
  const { slug } = useParams();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInactive, setIsInactive] = useState(false);

  // Estado dos campos preenchidos
  const [answers, setAnswers] = useState({});
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successInfo, setSuccessInfo] = useState({ message: '', redirect_url: '' });

  // Carrega dados públicos do formulário
  useEffect(() => {
    async function loadForm() {
      setLoading(true);
      setError(null);
      setIsInactive(false);
      try {
        const res = await fetch(`/api/public/forms/${slug}`);
        const data = await res.json();

        if (res.status === 403 && data.is_inactive) {
          setIsInactive(true);
          setForm(data);
        } else if (res.ok && data.success) {
          setForm(data.form);
          // Inicializa campos
          const initial = {};
          (data.form.fields || []).forEach(f => {
            initial[f.name] = '';
          });
          setAnswers(initial);
        } else {
          setError(data.error || 'Formulário não encontrado ou link expirado.');
        }
      } catch (err) {
        console.error(err);
        setError('Erro de conexão ao carregar formulário. Tente novamente mais tarde.');
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadForm();
    }
  }, [slug]);

  // Máscara inteligente para Telefone/WhatsApp
  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleInputChange = (field, value) => {
    let finalVal = value;
    if (field.type === 'phone') {
      finalVal = formatPhone(value);
    }
    setAnswers(prev => ({
      ...prev,
      [field.name]: finalVal
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form || submitting) return;

    // Validação básica de obrigatórios no frontend
    for (const f of form.fields || []) {
      if (f.required && (!answers[f.name] || String(answers[f.name]).trim() === '')) {
        alert(`Por favor, preencha o campo obrigatório: ${f.label || f.name}`);
        return;
      }
    }

    if (!lgpdConsent) {
      alert('Por favor, concorde com o termo de consentimento LGPD para enviar seus dados.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/forms/${slug}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...answers, lgpd_consent: lgpdConsent })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsSubmitted(true);
        setSuccessInfo({
          message: data.message || form.success_message || 'Dados enviados com sucesso!',
          redirect_url: data.redirect_url || form.redirect_url || ''
        });

        // Se houver redirect_url configurado, redireciona após 3 segundos
        if (data.redirect_url || form.redirect_url) {
          const targetUrl = data.redirect_url || form.redirect_url;
          setTimeout(() => {
            window.location.href = targetUrl;
          }, 2800);
        }
      } else {
        alert(data.error || 'Erro ao enviar dados. Verifique os campos e tente novamente.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao enviar o formulário.');
    } finally {
      setSubmitting(false);
    }
  };

  // ESTADO: CARREGANDO
  if (loading) {
    return (
      <div className="public-form-wrapper">
        <div className="public-form-card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <ClipboardNote size={40} className="spin" style={{ color: '#6366f1', marginBottom: '14px' }} />
          <h3 style={{ color: '#1e293b', margin: 0 }}>Carregando formulário...</h3>
        </div>
      </div>
    );
  }

  // ESTADO: INATIVO / PAUSADO
  if (isInactive) {
    return (
      <div className="public-form-wrapper">
        <div className="public-form-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div className="public-form-status-icon inactive">
            <ClipboardNote size={36} color="#64748b" />
          </div>
          <h2 style={{ color: '#0f172a', margin: '14px 0 8px' }}>Formulário Encerrado</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Este formulário foi pausado ou está temporariamente fora do ar e não está aceitando novas respostas no momento.
          </p>
        </div>
      </div>
    );
  }

  // ESTADO: ERRO / NÃO ENCONTRADO
  if (error || !form) {
    return (
      <div className="public-form-wrapper">
        <div className="public-form-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div className="public-form-status-icon error">
            <ClipboardNote size={36} color="#ef4444" />
          </div>
          <h2 style={{ color: '#0f172a', margin: '14px 0 8px' }}>Página Não Encontrada</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '420px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            {error || 'O link do formulário informado é inválido ou não existe mais.'}
          </p>
        </div>
      </div>
    );
  }

  // ESTADO: SUCESSO PÓS-ENVIO
  if (isSubmitted) {
    return (
      <div className="public-form-wrapper" style={{ backgroundColor: form.background_color || '#f8fafc' }}>
        <div className="public-form-card success-card">
          <div className="public-form-status-icon success" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
            <Check size={40} />
          </div>

          <h2 style={{ color: '#0f172a', margin: '16px 0 10px', fontSize: '1.5rem', fontWeight: 800 }}>
            Informações Enviadas!
          </h2>

          <p style={{ color: '#475569', fontSize: '1.02rem', lineHeight: 1.6, maxWidth: '460px', margin: '0 auto 24px' }}>
            {successInfo.message}
          </p>

          {successInfo.redirect_url && (
            <div className="public-form-redirect-box">
              <span style={{ fontSize: '0.88rem', color: '#64748b' }}>Redirecionando em instantes...</span>
              <a 
                href={successInfo.redirect_url} 
                className="public-form-redirect-link"
                style={{ backgroundColor: form.primary_color || '#6366f1' }}
              >
                Clique aqui para prosseguir imediatamente <ExternalLink size={14} />
              </a>
            </div>
          )}

          <button 
            type="button" 
            className="public-form-btn-reset" 
            onClick={() => {
              setIsSubmitted(false);
              const resetAnswers = {};
              (form.fields || []).forEach(f => { resetAnswers[f.name] = ''; });
              setAnswers(resetAnswers);
            }}
          >
            Enviar outra resposta
          </button>
        </div>

        <div className="public-form-footer-credit">
          <span>Desenvolvido com <strong>Unne CRM</strong></span>
        </div>
      </div>
    );
  }

  const primaryCol = form.primary_color || '#6366f1';

  return (
    <div className="public-form-wrapper" style={{ backgroundColor: form.background_color || '#f8fafc' }}>
      <div className="public-form-card">
        {/* BANNER DA EMPRESA (QUANDO CONFIGURADO) */}
        {form.banner_url && (
          <div style={{ margin: '-36px -32px 24px -32px', borderRadius: '20px 20px 0 0', overflow: 'hidden', borderBottom: '1px solid #e2e8f0' }}>
            <img
              src={form.banner_url}
              alt={form.title}
              style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* CABEÇALHO DO FORMULÁRIO */}
        <div className="public-form-header">
          <div className="public-form-badge" style={{ backgroundColor: `${primaryCol}18`, color: primaryCol }}>
            <ClipboardNote size={16} /> Formulário Oficial
          </div>

          <h1 className="public-form-title">{form.title}</h1>

          {form.description && (
            <p className="public-form-desc">{form.description}</p>
          )}
        </div>

        {/* FORMULÁRIO DINÂMICO */}
        <form onSubmit={handleSubmit} className="public-form-body">
          {form.fields && form.fields.map((field, idx) => (
            <div key={field.id || idx} className="public-form-group">
              <label className="public-form-label">
                {field.label}
                {field.required && <span className="public-form-required-star"> *</span>}
              </label>

              {field.type === 'textarea' ? (
                <textarea
                  className="public-form-input textarea"
                  rows={4}
                  placeholder={field.placeholder || 'Digite sua resposta...'}
                  value={answers[field.name] || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  required={Boolean(field.required)}
                />
              ) : field.type === 'select' ? (
                <select
                  className="public-form-input select"
                  value={answers[field.name] || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  required={Boolean(field.required)}
                >
                  <option value="">Selecione uma opção...</option>
                  {(field.options || []).map((opt, optIdx) => (
                    <option key={optIdx} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === 'phone' ? (
                <div className="public-form-input-with-icon">
                  <span className="input-icon-prefix">
                    <Message size={16} color={primaryCol} />
                  </span>
                  <input
                    type="tel"
                    className="public-form-input has-prefix"
                    placeholder={field.placeholder || '(11) 99999-9999'}
                    value={answers[field.name] || ''}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    required={Boolean(field.required)}
                  />
                </div>
              ) : (
                <input
                  type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                  className="public-form-input"
                  placeholder={field.placeholder || ''}
                  value={answers[field.name] || ''}
                  onChange={(e) => handleInputChange(field, e.target.value)}
                  required={Boolean(field.required)}
                />
              )}
            </div>
          ))}

          {/* RESERVA DE DATA NA AGENDA (QUANDO ATIVADA) */}
          {form.enable_booking && (
            <div className="public-form-booking-box" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📅 Escolha uma Data e Horário para Atendimento <span className="public-form-required-star">*</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div className="public-form-group" style={{ flex: 1, minWidth: '150px' }}>
                  <label className="public-form-label" style={{ fontSize: '0.78rem', color: '#64748b' }}>Data:</label>
                  <input
                    type="date"
                    className="public-form-input"
                    min={new Date().toISOString().split('T')[0]}
                    value={answers.booking_date || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, booking_date: e.target.value }))}
                    required
                  />
                </div>
                <div className="public-form-group" style={{ flex: 1, minWidth: '130px' }}>
                  <label className="public-form-label" style={{ fontSize: '0.78rem', color: '#64748b' }}>Horário:</label>
                  <input
                    type="time"
                    className="public-form-input"
                    value={answers.booking_time || '09:00'}
                    onChange={(e) => setAnswers(prev => ({ ...prev, booking_time: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* TERMO DE CONSENTIMENTO LGPD */}
          <div className="public-form-lgpd-box" style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
              <input
                type="checkbox"
                checked={lgpdConsent}
                onChange={(e) => setLgpdConsent(e.target.checked)}
                required
                style={{ marginTop: '3px', accentColor: primaryCol, width: '16px', height: '16px', flexShrink: 0 }}
              />
              <span>
                Concordo com o tratamento dos meus dados pessoais para fins de contato e atendimento, conforme a{' '}
                <strong>Lei Geral de Proteção de Dados (LGPD)</strong>. <span className="public-form-required-star">*</span>
              </span>
            </label>
          </div>

          {/* BOTÃO DE ENVIO COM COR DO TEMA */}
          <button
            type="submit"
            className="public-form-submit-btn"
            style={{ backgroundColor: primaryCol }}
            disabled={submitting}
          >
            {submitting ? 'Enviando dados...' : (form.button_text || 'Enviar Dados')}
          </button>
        </form>
      </div>

      <div className="public-form-footer-credit">
        <span>Garantia de privacidade e proteção de dados • <strong>Unne CRM</strong></span>
      </div>
    </div>
  );
}

