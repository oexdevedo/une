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
  const [currentStep, setCurrentStep] = useState(0);
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

  // Agrupa campos em páginas de 2 componentes cada + 1 etapa final de revisão/envio
  const allFields = form.fields || [];
  const fieldPages = [];
  for (let i = 0; i < allFields.length; i += 2) {
    fieldPages.push(allFields.slice(i, i + 2));
  }
  const totalSteps = fieldPages.length + 1;
  const isFinalStep = currentStep >= fieldPages.length;

  const handleNextStep = () => {
    const currentFields = fieldPages[currentStep] || [];
    for (const f of currentFields) {
      if (f.required && (!answers[f.name] || String(answers[f.name]).trim() === '')) {
        alert(`Por favor, preencha o campo obrigatório: ${f.label || f.name}`);
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="public-form-wrapper" style={{ backgroundColor: form.background_color || '#f8fafc' }}>
      <div className="public-form-card public-form-wizard-card">
        {/* SIDEBAR ESQUERDA: BANNER, TÍTULO E ETAPAS */}
        <aside className="public-form-sidebar">
          {form.banner_url && (
            <div className="public-form-sidebar-banner">
              <img src={form.banner_url} alt={form.title} />
            </div>
          )}

          <div className="public-form-badge" style={{ backgroundColor: `${primaryCol}18`, color: primaryCol }}>
            <ClipboardNote size={14} /> Formulário Oficial
          </div>

          <h1 className="public-form-sidebar-title">{form.title}</h1>
          {form.description && (
            <p className="public-form-sidebar-desc">{form.description}</p>
          )}

          <div className="public-form-steps-list">
            {fieldPages.map((pageFields, idx) => {
              const isDone = idx < currentStep;
              const isActive = idx === currentStep;
              const stepLabel = pageFields.map(f => f.label).filter(Boolean).join(' & ');
              return (
                <button
                  key={idx}
                  type="button"
                  className={`public-form-step-item ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                  onClick={() => {
                    if (idx < currentStep) setCurrentStep(idx);
                  }}
                  disabled={idx > currentStep}
                  style={isActive ? { borderColor: primaryCol, backgroundColor: `${primaryCol}10` } : undefined}
                >
                  <span
                    className="public-form-step-num"
                    style={isActive || isDone ? { backgroundColor: primaryCol, color: '#fff' } : undefined}
                  >
                    {isDone ? <Check size={12} /> : idx + 1}
                  </span>
                  <span className="public-form-step-text">
                    <strong>Etapa {idx + 1}</strong>
                    <small>{stepLabel || `Campos ${idx * 2 + 1}-${idx * 2 + pageFields.length}`}</small>
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              className={`public-form-step-item ${isFinalStep ? 'active' : ''}`}
              disabled={!isFinalStep}
              style={isFinalStep ? { borderColor: primaryCol, backgroundColor: `${primaryCol}10` } : undefined}
            >
              <span
                className="public-form-step-num"
                style={isFinalStep ? { backgroundColor: primaryCol, color: '#fff' } : undefined}
              >
                {fieldPages.length + 1}
              </span>
              <span className="public-form-step-text">
                <strong>Revisão e Envio</strong>
                <small>{form.enable_booking ? 'Agenda, LGPD e envio' : 'Conferir dados e enviar'}</small>
              </span>
            </button>
          </div>
        </aside>

        {/* PAINEL DIREITO: CAMPOS DA ETAPA ATUAL OU REVISÃO FINAL */}
        <main className="public-form-main">
          <div className="public-form-step-header">
            <span className="public-form-step-counter" style={{ color: primaryCol }}>
              Etapa {currentStep + 1} de {totalSteps}
            </span>
            <h2 className="public-form-step-heading">
              {isFinalStep ? 'Revisão e Finalização' : `Preencha os dados (${currentStep + 1}/${fieldPages.length})`}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="public-form-body">
            {!isFinalStep ? (
              <div className="public-form-page-fields">
                {(fieldPages[currentStep] || []).map((field, idx) => (
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
              </div>
            ) : (
              <div className="public-form-review-section">
                {/* RESUMO DAS RESPOSTAS */}
                <div className="public-form-review-grid">
                  {allFields.map((field, idx) => (
                    <div key={field.id || idx} className="public-form-review-item">
                      <span className="public-form-review-label">{field.label}</span>
                      <strong className="public-form-review-value">
                        {answers[field.name] ? String(answers[field.name]) : '—'}
                      </strong>
                    </div>
                  ))}
                </div>

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
              </div>
            )}

            {/* RODAPÉ DE NAVEGAÇÃO DO WIZARD */}
            <div className="public-form-wizard-footer">
              {currentStep > 0 ? (
                <button
                  type="button"
                  className="public-form-nav-btn secondary"
                  onClick={handlePrevStep}
                >
                  &lt; Voltar
                </button>
              ) : (
                <span />
              )}

              {!isFinalStep ? (
                <button
                  type="button"
                  className="public-form-nav-btn primary"
                  style={{ backgroundColor: primaryCol }}
                  onClick={handleNextStep}
                >
                  Próximo &gt;
                </button>
              ) : (
                <button
                  type="submit"
                  className="public-form-submit-btn"
                  style={{ backgroundColor: primaryCol, marginTop: 0, width: 'auto', padding: '12px 28px' }}
                  disabled={submitting}
                >
                  {submitting ? 'Enviando dados...' : (form.button_text || 'Enviar Dados')}
                </button>
              )}
            </div>
          </form>
        </main>
      </div>

      <div className="public-form-footer-credit">
        <span>Garantia de privacidade e proteção de dados • <strong>Unne CRM</strong></span>
      </div>
    </div>
  );
}

