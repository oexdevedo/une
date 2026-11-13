// File: src/pages/Forms/Forms.jsx
import React, { useState, useEffect } from 'react';
import './Forms.css';
import {
  ClipboardNote,
  Plus,
  Search,
  Check,
  Close,
  Copy,
  ExternalLink,
  Pencil,
  Trash,
  Download,
  Eye,
  Users,
  Sliders,
  Message,
  Link,
  ChevronDown,
  ChevronUp,
  Refresh
} from 'pixelarticons/react';
import { getWorkspaceId } from '../../utils/workspace';

export default function Forms() {
  const workspaceId = getWorkspaceId();

  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [contactLists, setContactLists] = useState([]);
  const [copiedSlug, setCopiedSlug] = useState(null);

  // Modal do Construtor de Formulário
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingFormId, setEditingFormId] = useState(null);
  const [builderTab, setBuilderTab] = useState('fields'); // 'general' | 'fields' | 'appearance'
  const [isSaving, setIsSaving] = useState(false);

  const initialFormState = {
    title: '',
    slug: '',
    description: '',
    button_text: 'Enviar Dados',
    success_message: 'Obrigado! Seus dados foram recebidos com sucesso. Em breve nossa equipe entrará em contato.',
    redirect_url: '',
    target_list_id: '',
    is_active: true,
    primary_color: '#6366f1',
    background_color: '#f8fafc',
    fields: [
      { id: 'f_nome', name: 'nome', label: 'Nome Completo', type: 'text', placeholder: 'Digite seu nome completo', required: true },
      { id: 'f_whatsapp', name: 'whatsapp', label: 'WhatsApp / Telefone', type: 'phone', placeholder: '(11) 99999-9999', required: true },
      { id: 'f_email', name: 'email', label: 'E-mail Comercial', type: 'email', placeholder: 'seu@email.com', required: false },
      { id: 'f_mensagem', name: 'mensagem', label: 'Mensagem ou Observação', type: 'textarea', placeholder: 'Conte um pouco sobre sua necessidade...', required: false }
    ]
  };

  const [formData, setFormData] = useState(initialFormState);

  // Modal de Submissões / Leads Capturados
  const [isSubmissionsOpen, setIsSubmissionsOpen] = useState(false);
  const [selectedFormForSubmissions, setSelectedFormForSubmissions] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionSearch, setSubmissionSearch] = useState('');

  // Carrega listas de contatos para o dropdown de destino
  const fetchContactLists = async () => {
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/lists?workspace_id=${workspaceId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setContactLists(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Erro ao carregar listas de contatos:', err);
    }
  };

  // Carrega formulários
  const fetchForms = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/forms?workspace_id=${workspaceId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForms(data.forms || []);
      }
    } catch (err) {
      console.error('Erro ao buscar formulários:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
    fetchContactLists();
  }, [workspaceId]);

  // Copia link público
  const handleCopyLink = (slug) => {
    const fullUrl = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2500);
    });
  };

  // Ativar / Desativar formulário rapidamente
  const handleToggleActive = async (form) => {
    try {
      const token = localStorage.getItem('unne_token');
      const newStatus = !form.is_active;
      const res = await fetch(`/api/forms/${form.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ is_active: newStatus })
      });
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === form.id ? { ...f, is_active: newStatus } : f));
      }
    } catch (err) {
      console.error('Erro ao alterar status:', err);
    }
  };

  // Abrir Construtor (Criar ou Editar)
  const handleOpenBuilder = (form = null) => {
    if (form) {
      setEditingFormId(form.id);
      setFormData({
        title: form.title || '',
        slug: form.slug || '',
        description: form.description || '',
        button_text: form.button_text || 'Enviar Dados',
        success_message: form.success_message || '',
        redirect_url: form.redirect_url || '',
        target_list_id: form.target_list_id ? String(form.target_list_id) : '',
        is_active: form.is_active !== undefined ? form.is_active : true,
        primary_color: form.primary_color || '#6366f1',
        background_color: form.background_color || '#f8fafc',
        fields: Array.isArray(form.fields) && form.fields.length > 0 ? form.fields : initialFormState.fields
      });
    } else {
      setEditingFormId(null);
      setFormData(initialFormState);
    }
    setBuilderTab('fields');
    setIsBuilderOpen(true);
  };

  // Salvar Formulário (POST ou PUT)
  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Por favor, informe o título do formulário.');
      return;
    }
    if (formData.fields.length === 0) {
      alert('Adicione ao menos um campo ao formulário.');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('unne_token');
      const url = editingFormId ? `/api/forms/${editingFormId}` : '/api/forms';
      const method = editingFormId ? 'PUT' : 'POST';

      const payload = {
        workspace_id: workspaceId,
        title: formData.title.trim(),
        slug: formData.slug.trim(),
        description: formData.description.trim(),
        button_text: formData.button_text.trim(),
        success_message: formData.success_message.trim(),
        redirect_url: formData.redirect_url.trim(),
        target_list_id: formData.target_list_id ? Number(formData.target_list_id) : null,
        is_active: formData.is_active,
        primary_color: formData.primary_color,
        background_color: formData.background_color,
        fields: formData.fields
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsBuilderOpen(false);
        fetchForms();
      } else {
        alert(data.error || 'Erro ao salvar formulário.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar formulário.');
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir formulário
  const handleDeleteForm = async (form) => {
    if (!window.confirm(`Deseja realmente excluir o formulário "${form.title}" e todas as suas respostas capturadas?`)) return;

    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/forms/${form.id}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForms(prev => prev.filter(f => f.id !== form.id));
      } else {
        alert(data.error || 'Erro ao excluir formulário.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir formulário.');
    }
  };

  // Abrir Modal de Submissões / Leads Capturados
  const handleOpenSubmissions = async (form) => {
    setSelectedFormForSubmissions(form);
    setIsSubmissionsOpen(true);
    setSubmissionsLoading(true);
    setSubmissionSearch('');

    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/forms/${form.id}/submissions`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmissionsList(data.submissions || []);
      }
    } catch (err) {
      console.error('Erro ao carregar respostas:', err);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  // Excluir resposta individual de lead
  const handleDeleteSubmission = async (subId) => {
    if (!window.confirm('Excluir este lead capturado permanentemente?')) return;
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/forms/submissions/${subId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setSubmissionsList(prev => prev.filter(s => s.id !== subId));
        fetchForms();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Exportar Leads para CSV
  const handleExportCSV = () => {
    if (!submissionsList || submissionsList.length === 0) {
      alert('Não há respostas para exportar.');
      return;
    }

    // Coleta todas as chaves de campos presentes nas respostas
    const allFieldKeys = new Set(['Data', 'Hora', 'Contato_Cadastrado', 'Telefone']);
    submissionsList.forEach(s => {
      if (s.data && typeof s.data === 'object') {
        Object.keys(s.data).forEach(k => allFieldKeys.add(k));
      }
    });

    const headers = Array.from(allFieldKeys);
    const rows = submissionsList.map(s => {
      const dateObj = new Date(s.created_at);
      const dataStr = dateObj.toLocaleDateString('pt-BR');
      const horaStr = dateObj.toLocaleTimeString('pt-BR');

      return headers.map(h => {
        if (h === 'Data') return `"${dataStr}"`;
        if (h === 'Hora') return `"${horaStr}"`;
        if (h === 'Contato_Cadastrado') return `"${s.contact_name || '-'}"`;
        if (h === 'Telefone') return `"${s.contact_phone || s.data?.whatsapp || s.data?.phone || '-'}"`;

        const val = s.data?.[h] !== undefined ? String(s.data[h]).replace(/"/g, '""') : '';
        return `"${val}"`;
      }).join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `leads_${selectedFormForSubmissions?.slug || 'form'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Operações no Field Builder
  const handleAddField = (type = 'text') => {
    const id = `f_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    let newField = {
      id,
      name: `campo_${formData.fields.length + 1}`,
      label: 'Novo Campo',
      type,
      placeholder: '',
      required: false
    };

    if (type === 'phone') {
      newField.label = 'WhatsApp / Telefone';
      newField.name = 'whatsapp';
      newField.placeholder = '(11) 99999-9999';
      newField.required = true;
    } else if (type === 'email') {
      newField.label = 'E-mail';
      newField.name = 'email';
      newField.placeholder = 'email@exemplo.com';
    } else if (type === 'textarea') {
      newField.label = 'Mensagem';
      newField.name = 'mensagem';
      newField.placeholder = 'Digite sua mensagem...';
    } else if (type === 'select') {
      newField.label = 'Opção / Interesse';
      newField.name = 'opcao';
      newField.options = ['Opção 1', 'Opção 2', 'Opção 3'];
    }

    setFormData(prev => ({ ...prev, fields: [...prev.fields, newField] }));
  };

  const handleUpdateField = (index, key, val) => {
    setFormData(prev => {
      const updated = [...prev.fields];
      updated[index] = { ...updated[index], [key]: val };
      return { ...prev, fields: updated };
    });
  };

  const handleRemoveField = (index) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  const handleMoveField = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= formData.fields.length) return;
    setFormData(prev => {
      const updated = [...prev.fields];
      const temp = updated[index];
      updated[index] = updated[targetIdx];
      updated[targetIdx] = temp;
      return { ...prev, fields: updated };
    });
  };

  const handleAddOption = (fieldIndex) => {
    setFormData(prev => {
      const updated = [...prev.fields];
      const currentOptions = updated[fieldIndex].options || [];
      updated[fieldIndex] = {
        ...updated[fieldIndex],
        options: [...currentOptions, `Opção ${currentOptions.length + 1}`]
      };
      return { ...prev, fields: updated };
    });
  };

  const handleUpdateOption = (fieldIndex, optIndex, val) => {
    setFormData(prev => {
      const updated = [...prev.fields];
      const currentOptions = [...(updated[fieldIndex].options || [])];
      currentOptions[optIndex] = val;
      updated[fieldIndex] = { ...updated[fieldIndex], options: currentOptions };
      return { ...prev, fields: updated };
    });
  };

  const handleRemoveOption = (fieldIndex, optIndex) => {
    setFormData(prev => {
      const updated = [...prev.fields];
      const currentOptions = (updated[fieldIndex].options || []).filter((_, i) => i !== optIndex);
      updated[fieldIndex] = { ...updated[fieldIndex], options: currentOptions };
      return { ...prev, fields: updated };
    });
  };

  // KPIs
  const totalForms = forms.length;
  const totalSubmissions = forms.reduce((sum, f) => sum + (f.submissions_count || 0), 0);
  const totalViews = forms.reduce((sum, f) => sum + (f.views_count || 0), 0);
  const overallConversion = totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : 0;

  // Filtragem de Formulários
  const filteredForms = forms.filter(f => {
    const matchesSearch = searchQuery === '' || 
      f.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && f.is_active) ||
      (statusFilter === 'inactive' && !f.is_active);

    return matchesSearch && matchesStatus;
  });

  // Filtragem de Submissões dentro do modal
  const filteredSubmissions = submissionsList.filter(s => {
    if (!submissionSearch.trim()) return true;
    const q = submissionSearch.toLowerCase();
    const contactMatch = s.contact_name?.toLowerCase().includes(q) || s.contact_phone?.includes(q);
    const dataMatch = JSON.stringify(s.data || {}).toLowerCase().includes(q);
    return contactMatch || dataMatch;
  });

  return (
    <div className="forms-container">
      {/* HEADER */}
      <div className="forms-header">
        <div className="forms-title-area">
          <h1>
            <ClipboardNote size={30} color="#6366f1" /> Formulários de Captura de Leads
          </h1>
          <p>
            Crie páginas públicas elegantes para captar leads, integrar ao WhatsApp e preencher suas listas automaticamente.
          </p>
        </div>

        <div className="forms-header-actions">
          <button 
            className="btn-primary" 
            onClick={() => handleOpenBuilder()}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Novo Formulário
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="forms-kpis-grid">
        <div className="forms-kpi-card">
          <div className="forms-kpi-icon" style={{ backgroundColor: '#e0e7ff', color: '#4338ca' }}>
            <ClipboardNote size={22} />
          </div>
          <div className="forms-kpi-info">
            <span className="forms-kpi-label">Formulários Criados</span>
            <span className="forms-kpi-value">{totalForms}</span>
            <span className="forms-kpi-subtext">{forms.filter(f => f.is_active).length} ativos no ar</span>
          </div>
        </div>

        <div className="forms-kpi-card">
          <div className="forms-kpi-icon" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
            <Users size={22} />
          </div>
          <div className="forms-kpi-info">
            <span className="forms-kpi-label">Leads Capturados</span>
            <span className="forms-kpi-value">{totalSubmissions}</span>
            <span className="forms-kpi-subtext">Integrados aos contatos</span>
          </div>
        </div>

        <div className="forms-kpi-card">
          <div className="forms-kpi-icon" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
            <Eye size={22} />
          </div>
          <div className="forms-kpi-info">
            <span className="forms-kpi-label">Visualizações Totais</span>
            <span className="forms-kpi-value">{totalViews}</span>
            <span className="forms-kpi-subtext">Acessos às páginas públicas</span>
          </div>
        </div>

        <div className="forms-kpi-card">
          <div className="forms-kpi-icon" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>
            <Sliders size={22} />
          </div>
          <div className="forms-kpi-info">
            <span className="forms-kpi-label">Taxa de Conversão</span>
            <span className="forms-kpi-value">{overallConversion}%</span>
            <span className="forms-kpi-subtext">Média geral de conversão</span>
          </div>
        </div>
      </div>

      {/* TOOLBAR: BUSCA E FILTROS */}
      <div className="forms-toolbar">
        <div className="forms-search-box">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Buscar por título, link /f/slug ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="forms-status-filters">
          <button 
            className={`forms-status-pill ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            Todos ({forms.length})
          </button>
          <button 
            className={`forms-status-pill ${statusFilter === 'active' ? 'active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            🟢 Ativos ({forms.filter(f => f.is_active).length})
          </button>
          <button 
            className={`forms-status-pill ${statusFilter === 'inactive' ? 'active' : ''}`}
            onClick={() => setStatusFilter('inactive')}
          >
            ⚪ Pausados ({forms.filter(f => !f.is_active).length})
          </button>
        </div>
      </div>

      {/* LISTA / GRID DE FORMULÁRIOS */}
      {loading ? (
        <div className="forms-loading-state">
          <ClipboardNote size={36} className="spin" style={{ color: '#6366f1', marginBottom: '12px' }} />
          <p>Carregando formulários do workspace...</p>
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="forms-empty-state">
          <div className="forms-empty-icon">
            <ClipboardNote size={44} color="#6366f1" />
          </div>
          <h3>Nenhum formulário encontrado</h3>
          <p>
            {searchQuery || statusFilter !== 'all'
              ? 'Tente ajustar os filtros ou o termo de busca.'
              : 'Crie seu primeiro formulário público para divulgar nas redes sociais, anúncios ou campanhas e receber novos leads instantaneamente.'}
          </p>
          <button 
            className="btn-primary" 
            onClick={() => handleOpenBuilder()}
            style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Criar Primeiro Formulário
          </button>
        </div>
      ) : (
        <div className="forms-grid">
          {filteredForms.map((form) => {
            const isCopied = copiedSlug === form.slug;
            const convRate = (form.views_count || 0) > 0 
              ? (((form.submissions_count || 0) / form.views_count) * 100).toFixed(1) 
              : 0;

            return (
              <div key={form.id} className={`form-card ${form.is_active ? 'active' : 'inactive'}`}>
                {/* Header do Card */}
                <div className="form-card-top">
                  <div className="form-card-status-wrapper">
                    <button 
                      className={`form-status-toggle ${form.is_active ? 'is-active' : ''}`}
                      onClick={() => handleToggleActive(form)}
                      title={form.is_active ? 'Clique para pausar formulário' : 'Clique para ativar formulário'}
                    >
                      <span className="form-status-dot" />
                      {form.is_active ? 'Ativo (Público)' : 'Pausado'}
                    </button>
                  </div>

                  <div className="form-card-top-actions">
                    <button 
                      className="form-icon-btn"
                      title="Editar Formulário"
                      onClick={() => handleOpenBuilder(form)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button 
                      className="form-icon-btn delete"
                      title="Excluir Formulário"
                      onClick={() => handleDeleteForm(form)}
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>

                {/* Título e Descrição */}
                <h3 className="form-card-title">{form.title}</h3>
                {form.description && (
                  <p className="form-card-desc">{form.description}</p>
                )}

                {/* Link Público com Botão Copiar */}
                <div className="form-card-link-bar">
                  <span className="form-card-link-text" title={`${window.location.origin}/f/${form.slug}`}>
                    🔗 /f/<strong>{form.slug}</strong>
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      className={`form-link-copy-btn ${isCopied ? 'copied' : ''}`}
                      onClick={() => handleCopyLink(form.slug)}
                      title={isCopied ? 'Link Copiado!' : 'Copiar Link Público'}
                    >
                      {isCopied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                      {isCopied ? 'Copiado!' : 'Copiar'}
                    </button>
                    <a 
                      href={`/f/${form.slug}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="form-link-open-btn"
                      title="Abrir página pública em nova aba"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>

                {/* Métricas e Estatísticas */}
                <div className="form-card-stats-row">
                  <div className="form-card-stat">
                    <span className="stat-label">Leads</span>
                    <span className="stat-value">{form.submissions_count || 0}</span>
                  </div>
                  <div className="form-card-stat">
                    <span className="stat-label">Views</span>
                    <span className="stat-value">{form.views_count || 0}</span>
                  </div>
                  <div className="form-card-stat">
                    <span className="stat-label">Conversão</span>
                    <span className="stat-value">{convRate}%</span>
                  </div>
                </div>

                {/* Lista de Destino / Info */}
                <div className="form-card-footer">
                  <span className="form-card-target-list">
                    📁 Lista: <strong>{form.target_list_name || 'Geral (Todos)'}</strong>
                  </span>

                  <button 
                    className="form-btn-view-leads"
                    onClick={() => handleOpenSubmissions(form)}
                  >
                    <Users size={14} /> Ver Leads ({form.submissions_count || 0})
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: CONSTRUTOR DE FORMULÁRIO (CRIAR / EDITAR)        */}
      {/* ========================================================= */}
      {isBuilderOpen && (
        <div className="forms-modal-overlay" onClick={() => !isSaving && setIsBuilderOpen(false)}>
          <div className="forms-builder-modal" onClick={(e) => e.stopPropagation()}>
            <div className="forms-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="forms-modal-icon">
                  <ClipboardNote size={22} color="#6366f1" />
                </div>
                <div>
                  <h3>{editingFormId ? 'Editar Formulário de Captura' : 'Criar Novo Formulário de Captura'}</h3>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Configure os campos, lista de destino e personalize o link público.
                  </span>
                </div>
              </div>
              <button 
                className="forms-modal-close" 
                onClick={() => !isSaving && setIsBuilderOpen(false)}
                disabled={isSaving}
              >
                <Close size={18} />
              </button>
            </div>

            {/* Abas do Construtor */}
            <div className="forms-builder-tabs">
              <button 
                type="button"
                className={`forms-builder-tab ${builderTab === 'fields' ? 'active' : ''}`}
                onClick={() => setBuilderTab('fields')}
              >
                1. Campos do Formulário ({formData.fields.length})
              </button>
              <button 
                type="button"
                className={`forms-builder-tab ${builderTab === 'general' ? 'active' : ''}`}
                onClick={() => setBuilderTab('general')}
              >
                2. Informações & Destino
              </button>
              <button 
                type="button"
                className={`forms-builder-tab ${builderTab === 'appearance' ? 'active' : ''}`}
                onClick={() => setBuilderTab('appearance')}
              >
                3. Design & Sucesso
              </button>
            </div>

            <form onSubmit={handleSaveForm}>
              <div className="forms-modal-body">
                {/* ABA 1: CAMPOS DO FORMULÁRIO */}
                {builderTab === 'fields' && (
                  <div className="builder-fields-tab">
                    <div className="builder-fields-header">
                      <div>
                        <h4>Campos da Página de Captura</h4>
                        <p>Arraste, ordene e configure as perguntas que o visitante deve responder.</p>
                      </div>

                      {/* Botões rápidos de adicionar campos */}
                      <div className="builder-add-buttons">
                        <button type="button" className="btn-add-field" onClick={() => handleAddField('text')}>
                          + Texto
                        </button>
                        <button type="button" className="btn-add-field" onClick={() => handleAddField('phone')}>
                          + WhatsApp
                        </button>
                        <button type="button" className="btn-add-field" onClick={() => handleAddField('email')}>
                          + E-mail
                        </button>
                        <button type="button" className="btn-add-field" onClick={() => handleAddField('select')}>
                          + Dropdown
                        </button>
                        <button type="button" className="btn-add-field" onClick={() => handleAddField('textarea')}>
                          + Mensagem
                        </button>
                      </div>
                    </div>

                    <div className="builder-fields-list">
                      {formData.fields.map((field, idx) => (
                        <div key={field.id || idx} className="builder-field-card">
                          <div className="builder-field-top">
                            <span className="builder-field-badge">{idx + 1}. {field.type.toUpperCase()}</span>
                            <div className="builder-field-controls">
                              <button 
                                type="button" 
                                className="field-control-btn" 
                                disabled={idx === 0}
                                onClick={() => handleMoveField(idx, -1)}
                                title="Mover para cima"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button 
                                type="button" 
                                className="field-control-btn" 
                                disabled={idx === formData.fields.length - 1}
                                onClick={() => handleMoveField(idx, 1)}
                                title="Mover para baixo"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button 
                                type="button" 
                                className="field-control-btn delete"
                                onClick={() => handleRemoveField(idx)}
                                title="Remover Campo"
                              >
                                <Trash size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="builder-field-inputs-row">
                            <div className="form-group" style={{ flex: 2 }}>
                              <label>Rótulo / Pergunta:</label>
                              <input 
                                type="text"
                                className="modern-input"
                                value={field.label}
                                onChange={(e) => handleUpdateField(idx, 'label', e.target.value)}
                                placeholder="Ex: Qual seu WhatsApp com DDD?"
                                required
                              />
                            </div>

                            <div className="form-group" style={{ flex: 1.2 }}>
                              <label>Tipo:</label>
                              <select 
                                className="modern-input"
                                value={field.type}
                                onChange={(e) => handleUpdateField(idx, 'type', e.target.value)}
                              >
                                <option value="text">Texto Curto</option>
                                <option value="phone">WhatsApp / Telefone</option>
                                <option value="email">E-mail</option>
                                <option value="number">Número</option>
                                <option value="textarea">Texto Longo (Mensagem)</option>
                                <option value="select">Seleção / Dropdown</option>
                              </select>
                            </div>

                            <div className="form-group" style={{ flex: 2 }}>
                              <label>Placeholder / Exemplo:</label>
                              <input 
                                type="text"
                                className="modern-input"
                                value={field.placeholder || ''}
                                onChange={(e) => handleUpdateField(idx, 'placeholder', e.target.value)}
                                placeholder="Ex: (11) 98765-4321"
                              />
                            </div>

                            <div className="form-group-checkbox" style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox"
                                  checked={Boolean(field.required)}
                                  onChange={(e) => handleUpdateField(idx, 'required', e.target.checked)}
                                />
                                Obrigatório
                              </label>
                            </div>
                          </div>

                          {/* Se for tipo dropdown/select, renderiza editor de opções */}
                          {field.type === 'select' && (
                            <div className="builder-options-box">
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
                                Opções para escolha:
                              </span>
                              <div className="builder-options-list">
                                {(field.options || []).map((opt, optIdx) => (
                                  <div key={optIdx} className="builder-option-row">
                                    <input 
                                      type="text"
                                      className="modern-input"
                                      value={opt}
                                      onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                                      placeholder={`Opção ${optIdx + 1}`}
                                    />
                                    <button 
                                      type="button" 
                                      className="field-control-btn delete"
                                      onClick={() => handleRemoveOption(idx, optIdx)}
                                    >
                                      <Close size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <button 
                                type="button" 
                                className="btn-secondary" 
                                onClick={() => handleAddOption(idx)}
                                style={{ marginTop: '6px', fontSize: '0.78rem', padding: '4px 10px' }}
                              >
                                + Adicionar Opção
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ABA 2: INFORMAÇÕES BÁSICAS & DESTINO */}
                {builderTab === 'general' && (
                  <div className="builder-general-tab">
                    <div className="form-group">
                      <label>Título do Formulário (Exibido no topo da página): *</label>
                      <input 
                        type="text"
                        className="modern-input"
                        value={formData.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            title: val,
                            // auto-gera slug caso esteja vazio ou novo
                            slug: !prev.slug || !editingFormId ? val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) : prev.slug
                          }));
                        }}
                        placeholder="Ex: Consultoria Gratuita de Vendas"
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label>Link / Slug Público da Página:</label>
                      <div className="slug-input-wrapper">
                        <span className="slug-prefix">{window.location.origin}/f/</span>
                        <input 
                          type="text"
                          className="modern-input slug-input"
                          value={formData.slug}
                          onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                          placeholder="consultoria-vendas"
                          required
                        />
                      </div>
                      <small style={{ color: '#64748b', fontSize: '0.78rem' }}>
                        Este será o link público e compartilhável do formulário.
                      </small>
                    </div>

                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label>Descrição / Subtítulo da Página de Captura:</label>
                      <textarea 
                        className="modern-input"
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Ex: Preencha seus dados para receber o contato de um de nossos especialistas em até 15 minutos."
                      />
                    </div>

                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label>Lista de Destino no CRM (WhatsApp):</label>
                      <select 
                        className="modern-input"
                        value={formData.target_list_id}
                        onChange={(e) => setFormData(prev => ({ ...prev, target_list_id: e.target.value }))}
                      >
                        <option value="">Nenhuma lista específica (Apenas salvar nos Contatos)</option>
                        {contactLists.map(l => (
                          <option key={l.id} value={l.id}>📁 {l.name} ({l.count || 0} contatos)</option>
                        ))}
                      </select>
                      <small style={{ color: '#64748b', fontSize: '0.78rem' }}>
                        Todo lead que preencher este formulário será automaticamente inserido nesta lista para disparos e automações.
                      </small>
                    </div>

                    <div className="form-group-checkbox" style={{ marginTop: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                        <input 
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                        />
                        Formulário Ativo (Público e aceitando respostas)
                      </label>
                    </div>
                  </div>
                )}

                {/* ABA 3: APARÊNCIA & PÓS-ENVIO */}
                {builderTab === 'appearance' && (
                  <div className="builder-appearance-tab">
                    <div className="form-group">
                      <label>Texto do Botão de Envio:</label>
                      <input 
                        type="text"
                        className="modern-input"
                        value={formData.button_text}
                        onChange={(e) => setFormData(prev => ({ ...prev, button_text: e.target.value }))}
                        placeholder="Ex: Quero Minha Consultoria Gratuita"
                      />
                    </div>

                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label>Cor Principal / Tema do Botão:</label>
                      <div className="color-palette-row">
                        {[
                          { color: '#6366f1', name: 'Índigo' },
                          { color: '#10b981', name: 'Verde Esmeralda' },
                          { color: '#8b5cf6', name: 'Violeta' },
                          { color: '#0284c7', name: 'Azul Céu' },
                          { color: '#f43f5e', name: 'Rosa' },
                          { color: '#f59e0b', name: 'Âmbar' },
                          { color: '#1e293b', name: 'Dark Slate' }
                        ].map(c => (
                          <button
                            key={c.color}
                            type="button"
                            className={`color-pill-btn ${formData.primary_color === c.color ? 'active' : ''}`}
                            style={{ backgroundColor: c.color }}
                            onClick={() => setFormData(prev => ({ ...prev, primary_color: c.color }))}
                            title={c.name}
                          >
                            {formData.primary_color === c.color && <Check size={14} color="#ffffff" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label>Mensagem de Confirmação (Pós-envio):</label>
                      <textarea 
                        className="modern-input"
                        rows={3}
                        value={formData.success_message}
                        onChange={(e) => setFormData(prev => ({ ...prev, success_message: e.target.value }))}
                        placeholder="Ex: Obrigado! Recebemos sua solicitação e entraremos em contato via WhatsApp."
                      />
                    </div>

                    <div className="form-group" style={{ marginTop: '14px' }}>
                      <label>Redirecionar para URL (Opcional):</label>
                      <input 
                        type="url"
                        className="modern-input"
                        value={formData.redirect_url}
                        onChange={(e) => setFormData(prev => ({ ...prev, redirect_url: e.target.value }))}
                        placeholder="https://wa.me/5511999999999 ou página de obrigado..."
                      />
                      <small style={{ color: '#64748b', fontSize: '0.78rem' }}>
                        Se preenchido, o lead será automaticamente redirecionado após o envio.
                      </small>
                    </div>
                  </div>
                )}
              </div>

              <div className="forms-modal-footer">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setIsBuilderOpen(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isSaving}
                >
                  {isSaving ? 'Salvando...' : (editingFormId ? 'Salvar Alterações' : 'Criar e Publicar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: RESPOSTAS / LEADS CAPTURADOS                     */}
      {/* ========================================================= */}
      {isSubmissionsOpen && selectedFormForSubmissions && (
        <div className="forms-modal-overlay" onClick={() => setIsSubmissionsOpen(false)}>
          <div className="forms-submissions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="forms-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="forms-modal-icon" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
                  <Users size={22} />
                </div>
                <div>
                  <h3>Leads Capturados: {selectedFormForSubmissions.title}</h3>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Total de {submissionsList.length} leads recebidos através do link /f/{selectedFormForSubmissions.slug}
                  </span>
                </div>
              </div>
              <button className="forms-modal-close" onClick={() => setIsSubmissionsOpen(false)}>
                <Close size={18} />
              </button>
            </div>

            <div className="forms-submissions-toolbar">
              <div className="forms-search-box" style={{ maxWidth: '340px' }}>
                <Search size={16} />
                <input 
                  type="text"
                  placeholder="Filtrar por nome, telefone ou dados..."
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn-secondary" 
                  onClick={handleExportCSV}
                  disabled={submissionsList.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={15} /> Exportar CSV
                </button>
                <a 
                  href={`/f/${selectedFormForSubmissions.slug}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                >
                  <ExternalLink size={15} /> Abrir Página Pública
                </a>
              </div>
            </div>

            <div className="forms-modal-body" style={{ padding: '0 24px 24px' }}>
              {submissionsLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                  <ClipboardNote size={32} className="spin" style={{ color: '#6366f1', marginBottom: '8px' }} />
                  <p>Carregando leads recebidos...</p>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="submissions-empty">
                  <Users size={40} color="#94a3b8" />
                  <h4>Nenhum lead recebido ainda</h4>
                  <p>
                    Compartilhe o link <code>{window.location.origin}/f/{selectedFormForSubmissions.slug}</code> com seus clientes ou em campanhas para começar a receber respostas.
                  </p>
                </div>
              ) : (
                <div className="submissions-table-wrapper">
                  <table className="submissions-table">
                    <thead>
                      <tr>
                        <th>Data & Hora</th>
                        <th>Contato (Nome)</th>
                        <th>WhatsApp / Telefone</th>
                        <th>Respostas & Campos</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmissions.map((sub) => {
                        const dateObj = new Date(sub.created_at);
                        const dateFormatted = dateObj.toLocaleDateString('pt-BR');
                        const timeFormatted = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                        const rawPhone = sub.contact_phone || sub.data?.whatsapp || sub.data?.phone || '';
                        const cleanDigits = String(rawPhone).replace(/\D/g, '');

                        return (
                          <tr key={sub.id}>
                            <td>
                              <span style={{ fontWeight: 600, color: '#1e293b' }}>{dateFormatted}</span>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>{timeFormatted}</span>
                            </td>

                            <td>
                              <span style={{ fontWeight: 700, color: '#334155' }}>
                                {sub.contact_name || sub.data?.nome || sub.data?.name || 'Lead sem nome'}
                              </span>
                            </td>

                            <td>
                              {cleanDigits ? (
                                <a 
                                  href={`https://wa.me/${cleanDigits}`} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="wa-link-pill"
                                  title="Iniciar conversa no WhatsApp"
                                >
                                  <Message size={13} /> {rawPhone}
                                </a>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>-</span>
                              )}
                            </td>

                            <td>
                              <div className="submissions-data-pills">
                                {sub.data && Object.entries(sub.data).map(([k, v]) => {
                                  if (['nome', 'name', 'whatsapp', 'phone'].includes(k.toLowerCase())) return null;
                                  return (
                                    <div key={k} className="sub-data-chip" title={`${k}: ${v}`}>
                                      <strong>{k}:</strong> {String(v)}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <button 
                                className="form-icon-btn delete"
                                title="Excluir Resposta"
                                onClick={() => handleDeleteSubmission(sub.id)}
                              >
                                <Trash size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="forms-modal-footer">
              <button type="button" className="btn-primary" onClick={() => setIsSubmissionsOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
