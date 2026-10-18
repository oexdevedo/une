import React, { useState, useEffect, useRef } from 'react';
import './MassMessage.css';
import {
  Users,
  Message,
  Sliders,
  Play,
  Refresh,
  Clock,
  Send,
  Attachment,
  Upload,
  Bulletlist,
  Plus,
  Calendar,
  FileText,
  ChartBarBig,
  Check,
  Close,
  WarningDiamond
} from 'pixelarticons/react';

export default function MassMessage() {
  const [activeTab, setActiveTab] = useState('mensagem');
  const [messageText, setMessageText] = useState('Oi {primeiro_nome}! {Tudo bem?|Como vai?}\n\nAqui é a equipe Unne, passando para avisar sobre a nossa novidade.');
  const [previewText, setPreviewText] = useState('');
  
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);

  useEffect(() => {
    if (isTemplateModalOpen) {
      fetch('/api/templates?workspace_id=1')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setSavedTemplates(data);
          } else {
            const st = localStorage.getItem('unne_templates');
            if (st) {
              try { setSavedTemplates(JSON.parse(st)); } catch (e) {}
            }
          }
        })
        .catch(err => {
          console.error(err);
          const st = localStorage.getItem('unne_templates');
          if (st) {
            try { setSavedTemplates(JSON.parse(st)); } catch (e) {}
          }
        });
    }
  }, [isTemplateModalOpen]);

  const handleLoadTemplate = (content) => {
    setMessageText(content);
    setIsTemplateModalOpen(false);
  };
  
  const [attachment, setAttachment] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const variables = ['{primeiro_nome}', '{nome}', '{saudacao}', '{profissao}', '{regiao}', '{email}'];

  const parseSpintax = (text) => {
    let parsed = text;
    // Mock variable replacement
    parsed = parsed.replace(/{primeiro_nome}/g, 'João');
    parsed = parsed.replace(/{nome}/g, 'João Silva');
    parsed = parsed.replace(/{saudacao}/g, 'Bom dia');
    
    // Spintax {a|b|c} replacement
    const spintaxRegex = /\{([^{}]*)\}/g;
    parsed = parsed.replace(spintaxRegex, (match, contents) => {
      if (!contents.includes('|')) return match;
      const options = contents.split('|');
      const randomOption = options[Math.floor(Math.random() * options.length)];
      return randomOption;
    });
    
    return parsed;
  };

  useEffect(() => {
    setPreviewText(parseSpintax(messageText));
  }, [messageText]);

  const insertVariable = (variable) => {
    setMessageText(prev => prev + ' ' + variable);
  };

  const handleTestSpintax = () => {
    setPreviewText(parseSpintax(messageText));
  };

  return (
    <div className="mass-container">
      
      {/* TOP NAVIGATION (TAB BAR) */}
      <div className="mass-tab-nav">
        <div className="tab-nav-left">
          <div className="brand-title">
            <Send size={24} style={{color: 'var(--primary)'}} />
            <h2>Msg em Massa</h2>
          </div>
        </div>
        <div className="tab-nav-center">
          <button 
            className={`tab-btn ${activeTab === 'mensagem' ? 'active' : ''}`}
            onClick={() => setActiveTab('mensagem')}
          >
            Mensagem
          </button>
          <button 
            className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuração
          </button>
          <button 
            className={`tab-btn ${activeTab === 'disparo' ? 'active' : ''}`}
            onClick={() => setActiveTab('disparo')}
          >
            Disparo
          </button>
          <button 
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Relatórios
          </button>
        </div>
        <div className="tab-nav-right">
          <div className="nav-badges">
            <span className="badge success">WhatsApp Conectado</span>
          </div>
        </div>
      </div>

      <div className="mass-content-area">
        
        {/* TABS CONTENT */}
        
        {activeTab === 'mensagem' && (
          <div className="tab-pane active animated-fade">
            <div className="mass-dashboard-2col">
              
              <div className="premium-card">
                <div className="card-header">
                  <div className="card-title"><Users size={20} /> Destinatários da Campanha</div>
                  <button className="btn-pill btn-light"><Bulletlist size={14}/> Listas Salvas</button>
                </div>
                
                <div className="form-group">
                  <label>Selecionar Lista de Contatos:</label>
                  <select className="modern-input">
                    <option>Frios (0 contatos)</option>
                    <option>Clientes Base (142 contatos)</option>
                    <option>Leads Campanha Ads (85 contatos)</option>
                  </select>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span style={{fontSize: '0.85rem', color: '#a1a5b7'}}>0 contato(s) carregado(s)</span>
                  <button className="btn-pill btn-light"><Plus size={14}/> Importar CSV</button>
                </div>
              </div>

              <div className="premium-card" style={{gridColumn: '1 / -1'}}>
                <div className="card-header">
                  <div className="card-title"><Message size={20} /> Compor Mensagem</div>
                  <button className="btn-pill btn-light" onClick={() => setIsTemplateModalOpen(true)}>
                    <Plus size={14}/> Carregar Template
                  </button>
                </div>
                
                <div className="form-group">
                  <textarea 
                    className="modern-input message-textarea"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="{Olá|Oi} {primeiro_nome}! Escreva sua mensagem aqui..."
                  />
                  
                  <div className="variables-bar">
                    {variables.map(v => (
                      <div key={v} className="var-tag" onClick={() => insertVariable(v)}>
                        + {v}
                      </div>
                    ))}
                    <div className="var-tag" style={{border: '1px dashed var(--primary)', color: 'var(--text-main)', backgroundColor: 'var(--primary-light)'}} onClick={() => insertVariable('{OpçãoA|OpçãoB}')}>
                      + Inserir Spintax
                    </div>
                  </div>
                </div>

                <div className="attachment-box">
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#3f4254', fontWeight: 600}}>
                    <Attachment size={18} /> 
                    {attachment ? (
                      <span style={{color: 'var(--primary-dark)', wordBreak: 'break-all'}}>{attachment.name}</span>
                    ) : (
                      <span>Anexar Arquivo (Mídia/Documento)</span>
                    )}
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{display: 'none'}} 
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileChange}
                  />
                  {attachment ? (
                    <button 
                      className="btn-pill btn-light" 
                      style={{color: '#ef4444', borderColor: '#fecaca'}} 
                      onClick={() => setAttachment(null)}
                    >
                      <Close size={16}/> Remover
                    </button>
                  ) : (
                    <button className="btn-pill btn-light" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={16}/> Escolher Mídia
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="tab-pane active animated-fade">
            <div className="premium-card" style={{maxWidth: '800px', margin: '0 auto'}}>
              <div className="card-header">
                <div className="card-title"><Sliders size={20} /> Configurações de Motor Anti-Ban</div>
              </div>
              
              <p style={{color: '#a1a5b7', marginBottom: '32px', fontSize: '0.95rem'}}>
                Configure o comportamento do disparo para simular o uso humano e evitar bloqueios na sua conta de WhatsApp.
              </p>
              
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Atraso Mínimo entre mensagens (segundos)</label>
                  <input type="number" className="modern-input" defaultValue={20} />
                </div>
                <div className="form-group flex-1">
                  <label>Atraso Máximo (segundos)</label>
                  <input type="number" className="modern-input" defaultValue={50} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Pausar envio a cada (qtd de mensagens)</label>
                  <input type="number" className="modern-input" defaultValue={15} />
                </div>
                <div className="form-group flex-1">
                  <label>Tempo de pausa em lote (segundos)</label>
                  <input type="number" className="modern-input" defaultValue={90} />
                </div>
              </div>

              <div className="form-group">
                <label>Linha de WhatsApp Remetente</label>
                <select className="modern-input">
                  <option>Linha 1 (Principal) - Conectado</option>
                  <option>Revezamento (Round-Robin Múltiplas Linhas)</option>
                </select>
              </div>
              
              <div style={{marginTop: '24px', padding: '16px', backgroundColor: '#fff8db', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start'}}>
                <WarningDiamond size={24} color="#b48300" style={{flexShrink: 0}} />
                <div>
                  <h4 style={{margin: '0 0 4px 0', color: '#b48300', fontSize: '0.95rem'}}>Recomendação de Segurança</h4>
                  <p style={{margin: 0, color: '#8c6600', fontSize: '0.85rem'}}>Para listas frias, não recomendamos enviar mais de 100 mensagens por dia por linha. Use spintax ativamente e mantenha uma variação alta no delay.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'disparo' && (
          <div className="tab-pane active animated-fade">
            <div className="mass-dashboard-2col" style={{gridTemplateColumns: '1fr 1fr'}}>
              
              {/* Preview Box */}
              <div className="premium-card">
                 <div className="card-header">
                   <div className="card-title"><FileText size={20} /> Preview da Mensagem</div>
                 </div>
                 
                 <div className="preview-window">
                    <div className="preview-top">
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                        <div style={{width: 36, height: 36, borderRadius: '50%', backgroundColor: 'white', color: '#075E54', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'}}>M</div>
                        <div>
                          <div style={{fontWeight: 600, fontSize: '0.95rem'}}>Exemplo de Lead</div>
                          <div style={{fontSize: '0.75rem', opacity: 0.9}}>online</div>
                        </div>
                      </div>
                    </div>
                    <div className="preview-chat">
                      <div className="chat-bubble">
                        {previewText ? (
                          <div style={{ whiteSpace: 'pre-wrap' }}>{previewText}</div>
                        ) : (
                          <span style={{color: '#667781', fontStyle: 'italic', fontSize: '0.85rem'}}>Clique no botão abaixo para gerar uma simulação com spintax e variáveis...</span>
                        )}
                      </div>
                    </div>
                 </div>
                 
                 <div style={{display: 'flex', justifyContent: 'center', marginTop: '24px'}}>
                    <button className="btn-pill btn-light" onClick={handleTestSpintax}>
                      <Refresh size={14}/> Gerar Variação Aleatória
                    </button>
                 </div>
              </div>

              {/* Action Box */}
              <div style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
                <div className="premium-card">
                  <div className="card-header">
                    <div className="card-title"><Clock size={20} /> Agendamento</div>
                  </div>
                  <p style={{fontSize: '0.9rem', color: '#a1a5b7', marginBottom: '16px'}}>
                    Selecione uma data e hora para que o sistema inicie o disparo automaticamente. Deixe em branco para começar no momento do clique.
                  </p>
                  <input type="datetime-local" className="modern-input" />
                </div>
                
                <div className="premium-card" style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                  <div style={{textAlign: 'center', marginBottom: '32px'}}>
                    <div style={{fontSize: '3rem', fontWeight: 800, color: '#1e1e2d'}}>0</div>
                    <div style={{fontSize: '0.9rem', color: '#a1a5b7', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>Contatos Prontos Para Envio</div>
                  </div>
                  
                  <button className="btn-huge btn-primary">
                    <Send size={24} /> INICIAR DISPARO
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="tab-pane active animated-fade">
            <div className="premium-card" style={{marginBottom: '24px'}}>
              <div className="card-header">
                <div className="card-title"><ChartBarBig size={20} /> Desempenho da Última Campanha</div>
                <select className="modern-input" style={{width: 'auto', padding: '8px 16px', minHeight: 'auto'}}>
                  <option>Campanha Atual</option>
                  <option>Disparo Mães (Semana Passada)</option>
                </select>
              </div>
              
              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Total Processado</div>
                </div>
                <div className="stat-box success">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Enviadas <Check size={14}/></div>
                </div>
                <div className="stat-box error">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Falhas <Close size={14}/></div>
                </div>
              </div>
            </div>

            <div className="premium-card">
              <div className="card-header">
                <div className="card-title">Console de Logs em Tempo Real</div>
                <button className="btn-pill btn-light">Exportar CSV</button>
              </div>
              
              <div className="logs-terminal">
                <div className="log-entry info">[10:00:00] Sistema pronto. Aguardando inicialização da campanha...</div>
                {/* Simulated future logs */}
                {/* <div className="log-entry success">[10:01:23] Enviado com sucesso para +55 11 9999-9999</div> */}
                {/* <div className="log-entry warning">[10:01:24] Pausa de 45 segundos acionada (Anti-ban)...</div> */}
              </div>
            </div>
          </div>
        )}

      </div>

      {isTemplateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTemplateModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Carregar Template</h2>
              <button className="btn-icon" onClick={() => setIsTemplateModalOpen(false)}>
                <Close size={24} />
              </button>
            </div>
            <div className="modal-body">
              {savedTemplates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                  Você ainda não salvou nenhum template. Crie-os na página Templates.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                  {savedTemplates.map(t => (
                    <div 
                      key={t.id} 
                      onClick={() => handleLoadTemplate(t.content)}
                      style={{ 
                        padding: '12px', 
                        border: '1px solid var(--border)', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        backgroundColor: 'var(--surface)',
                        transition: 'background 0.2s' 
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface)'}
                    >
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'var(--text-main)' }}>{t.title || 'Sem título'}</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
