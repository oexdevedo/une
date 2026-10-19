import React, { useState, useEffect } from 'react';
import './Contracts.css';
import {
  FileText,
  Plus,
  Trash,
  MagicEdit,
  Close,
  Download,
  Zap,
  Check,
  Robot,
  Users,
  Search,
  Message,
  Sliders
} from 'pixelarticons/react';
import { getWorkspaceId } from '../../utils/workspace';
import PhoneInput from '../../components/PhoneInput/PhoneInput';

export default function Contracts() {
  const workspaceId = getWorkspaceId();
  const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'contracts'
  const [templates, setTemplates] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);

  // Template Modal State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    content: '',
    variables: [],
    agent_id: '3'
  });

  // Generate / Collect Modal State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [selectedTemplateForGen, setSelectedTemplateForGen] = useState(null);
  const [genMode, setGenMode] = useState('ai_collect'); // 'ai_collect' | 'manual'
  const [leadMode, setLeadMode] = useState('select'); // 'select' | 'manual'
  const [selectedContactId, setSelectedContactId] = useState('');
  const [manualClientName, setManualClientName] = useState('');
  const [manualClientPhone, setManualClientPhone] = useState('');
  const [manualVariableValues, setManualVariableValues] = useState({});
  const [actionStatus, setActionStatus] = useState(null);
  const [lastGeneratedPdfUrl, setLastGeneratedPdfUrl] = useState(null);

  // Contract Details Modal
  const [viewingContract, setViewingContract] = useState(null);

  useEffect(() => {
    fetchTemplates();
    fetchContracts();
    fetchContacts();
    fetchAgents();
  }, [workspaceId]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/contracts/templates?workspace_id=${workspaceId}`);
      const data = await res.json();
      setTemplates(data || []);
    } catch (err) {
      console.error('Erro ao buscar modelos:', err);
    }
  };

  const fetchContracts = async () => {
    try {
      const res = await fetch(`/api/contracts?workspace_id=${workspaceId}`);
      const data = await res.json();
      setContracts(data || []);
    } catch (err) {
      console.error('Erro ao buscar contratos:', err);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch(`/api/contacts?workspace_id=${workspaceId}`);
      const data = await res.json();
      setContacts(data || []);
    } catch (err) {
      console.error('Erro ao buscar contatos:', err);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch(`/api/agents?workspace_id=${workspaceId}`);
      const data = await res.json();
      setAgents(data || []);
    } catch (err) {
      console.error('Erro ao buscar agentes:', err);
    }
  };

  // --- Template Handlers ---
  const handleOpenNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      title: '',
      description: '',
      content: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATADA: UNICO SERVIÇOS E TECNOLOGIA LTDA
CONTRATANTE: {{nome_cliente}}, portador do CPF {{cpf}}, residente em {{endereco}}

CLÁUSULA PRIMEIRA - DO OBJETO
O presente contrato tem como objetivo a prestação do serviço de {{servico}}.

CLÁUSULA SEGUNDA - DO VALOR
O valor acordado é de {{valor}}, pago através de {{forma_pagamento}}.

Brasília/DF, {{data_atual}}.

____________________________________________
CONTRATANTE: {{nome_cliente}}`,
      variables: [
        { key: 'nome_cliente', label: 'Nome Completo', prompt: 'Para começarmos, qual o seu nome completo?', type: 'text', required: true },
        { key: 'cpf', label: 'CPF', prompt: 'Qual o seu número de CPF?', type: 'text', required: true },
        { key: 'endereco', label: 'Endereço Completo', prompt: 'Qual o seu endereço completo com cidade e CEP?', type: 'text', required: true },
        { key: 'servico', label: 'Serviço Contratado', prompt: 'Qual o serviço que você está contratando?', type: 'text', required: true },
        { key: 'valor', label: 'Valor', prompt: 'Qual o valor acordado para o contrato?', type: 'text', required: true },
        { key: 'forma_pagamento', label: 'Forma de Pagamento', prompt: 'Qual a forma de pagamento combinada?', type: 'text', required: true }
      ],
      agent_id: '3'
    });
    setIsTemplateModalOpen(true);
  };

  const handleEditTemplate = (tpl) => {
    setEditingTemplate(tpl);
    setTemplateForm({
      title: tpl.title || '',
      description: tpl.description || '',
      content: tpl.content || '',
      variables: tpl.variables || [],
      agent_id: tpl.agent_id || '3'
    });
    setIsTemplateModalOpen(true);
  };

  const handleSaveTemplate = async (e) => {
    if (e) e.preventDefault();
    if (!templateForm.title.trim()) {
      alert('Por favor, informe o título do modelo de contrato.');
      return;
    }
    setLoading(true);
    try {
      if (editingTemplate) {
        await fetch(`/api/contracts/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateForm)
        });
      } else {
        await fetch('/api/contracts/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...templateForm, workspace_id: workspaceId })
        });
      }
      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      fetchTemplates();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar modelo de contrato.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este modelo de contrato?')) return;
    try {
      await fetch(`/api/contracts/templates/${id}`, { method: 'DELETE' });
      fetchTemplates();
    } catch (err) {
      console.error(err);
    }
  };

  // Helper para detectar variáveis do texto automaticamente
  const handleDetectVariables = () => {
    const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const foundKeys = new Set();
    let match;
    while ((match = regex.exec(templateForm.content)) !== null) {
      const key = match[1].trim();
      if (key !== 'data_atual') foundKeys.add(key);
    }

    const currentMap = new Map((templateForm.variables || []).map(v => [v.key, v]));
    const updated = [];

    for (const key of foundKeys) {
      if (currentMap.has(key)) {
        updated.push(currentMap.get(key));
      } else {
        const label = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        updated.push({
          key,
          label,
          prompt: `Qual o seu ${label.toLowerCase()} para colocarmos no contrato?`,
          type: 'text',
          required: true
        });
      }
    }

    setTemplateForm(prev => ({ ...prev, variables: updated }));
    alert(`Detectadas ${foundKeys.size} variáveis dinâmicas no texto do contrato!`);
  };

  // Inserir tag de variável no cursor
  const handleInsertTag = (key) => {
    setTemplateForm(prev => ({
      ...prev,
      content: prev.content + ` {{${key}}}`
    }));
  };

  // Adicionar variável manualmente
  const handleAddVariable = () => {
    const key = `campo_${(templateForm.variables?.length || 0) + 1}`;
    setTemplateForm(prev => ({
      ...prev,
      variables: [
        ...(prev.variables || []),
        { key, label: 'Novo Campo', prompt: 'Por favor, informe este dado:', type: 'text', required: true }
      ]
    }));
  };

  const handleUpdateVariable = (index, field, value) => {
    setTemplateForm(prev => {
      const vars = [...prev.variables];
      vars[index] = { ...vars[index], [field]: value };
      return { ...prev, variables: vars };
    });
  };

  const handleRemoveVariable = (index) => {
    setTemplateForm(prev => {
      const vars = prev.variables.filter((_, i) => i !== index);
      return { ...prev, variables: vars };
    });
  };

  // --- Generate / Collect Handlers ---
  const handleOpenGenerate = (template) => {
    const tpl = template || templates[0];
    setSelectedTemplateForGen(tpl);
    setGenMode('ai_collect');
    setLeadMode('select');
    setSelectedContactId(contacts.length > 0 ? String(contacts[0].id) : '');
    setManualClientName('');
    setManualClientPhone('');
    setActionStatus(null);
    setLastGeneratedPdfUrl(null);

    // Initialize manual values
    const initialVals = {};
    if (tpl && tpl.variables) {
      tpl.variables.forEach(v => initialVals[v.key] = '');
    }
    setManualVariableValues(initialVals);
    setIsGenerateModalOpen(true);
  };

  const handleExecuteGenerate = async () => {
    if (!selectedTemplateForGen) return;

    let targetName = '';
    let targetPhone = '';

    if (leadMode === 'select') {
      const found = contacts.find(c => String(c.id) === String(selectedContactId));
      if (!found) {
        alert('Selecione um contato ou escolha preenchimento manual.');
        return;
      }
      targetName = found.name;
      targetPhone = found.phone;
    } else {
      targetName = manualClientName.trim();
      targetPhone = manualClientPhone.trim();
      if (!targetName) {
        alert('Informe o nome do cliente.');
        return;
      }
    }

    setLoading(true);
    setActionStatus('Processando...');

    try {
      if (genMode === 'ai_collect') {
        if (!targetPhone) {
          alert('Para a coleta via IA no WhatsApp, o número de telefone é obrigatório.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/contracts/start-collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selectedTemplateForGen.id,
            clientName: targetName,
            clientPhone: targetPhone,
            workspace_id: workspaceId
          })
        });

        const data = await res.json();
        if (data.success) {
          setActionStatus(`✅ Coleta iniciada com sucesso via WhatsApp com ${targetName}! O agente de IA já enviou a primeira pergunta.`);
          fetchContracts();
          setTimeout(() => {
            setIsGenerateModalOpen(false);
            setActiveTab('contracts');
          }, 2000);
        } else {
          alert(data.error || 'Erro ao iniciar coleta com o agente de IA.');
        }
      } else {
        // Modo Manual: Gera o PDF imediatamente
        const res = await fetch('/api/contracts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: selectedTemplateForGen.id,
            clientName: targetName,
            clientPhone: targetPhone,
            data: { ...manualVariableValues, nome_cliente: targetName },
            workspace_id: workspaceId
          })
        });

        const data = await res.json();
        if (data.success) {
          setLastGeneratedPdfUrl(data.pdfUrl);
          setActionStatus('✅ Contrato confeccionado e PDF gerado com sucesso!');
          fetchContracts();
        } else {
          alert(data.error || 'Erro ao confeccionar contrato.');
        }
      }
    } catch (err) {
      console.error(err);
      alert('Erro na operação de confecção.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendViaWhatsapp = async (contractId) => {
    if (!window.confirm('Deseja enviar o arquivo PDF deste contrato para o WhatsApp do cliente agora?')) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/contracts/${contractId}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Contrato PDF enviado com sucesso pelo WhatsApp!');
        fetchContracts();
      } else {
        alert(data.error || 'Erro ao enviar no WhatsApp.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar contrato no WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contracts-container">
      {/* Header */}
      <header className="contracts-header">
        <div>
          <h1>Confecção de Contratos</h1>
          <p>
            Crie modelos contratuais com variáveis dinâmicas. Agentes de IA perguntam os dados ao lead no WhatsApp e geram o PDF oficial automaticamente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => handleOpenGenerate(templates[0])}
            disabled={templates.length === 0}
            style={{
              backgroundColor: '#10B981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Zap size={16} /> Confeccionar / Coleta IA
          </button>
          <button
            onClick={handleOpenNewTemplate}
            style={{
              backgroundColor: '#7C3AED',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)'
            }}
          >
            <Plus size={16} /> Novo Modelo
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="contracts-tabs">
        <button
          className={`contracts-tab ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <FileText size={16} /> Modelos de Contrato ({templates.length})
        </button>
        <button
          className={`contracts-tab ${activeTab === 'contracts' ? 'active' : ''}`}
          onClick={() => setActiveTab('contracts')}
        >
          <Check size={16} /> Contratos Confeccionados ({contracts.length})
        </button>
      </div>

      {/* TAB 1: MODELOS DE CONTRATO */}
      {activeTab === 'templates' && (
        <div>
          {templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1.5px dashed #cbd5e1' }}>
              <FileText size={48} color="#94A3B8" />
              <h3 style={{ margin: '14px 0 6px 0', color: '#1e293b' }}>Nenhum modelo de contrato criado</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '18px' }}>
                Crie seu primeiro modelo de contrato indicando as variáveis para a IA coletar com os leads.
              </p>
              <button
                onClick={handleOpenNewTemplate}
                style={{
                  backgroundColor: '#7C3AED',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Criar Primeiro Modelo
              </button>
            </div>
          ) : (
            <div className="templates-grid">
              {templates.map(tpl => (
                <div key={tpl.id} className="template-card">
                  <div>
                    <div className="template-card-header">
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED', backgroundColor: '#F3E8FF', padding: '3px 8px', borderRadius: '6px' }}>
                        ID #{tpl.id}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleEditTemplate(tpl)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                          title="Editar Modelo"
                        >
                          <MagicEdit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(tpl.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                          title="Excluir Modelo"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </div>

                    <h3 className="template-card-title">{tpl.title}</h3>
                    <p className="template-card-desc">{tpl.description || 'Sem descrição cadastrada.'}</p>

                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                        Variáveis Coletadas pela IA ({tpl.variables?.length || 0}):
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {(tpl.variables || []).map((v, i) => (
                          <span key={i} className="variable-pill" title={v.prompt}>
                            {`{{${v.key}}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="template-card-actions">
                    <button
                      onClick={() => handleOpenGenerate(tpl)}
                      style={{
                        flex: 1,
                        backgroundColor: '#10B981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
                      }}
                    >
                      <Zap size={14} /> Confeccionar
                    </button>
                    <button
                      onClick={() => handleEditTemplate(tpl)}
                      style={{
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Editar Texto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONTRATOS CONFECCIONADOS */}
      {activeTab === 'contracts' && (
        <div>
          {contracts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1.5px dashed #cbd5e1' }}>
              <FileText size={48} color="#94A3B8" />
              <h3 style={{ margin: '14px 0 6px 0', color: '#1e293b' }}>Nenhum contrato confeccionado ainda</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '18px' }}>
                Clique em "Confeccionar / Coleta IA" para iniciar a coleta de dados de um cliente ou gerar um contrato.
              </p>
              <button
                onClick={() => handleOpenGenerate(templates[0])}
                style={{
                  backgroundColor: '#10B981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Confeccionar Primeiro Contrato
              </button>
            </div>
          ) : (
            <div className="contracts-table-container">
              <table className="contracts-table">
                <thead>
                  <tr>
                    <th>Cliente / Lead</th>
                    <th>WhatsApp</th>
                    <th>Modelo de Contrato</th>
                    <th>Status</th>
                    <th>Dados Coletados</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700, color: '#0f172a' }}>{c.client_name}</td>
                      <td>{c.client_phone || '—'}</td>
                      <td>{c.template_title || 'Contrato'}</td>
                      <td>
                        <span className={`status-badge ${c.status}`}>
                          {c.status === 'collecting' && '● Coletando com IA'}
                          {c.status === 'completed' && '● Pronto'}
                          {c.status === 'sent' && '● Enviado no WhatsApp'}
                          {c.status === 'draft' && '● Rascunho'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {Object.keys(c.data || {}).map((k, i) => (
                            <span key={i} style={{ fontSize: '0.72rem', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', color: '#475569' }}>
                              {k}: {String(c.data[k]).slice(0, 15)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                        {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {c.pdf_url && (
                            <a
                              href={c.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                backgroundColor: '#EFF6FF',
                                color: '#1D4ED8',
                                border: '1px solid #BFDBFE',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Download size={14} /> Baixar PDF
                            </a>
                          )}
                          {c.pdf_filename && (
                            <button
                              onClick={() => handleSendViaWhatsapp(c.id)}
                              disabled={loading}
                              style={{
                                backgroundColor: '#ECFDF5',
                                color: '#059669',
                                border: '1px solid #A7F3D0',
                                borderRadius: '6px',
                                padding: '5px 10px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Reenviar arquivo PDF no WhatsApp do cliente"
                            >
                              <Zap size={14} /> Reenviar WhatsApp
                            </button>
                          )}
                          <button
                            onClick={() => setViewingContract(c)}
                            style={{
                              backgroundColor: '#f8fafc',
                              color: '#475569',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              padding: '5px 8px',
                              fontSize: '0.78rem',
                              cursor: 'pointer'
                            }}
                            title="Ver detalhes"
                          >
                            👁️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE MODELO DE CONTRATO */}
      {isTemplateModalOpen && (
        <div className="contract-modal-overlay">
          <div className="contract-modal">
            <div className="contract-modal-header">
              <h2>
                <FileText size={22} color="#7C3AED" />
                {editingTemplate ? 'Editar Modelo de Contrato' : 'Novo Modelo de Contrato'}
              </h2>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <Close size={24} />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="contract-modal-content">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Título do Modelo de Contrato *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Contrato de Prestação de Serviços Digitais"
                      value={templateForm.title}
                      onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      Agente de IA Responsável pela Coleta
                    </label>
                    <select
                      value={templateForm.agent_id}
                      onChange={(e) => setTemplateForm({ ...templateForm, agent_id: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', backgroundColor: '#ffffff' }}
                    >
                      {agents.map(a => (
                        <option key={a.id} value={String(a.id)}>
                          🤖 {a.name} ({a.role || 'Assistente'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Descrição Breve
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Utilizado para fechamento de projetos e clientes da mentoria."
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Seção do Texto do Contrato */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                      Texto do Contrato com Variáveis (Tags):
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleDetectVariables}
                        style={{
                          backgroundColor: '#F3E8FF',
                          color: '#6B21A8',
                          border: '1px solid #D8B4FE',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        🔍 Detectar Variáveis do Texto
                      </button>
                    </div>
                  </div>

                  {/* Atalhos de Variáveis */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Clique para inserir:</span>
                    {(templateForm.variables || []).map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleInsertTag(v.key)}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          cursor: 'pointer'
                        }}
                      >
                        +{`{{${v.key}}}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleInsertTag('data_atual')}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        color: '#7c3aed'
                      }}
                    >
                      +{`{{data_atual}}`}
                    </button>
                  </div>

                  <textarea
                    rows={12}
                    value={templateForm.content}
                    onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                    placeholder="Digite ou cole aqui o texto do contrato com as variáveis entre {{chaves}}..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                      lineHeight: '1.5'
                    }}
                  />
                </div>

                {/* Seção de Configuração das Variáveis */}
                <div className="variables-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b' }}>
                        Variáveis & Perguntas que a IA fará ao Lead ({templateForm.variables?.length || 0})
                      </h4>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        A IA fará cada uma dessas perguntas no WhatsApp para preencher o contrato.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddVariable}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={14} /> Novo Campo
                    </button>
                  </div>

                  {(!templateForm.variables || templateForm.variables.length === 0) ? (
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                      Nenhuma variável configurada. Clique em "Detectar Variáveis do Texto" ou "Novo Campo".
                    </p>
                  ) : (
                    <div>
                      {templateForm.variables.map((v, idx) => (
                        <div key={idx} className="variable-row">
                          <div style={{ width: '130px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Chave (Slug):</span>
                            <input
                              type="text"
                              value={v.key}
                              onChange={(e) => handleUpdateVariable(idx, 'key', e.target.value)}
                              style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}
                            />
                          </div>

                          <div style={{ width: '160px' }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Rótulo Amigável:</span>
                            <input
                              type="text"
                              value={v.label}
                              onChange={(e) => handleUpdateVariable(idx, 'label', e.target.value)}
                              placeholder="Ex: Nome Completo"
                              style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            />
                          </div>

                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block' }}>Pergunta que a IA faz no WhatsApp:</span>
                            <input
                              type="text"
                              value={v.prompt}
                              onChange={(e) => handleUpdateVariable(idx, 'prompt', e.target.value)}
                              placeholder="Ex: Qual o seu número de CPF?"
                              style={{ width: '100%', padding: '4px 6px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveVariable(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                            title="Remover Variável"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="contract-modal-footer">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: '#7C3AED',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {loading ? 'Salvando...' : 'Salvar Modelo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFECCIONAR / INICIAR COLETA COM IA */}
      {isGenerateModalOpen && selectedTemplateForGen && (
        <div className="contract-modal-overlay">
          <div className="contract-modal" style={{ maxWidth: '650px' }}>
            <div className="contract-modal-header">
              <h2>
                <Zap size={22} color="#10B981" />
                Confeccionar Contrato: {selectedTemplateForGen.title}
              </h2>
              <button
                onClick={() => setIsGenerateModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <Close size={24} />
              </button>
            </div>

            <div className="contract-modal-content">
              {/* Escolha do Modo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div
                  onClick={() => setGenMode('ai_collect')}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: genMode === 'ai_collect' ? '2px solid #10B981' : '1px solid #e2e8f0',
                    backgroundColor: genMode === 'ai_collect' ? '#ECFDF5' : '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#065F46', marginBottom: '4px' }}>
                    <Robot size={18} /> Coleta com Agente de IA
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#047857' }}>
                    A IA pergunta cada dado no WhatsApp do lead e envia o PDF pronto ao final.
                  </span>
                </div>

                <div
                  onClick={() => setGenMode('manual')}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    border: genMode === 'manual' ? '2px solid #7C3AED' : '1px solid #e2e8f0',
                    backgroundColor: genMode === 'manual' ? '#F3E8FF' : '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#6B21A8', marginBottom: '4px' }}>
                    <FileText size={18} /> Preenchimento Manual
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#7E22CE' }}>
                    Preencha os campos agora para gerar e baixar o PDF imediatamente.
                  </span>
                </div>
              </div>

              {/* Escolha do Lead / Cliente */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Selecionar Lead / Cliente:
                </label>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setLeadMode('select')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: leadMode === 'select' ? '1.5px solid #10B981' : '1px solid #cbd5e1',
                      backgroundColor: leadMode === 'select' ? '#ECFDF5' : '#ffffff',
                      color: leadMode === 'select' ? '#065F46' : '#475569'
                    }}
                  >
                    Contatos do Sistema ({contacts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeadMode('manual')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: leadMode === 'manual' ? '1.5px solid #10B981' : '1px solid #cbd5e1',
                      backgroundColor: leadMode === 'manual' ? '#ECFDF5' : '#ffffff',
                      color: leadMode === 'manual' ? '#065F46' : '#475569'
                    }}
                  >
                    Digitar Nome e WhatsApp Manualmente
                  </button>
                </div>

                {leadMode === 'select' ? (
                  <select
                    value={selectedContactId}
                    onChange={(e) => setSelectedContactId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', backgroundColor: '#ffffff' }}
                  >
                    {contacts.map(c => (
                      <option key={c.id} value={String(c.id)}>
                        👤 {c.name} {c.phone ? `(${c.phone})` : '(sem telefone)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <input
                        type="text"
                        placeholder="Nome completo do cliente"
                        value={manualClientName}
                        onChange={(e) => setManualClientName(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                      />
                    </div>
                    <div>
                      <PhoneInput
                        value={manualClientPhone}
                        onChange={(e164) => setManualClientPhone(e164)}
                        placeholder="WhatsApp / Telefone"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Se Modo Manual: Exibe campos de cada variável */}
              {genMode === 'manual' && (
                <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#1e293b' }}>Preencher Variáveis do Contrato:</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {(selectedTemplateForGen.variables || []).map((v, i) => (
                      <div key={i}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                          {v.label} ({`{{${v.key}}}`}):
                        </label>
                        <input
                          type="text"
                          value={manualVariableValues[v.key] || ''}
                          onChange={(e) => setManualVariableValues({ ...manualVariableValues, [v.key]: e.target.value })}
                          placeholder={`Ex: valor para ${v.label}`}
                          style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status / Feedback */}
              {actionStatus && (
                <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', fontSize: '0.88rem', fontWeight: 600, marginBottom: '14px' }}>
                  {actionStatus}
                </div>
              )}

              {lastGeneratedPdfUrl && (
                <div style={{ textAlign: 'center', marginTop: '10px' }}>
                  <a
                    href={lastGeneratedPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#10B981',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download size={18} /> Baixar Arquivo PDF Confeccionado
                  </a>
                </div>
              )}
            </div>

            <div className="contract-modal-footer">
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={handleExecuteGenerate}
                disabled={loading}
                style={{
                  backgroundColor: genMode === 'ai_collect' ? '#10B981' : '#7C3AED',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {loading ? 'Aguarde...' : (genMode === 'ai_collect' ? '🤖 Iniciar Coleta no WhatsApp' : '📄 Confeccionar PDF')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DO CONTRATO */}
      {viewingContract && (
        <div className="contract-modal-overlay">
          <div className="contract-modal" style={{ maxWidth: '600px' }}>
            <div className="contract-modal-header">
              <h2>
                <FileText size={22} color="#7C3AED" />
                Contrato #{viewingContract.id} - {viewingContract.client_name}
              </h2>
              <button onClick={() => setViewingContract(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <Close size={24} />
              </button>
            </div>
            <div className="contract-modal-content">
              <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#475569' }}>
                <strong>Modelo:</strong> {viewingContract.template_title || 'Contrato'}
              </p>
              <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#475569' }}>
                <strong>WhatsApp:</strong> {viewingContract.client_phone || '—'}
              </p>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#475569' }}>
                <strong>Status:</strong> {viewingContract.status}
              </p>

              <h4 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>Dados Preenchidos:</h4>
              <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                {Object.entries(viewingContract.data || {}).map(([k, v], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{k}:</span>
                    <span style={{ color: '#0f172a' }}>{String(v)}</span>
                  </div>
                ))}
              </div>

              {viewingContract.pdf_url && (
                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  <a
                    href={viewingContract.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: '#1D4ED8',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download size={16} /> Baixar PDF
                  </a>
                  <button
                    onClick={() => handleSendViaWhatsapp(viewingContract.id)}
                    style={{
                      backgroundColor: '#10B981',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Zap size={16} /> Enviar via WhatsApp
                  </button>
                </div>
              )}
            </div>
            <div className="contract-modal-footer">
              <button
                type="button"
                onClick={() => setViewingContract(null)}
                style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
