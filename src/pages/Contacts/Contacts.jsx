import React, { useState, useEffect, useRef } from 'react';
import './Contacts.css';
import {
  Upload,
  Plus,
  Users,
  Search,
  MoreHorizontal,
  Filter,
  Close,
  UserPlus,
  ArrowLeft,
  Label,
  Calendar,
  Refresh,
  Trash,
  Check
} from 'pixelarticons/react';
import { getWorkspaceId } from '../../utils/workspace';

export default function Contacts() {
  const workspaceId = getWorkspaceId();
  const [lists, setLists] = useState([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  const [activeList, setActiveList] = useState(null);
  const [leads, setLeads] = useState([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncingAgenda, setIsSyncingAgenda] = useState(false);

  const [isAddManualOpen, setIsAddManualOpen] = useState(false);
  const [manualContact, setManualContact] = useState({ name: '', phone: '' });
  
  const [activeDropdownList, setActiveDropdownList] = useState(null);
  const [activeDropdownLead, setActiveDropdownLead] = useState(null);

  // Label Management
  const [availableTags, setAvailableTags] = useState([
    { id: 1, name: 'Quente', color: '#EF4444', bg: '#FEE2E2' },
    { id: 2, name: 'Frio', color: '#3B82F6', bg: '#DBEAFE' },
    { id: 3, name: 'VIP', color: '#F59E0B', bg: '#FEF3C7' },
    { id: 4, name: 'B2B', color: '#8B5CF6', bg: '#EDE9FE' }
  ]);
  const [tagModalLead, setTagModalLead] = useState(null);
  const [newTagName, setNewTagName] = useState('');
  const [isGlobalTagModalOpen, setIsGlobalTagModalOpen] = useState(false);
  const [newGlobalTagName, setNewGlobalTagName] = useState('');

  const fileInputRef = useRef(null);
  const listFileInputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveDropdownList(null);
      setActiveDropdownLead(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 1. Carrega todas as listas do workspace
  const fetchLists = async () => {
    setIsLoadingLists(true);
    try {
      const res = await fetch(`/api/lists?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLists(data);
      }
    } catch (err) {
      console.error('Erro ao buscar listas:', err);
    } finally {
      setIsLoadingLists(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [workspaceId]);

  // 2. Carrega EXCLUSIVAMENTE os contatos da lista selecionada
  const fetchContactsForList = async (listId) => {
    setIsLoadingLeads(true);
    try {
      const res = await fetch(`/api/contacts?workspace_id=${workspaceId}&list_id=${listId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLeads(data.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          status: c.status || 'Novo',
          tags: [1]
        })));
      } else {
        setLeads([]);
      }
    } catch (err) {
      console.error('Erro ao carregar contatos da lista:', err);
      setLeads([]);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  useEffect(() => {
    if (activeList) {
      fetchContactsForList(activeList.id);
    } else {
      setLeads([]);
      setSearchQuery('');
    }
  }, [activeList?.id]);

  // Sincronização manual com a Agenda / Cal.com
  const handleSyncAgenda = async () => {
    setIsSyncingAgenda(true);
    try {
      const res = await fetch('/api/lists/sync-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId })
      });
      const data = await res.json();
      if (data.success) {
        if (activeList?.name === 'Agendados') {
          await fetchContactsForList(activeList.id);
        }
        await fetchLists();
        alert(`✅ Agenda sincronizada! Total de ${data.count} contato(s) na lista Agendados.`);
      }
    } catch (e) {
      console.error('Erro ao sincronizar agenda:', e);
    } finally {
      setIsSyncingAgenda(false);
    }
  };

  // Criação de Nova Lista (limpa, sem contatos da agenda)
  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, name: newListName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setNewListName('');
        setIsModalOpen(false);
        await fetchLists();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao criar lista.');
    }
  };

  // Importar planilha CSV para criar nova lista
  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) return;

        // 1. Cria a lista com o nome do arquivo
        const listRes = await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_id: workspaceId, name: baseName })
        });
        const listData = await listRes.json();
        if (!listData.success || !listData.id) return;

        // 2. Extrai contatos
        const parsedContacts = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (i === 0 && /(nome|phone|telefone|contato|celular)/i.test(line)) continue;
          const parts = line.split(/[;,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
          let name = '';
          let phone = '';
          if (parts.length >= 2) {
            if (/\d{8,}/.test(parts[0].replace(/\D/g, ''))) {
              phone = parts[0].replace(/\D/g, '');
              name = parts[1];
            } else {
              name = parts[0];
              phone = parts[1].replace(/\D/g, '');
            }
          } else if (parts.length === 1) {
            phone = parts[0].replace(/\D/g, '');
            name = 'Contato ' + (i + 1);
          }
          if (phone && phone.length >= 8) {
            parsedContacts.push({ name: name || 'Lead', phone });
          }
        }

        if (parsedContacts.length > 0) {
          await fetch('/api/contacts/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspace_id: workspaceId,
              list_id: listData.id,
              contacts: parsedContacts
            })
          });
        }

        alert(`✅ Lista "${baseName}" criada com ${parsedContacts.length} contatos!`);
        await fetchLists();
      } catch (err) {
        console.error(err);
        alert('Erro ao importar arquivo.');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // Importar planilha CSV para a lista ativa
  const handleListFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !activeList) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) {
          alert('Arquivo vazio.');
          return;
        }

        const parsedContacts = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (i === 0 && /(nome|phone|telefone|contato|celular)/i.test(line)) continue;
          const parts = line.split(/[;,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
          let name = '';
          let phone = '';
          if (parts.length >= 2) {
            if (/\d{8,}/.test(parts[0].replace(/\D/g, ''))) {
              phone = parts[0].replace(/\D/g, '');
              name = parts[1];
            } else {
              name = parts[0];
              phone = parts[1].replace(/\D/g, '');
            }
          } else if (parts.length === 1) {
            phone = parts[0].replace(/\D/g, '');
            name = 'Contato ' + (i + 1);
          }
          if (phone && phone.length >= 8) {
            parsedContacts.push({ name: name || 'Lead', phone });
          }
        }

        if (parsedContacts.length === 0) {
          alert('Nenhum telefone válido encontrado.');
          return;
        }

        const res = await fetch('/api/contacts/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_id: workspaceId,
            list_id: activeList.id,
            contacts: parsedContacts
          })
        });
        const data = await res.json();
        if (data.success) {
          alert(`✅ ${data.count || parsedContacts.length} contatos adicionados à lista "${activeList.name}"!`);
          await fetchContactsForList(activeList.id);
          await fetchLists();
        } else {
          alert('Erro ao importar contatos: ' + (data.error || 'Erro'));
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao processar arquivo: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  // Adicionar Contato Manualmente na lista ativa
  const handleAddManual = async (e) => {
    e.preventDefault();
    if (!manualContact.name || !manualContact.phone || !activeList) return;
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          list_id: activeList.id,
          name: manualContact.name.trim(),
          phone: manualContact.phone.trim(),
          status: 'Novo'
        })
      });
      const data = await res.json();
      if (data.success) {
        setManualContact({ name: '', phone: '' });
        setIsAddManualOpen(false);
        await fetchContactsForList(activeList.id);
        await fetchLists();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar contato.');
    }
  };

  // Deletar Contato
  const handleDeleteLead = async (leadId) => {
    try {
      const res = await fetch(`/api/contacts/${leadId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLeads(prev => prev.filter(l => l.id !== leadId));
        setActiveDropdownLead(null);
        await fetchLists();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Excluir Lista
  const handleDeleteList = async (list) => {
    if (list.name === 'Agendados') {
      alert('A lista "Agendados" é uma lista automática sincronizada com o Cal.com e a agenda, e não pode ser excluída.');
      return;
    }
    if (!confirm(`Deseja realmente excluir a lista "${list.name}" e seus contatos?`)) return;
    try {
      const res = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        if (activeList?.id === list.id) setActiveList(null);
        await fetchLists();
      } else {
        alert(data.error || 'Erro ao excluir lista');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir lista');
    }
  };

  const toggleTagForLead = (leadId, tagId) => {
    setLeads(leads.map(lead => {
      if (lead.id !== leadId) return lead;
      const hasTag = lead.tags.includes(tagId);
      return {
        ...lead,
        tags: hasTag ? lead.tags.filter(t => t !== tagId) : [...lead.tags, tagId]
      };
    }));
  };

  const createAndAssignTag = (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const colors = [
      { color: '#10B981', bg: '#D1FAE5' },
      { color: '#EC4899', bg: '#FCE7F3' },
      { color: '#06B6D4', bg: '#CFFAFE' },
      { color: '#F97316', bg: '#FFEDD5' }
    ];
    const randColor = colors[Math.floor(Math.random() * colors.length)];
    const newTag = { id: Date.now(), name: newTagName.trim(), ...randColor };
    setAvailableTags([...availableTags, newTag]);
    if (tagModalLead) {
      setLeads(leads.map(lead => {
        if (lead.id === tagModalLead.id) {
          return { ...lead, tags: [...lead.tags, newTag.id] };
        }
        return lead;
      }));
    }
    setNewTagName('');
  };

  const createGlobalTag = (e) => {
    e.preventDefault();
    if (!newGlobalTagName.trim()) return;
    const colors = [
      { color: '#10B981', bg: '#D1FAE5' },
      { color: '#EC4899', bg: '#FCE7F3' },
      { color: '#06B6D4', bg: '#CFFAFE' },
      { color: '#F97316', bg: '#FFEDD5' }
    ];
    const randColor = colors[Math.floor(Math.random() * colors.length)];
    const newTag = { id: Date.now(), name: newGlobalTagName.trim(), ...randColor };
    setAvailableTags([...availableTags, newTag]);
    setNewGlobalTagName('');
    setIsGlobalTagModalOpen(false);
  };

  // Filtragem de contatos na lista ativa
  const filteredLeads = leads.filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return l.name.toLowerCase().includes(q) || (l.phone && l.phone.includes(q));
  });

  // TELA DE DETALHES DE UMA LISTA ESPECÍFICA
  if (activeList) {
    const isAgendadosList = activeList.name === 'Agendados';

    return (
      <div className="contacts-container">
        <header className="contacts-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="icon-btn" onClick={() => setActiveList(null)} title="Voltar para todas as listas">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 className="contacts-title" style={{ margin: 0 }}>{activeList.name}</h1>
                {isAgendadosList && (
                  <span className="system-badge">
                    <Calendar size={13} /> Sincronizada com Cal.com
                  </span>
                )}
              </div>
              <p className="contacts-subtitle" style={{ margin: '4px 0 0 0' }}>
                Gerencie os {leads.length} leads desta lista
              </p>
            </div>
          </div>
          <div className="contacts-actions">
            {isAgendadosList ? (
              <button 
                className="btn-secondary" 
                onClick={handleSyncAgenda}
                disabled={isSyncingAgenda}
              >
                <Refresh size={18} /> {isSyncingAgenda ? 'Sincronizando...' : 'Sincronizar Agenda'}
              </button>
            ) : (
              <>
                <input 
                  type="file" 
                  ref={listFileInputRef} 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  style={{display: 'none'}} 
                  onChange={handleListFileUpload} 
                />
                <button className="btn-secondary" onClick={() => listFileInputRef.current?.click()}>
                  <Upload size={18} /> Importar Planilha
                </button>
                <button className="btn-primary" onClick={() => setIsAddManualOpen(true)}>
                  <UserPlus size={18} /> Adicionar Manualmente
                </button>
              </>
            )}
          </div>
        </header>

        {isAgendadosList && (
          <div className="agenda-banner">
            <div className="agenda-banner-text">
              <Calendar size={22} />
              <span>Esta lista é gerada e atualizada automaticamente a partir dos agendamentos do Cal.com e da Agenda do sistema. Ela não se mistura com suas listas personalizadas.</span>
            </div>
            <button 
              className="btn-primary" 
              onClick={handleSyncAgenda}
              disabled={isSyncingAgenda}
              style={{ fontSize: '0.85rem', padding: '8px 16px' }}
            >
              <Refresh size={16} /> Atualizar Agora
            </button>
          </div>
        )}

        <div className="contacts-content">
          <div className="contacts-toolbar">
            <div className="search-bar">
              <Search size={18} color="#A1A1AA" />
              <input 
                type="text" 
                placeholder={`Buscar leads em "${activeList.name}"...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="icon-btn" title="Filtros avançados"><Filter size={18} /></button>
          </div>

          {isLoadingLeads ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717A' }}>
              Carregando contatos da lista...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="empty-leads-box">
              <Users size={40} color="#A1A1AA" />
              <h3>Nenhum lead nesta lista ainda</h3>
              <p>
                {isAgendadosList
                  ? 'Nenhum agendamento futuro ou participante foi encontrado na agenda. Novos agendamentos aparecerão aqui automaticamente.'
                  : 'Importe uma planilha CSV ou adicione contatos manualmente para começar a usar esta lista.'}
              </p>
              {!isAgendadosList && (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button className="btn-secondary" onClick={() => listFileInputRef.current?.click()}>
                    <Upload size={16} /> Importar CSV
                  </button>
                  <button className="btn-primary" onClick={() => setIsAddManualOpen(true)}>
                    <UserPlus size={16} /> Adicionar Contato
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="table-container">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Nome do Contato</th>
                    <th>WhatsApp / Telefone</th>
                    <th>Status</th>
                    <th>Tags</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => (
                    <tr key={lead.id}>
                      <td>
                        <div className="lead-name-cell">
                          <div className="lead-avatar-placeholder">
                            {lead.name.charAt(0)}
                          </div>
                          <span className="lead-name-text">{lead.name}</span>
                        </div>
                      </td>
                      <td><span className="lead-phone">{lead.phone || 'Sem telefone'}</span></td>
                      <td>
                        <span className={`status-badge status-${lead.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td>
                        <div className="lead-tags">
                          {lead.tags.map(tagId => {
                            const tag = availableTags.find(t => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <span key={tag.id} className="lead-tag" style={{ color: tag.color, backgroundColor: tag.bg }}>
                                {tag.name}
                              </span>
                            );
                          })}
                          <button className="add-tag-btn" onClick={() => setTagModalLead(lead)} title="Gerenciar Tags">
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="dropdown-container">
                          <button 
                            className="icon-btn-small" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setActiveDropdownLead(activeDropdownLead === lead.id ? null : lead.id);
                              setActiveDropdownList(null);
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {activeDropdownLead === lead.id && (
                            <div className="dropdown-menu" onClick={e => e.stopPropagation()}>
                              <button className="dropdown-item danger" onClick={() => handleDeleteLead(lead.id)}>
                                <Trash size={14} /> Excluir
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isAddManualOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Adicionar Contato em "{activeList.name}"</h2>
                <button className="close-btn" onClick={() => setIsAddManualOpen(false)}><Close size={20} /></button>
              </div>
              <form onSubmit={handleAddManual}>
                <div className="form-group" style={{ padding: '24px', paddingBottom: '0' }}>
                  <label>Nome do Contato</label>
                  <input 
                    type="text" 
                    placeholder="Ex: João Silva" 
                    value={manualContact.name}
                    onChange={(e) => setManualContact({...manualContact, name: e.target.value})}
                    autoFocus
                  />
                </div>
                <div className="form-group" style={{ padding: '24px', paddingTop: '16px' }}>
                  <label>WhatsApp / Telefone</label>
                  <input 
                    type="text" 
                    placeholder="Ex: 5511999999999" 
                    value={manualContact.phone}
                    onChange={(e) => setManualContact({...manualContact, phone: e.target.value})}
                  />
                </div>
                <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsAddManualOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={!manualContact.name.trim() || !manualContact.phone.trim()}>
                    Salvar na Lista
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Tags */}
        {tagModalLead && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Label size={18} color="#71717A" />
                  <h2>Tags de {tagModalLead.name.split(' ')[0]}</h2>
                </div>
                <button className="close-btn" onClick={() => setTagModalLead(null)}><Close size={20} /></button>
              </div>
              
              <div className="modal-body" style={{ padding: '24px' }}>
                <p style={{ fontSize: '0.9rem', color: '#71717A', marginBottom: '16px' }}>
                  Selecione as tags para este contato:
                </p>
                
                <div className="tags-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                  {availableTags.map(tag => {
                    const isSelected = tagModalLead.tags.includes(tag.id);
                    return (
                      <div 
                        key={tag.id} 
                        className={`selectable-tag ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleTagForLead(tagModalLead.id, tag.id)}
                        style={{ 
                          color: isSelected ? tag.color : '#71717A', 
                          backgroundColor: isSelected ? tag.bg : '#F4F4F5',
                          border: `1px solid ${isSelected ? tag.color : '#E4E4E7'}`
                        }}
                      >
                        {tag.name}
                      </div>
                    );
                  })}
                </div>

                <div className="divider" style={{ height: '1px', backgroundColor: '#E4E4E7', margin: '0 -24px 24px -24px' }}></div>

                <form onSubmit={createAndAssignTag}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Criar Nova Label</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        placeholder="Ex: Cliente Antigo" 
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button type="submit" className="btn-secondary" disabled={!newTagName.trim()} style={{ padding: '0 16px' }}>
                        Criar
                      </button>
                    </div>
                  </div>
                </form>
              </div>
              <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
                <button type="button" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setTagModalLead(null)}>Concluir</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // TELA PRINCIPAL (LISTA DE TODAS AS LISTAS)
  return (
    <div className="contacts-container">
      <header className="contacts-header">
        <div>
          <h1 className="contacts-title">Agenda de Contatos</h1>
          <p className="contacts-subtitle">O coração do seu CRM: importe planilhas, crie listas e gerencie usuários.</p>
        </div>
        <div className="contacts-actions">
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
            style={{display: 'none'}} 
            onChange={handleFileUpload} 
          />
          
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()} title="Criar nova lista importando planilha">
            <Upload size={18} /> Importar Planilha ou CSV
          </button>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Nova Lista Vazia
          </button>
        </div>
      </header>

      <div className="tags-section">
        <div className="tags-container">
          <span className="tags-label">Suas Tags do CRM:</span>
          {availableTags.map(tag => (
            <div key={tag.id} className="global-tag-card" style={{ backgroundColor: tag.bg, color: tag.color, border: `1px solid ${tag.color}40` }}>
              <Label size={14} />
              <span>{tag.name}</span>
            </div>
          ))}
          <button className="create-tag-btn" onClick={() => setIsGlobalTagModalOpen(true)}>
            <Plus size={14} /> Nova Label
          </button>
        </div>
      </div>

      <div className="contacts-content">
        <div className="contacts-toolbar">
          <div className="search-bar">
            <Search size={18} color="#A1A1AA" />
            <input 
              type="text" 
              placeholder="Buscar listas de contatos..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="icon-btn" title="Filtros avançados"><Filter size={18} /></button>
        </div>

        {isLoadingLists ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#71717A' }}>
            Carregando listas...
          </div>
        ) : (
          <div className="lists-grid">
            {lists
              .filter(l => !searchQuery.trim() || l.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(list => {
                const isAgendados = list.name === 'Agendados';

                return (
                  <div 
                    key={list.id} 
                    className={`list-card ${isAgendados ? 'system-card' : ''}`}
                    onClick={() => setActiveList(list)}
                  >
                    <div className="list-card-header">
                      <div className="list-icon" style={{ backgroundColor: isAgendados ? '#E0F2FE' : '#FEF3C7' }}>
                        {isAgendados ? (
                          <Calendar size={20} color="#0284C7" />
                        ) : (
                          <Users size={20} color="#F59E0B" />
                        )}
                      </div>
                      
                      {!isAgendados && (
                        <div className="dropdown-container">
                          <button 
                            className="icon-btn-small" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setActiveDropdownList(activeDropdownList === list.id ? null : list.id);
                              setActiveDropdownLead(null);
                            }}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {activeDropdownList === list.id && (
                            <div className="dropdown-menu" onClick={e => e.stopPropagation()}>
                              <button className="dropdown-item danger" onClick={() => handleDeleteList(list)}>
                                <Trash size={14} /> Deletar Lista
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <h3 className="list-name">{list.name}</h3>

                    {isAgendados && (
                      <div className="system-badge">
                        <Check size={12} /> Automática • Agenda
                      </div>
                    )}

                    <div className="list-meta" style={{ marginTop: isAgendados ? '8px' : '0' }}>
                      <span>{list.count || 0} contatos</span>
                      <span className="dot">•</span>
                      <span>{isAgendados ? 'Cal.com' : 'Personalizada'}</span>
                    </div>
                  </div>
                );
              })}
            
            <div className="list-card dashed-card" onClick={() => setIsModalOpen(true)}>
               <Plus size={24} color="#A1A1AA" />
               <span>Criar Nova Lista Vazia</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Criação de Lista */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Criar Nova Lista</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><Close size={20} /></button>
            </div>
            <form onSubmit={handleCreateList}>
              <div className="form-group">
                <label>Nome da Lista</label>
                <input 
                  type="text" 
                  placeholder="Ex: Leads VIP Outubro" 
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={!newListName.trim()}>Criar Lista</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Label Modal */}
      {isGlobalTagModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Label size={20} color="#18181B" />
                <h2>Criar Nova Label Global</h2>
              </div>
              <button className="close-btn" onClick={() => setIsGlobalTagModalOpen(false)}><Close size={20} /></button>
            </div>
            <form onSubmit={createGlobalTag}>
              <div className="form-group">
                <label>Nome da Label</label>
                <input 
                  type="text" 
                  placeholder="Ex: Urgente" 
                  value={newGlobalTagName}
                  onChange={(e) => setNewGlobalTagName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsGlobalTagModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={!newGlobalTagName.trim()}>Salvar Label</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
