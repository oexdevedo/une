import React, { useState, useRef } from 'react';
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
  Label
} from 'pixelarticons/react';

export default function Contacts() {
  const [lists, setLists] = useState([
    { id: 1, name: 'Leads VIP Outubro', count: 1250, date: '05 out. 2026' },
    { id: 2, name: 'Clientes Inativos', count: 320, date: '12 set. 2026' },
    { id: 3, name: 'Inscritos Webinar', count: 890, date: '01 out. 2026' },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  const [activeList, setActiveList] = useState(null);
  const [isAddManualOpen, setIsAddManualOpen] = useState(false);
  const [manualContact, setManualContact] = useState({ name: '', phone: '' });
  
  const [activeDropdownList, setActiveDropdownList] = useState(null);
  const [activeDropdownLead, setActiveDropdownLead] = useState(null);

  React.useEffect(() => {
    const handleClickOutside = () => {
      setActiveDropdownList(null);
      setActiveDropdownLead(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Sincroniza listas e contatos com o banco de dados SQLite
  React.useEffect(() => {
    fetch('/api/lists?workspace_id=1')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) setLists(d);
      })
      .catch(console.error);

    fetch('/api/contacts?workspace_id=1')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setLeads(d.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            status: c.status || 'Novo',
            tags: [1]
          })));
        }
      })
      .catch(console.error);
  }, []);

  // Label Management
  const [availableTags, setAvailableTags] = useState([
    { id: 1, name: 'Quente', color: '#EF4444', bg: '#FEE2E2' },
    { id: 2, name: 'Frio', color: '#3B82F6', bg: '#DBEAFE' },
    { id: 3, name: 'VIP', color: '#F59E0B', bg: '#FEF3C7' },
    { id: 4, name: 'B2B', color: '#8B5CF6', bg: '#EDE9FE' }
  ]);
  const [tagModalLead, setTagModalLead] = useState(null);
  const [newTagName, setNewTagName] = useState('');

  const [leads, setLeads] = useState([]);
  
  const fileInputRef = useRef(null);
  const listFileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    if (e.target.files.length > 0) {
      alert(`Planilha "${e.target.files[0].name}" importada com sucesso e nova lista gerada!`);
      e.target.value = null;
    }
  };

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: 1, name: newListName })
      });
      const data = await res.json();
      const newList = {
        id: data.id || Date.now(),
        name: newListName,
        count: 0,
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      setLists([newList, ...lists]); 
      setNewListName('');
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      const newList = {
        id: Date.now(),
        name: newListName,
        count: 0,
        date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      setLists([newList, ...lists]); 
      setNewListName('');
      setIsModalOpen(false);
    }
  };

  const handleListFileUpload = (e) => {
    if (e.target.files.length > 0) {
      const addedCount = Math.floor(Math.random() * 50) + 10;
      alert(`Upload concluído! ${addedCount} contatos foram extraídos e adicionados à lista "${activeList.name}".`);
      
      const updatedLists = lists.map(l => l.id === activeList.id ? {...l, count: l.count + addedCount} : l);
      setLists(updatedLists);
      setActiveList(updatedLists.find(l => l.id === activeList.id));
      e.target.value = null;
    }
  };

  const handleAddManual = async (e) => {
    e.preventDefault();
    if (!manualContact.name || !manualContact.phone) return;
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: 1,
          list_id: activeList?.id || null,
          name: manualContact.name,
          phone: manualContact.phone,
          status: 'Novo'
        })
      });
      const data = await res.json();
      const newContact = {
        id: data.id || Date.now(),
        name: manualContact.name,
        phone: manualContact.phone,
        status: 'Novo',
        tags: []
      };
      setLeads([newContact, ...leads]);
      const updatedLists = lists.map(l => l.id === activeList?.id ? {...l, count: l.count + 1} : l);
      setLists(updatedLists);
      setManualContact({ name: '', phone: '' });
      setIsAddManualOpen(false);
    } catch (err) {
      console.error(err);
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
    
    // random colors for new tags
    const colors = [
      { color: '#10B981', bg: '#D1FAE5' },
      { color: '#EC4899', bg: '#FCE7F3' },
      { color: '#06B6D4', bg: '#CFFAFE' },
      { color: '#F97316', bg: '#FFEDD5' }
    ];
    const randColor = colors[Math.floor(Math.random() * colors.length)];
    
    const newTag = {
      id: Date.now(),
      name: newTagName,
      ...randColor
    };
    
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

  const [isGlobalTagModalOpen, setIsGlobalTagModalOpen] = useState(false);
  const [newGlobalTagName, setNewGlobalTagName] = useState('');

  if (activeList) {
    return (
      <div className="contacts-container">
        <header className="contacts-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="icon-btn" onClick={() => setActiveList(null)}><ArrowLeft size={20} /></button>
            <div>
              <h1 className="contacts-title">{activeList.name}</h1>
              <p className="contacts-subtitle">Gerencie os {activeList.count} leads desta lista</p>
            </div>
          </div>
          <div className="contacts-actions">
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
          </div>
        </header>

        <div className="contacts-content">
          <div className="contacts-toolbar">
            <div className="search-bar">
              <Search size={18} color="#A1A1AA" />
              <input type="text" placeholder={`Buscar leads na lista ${activeList.name}...`} />
            </div>
            <button className="icon-btn" title="Filtros avançados"><Filter size={18} /></button>
          </div>

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
                {leads.map(lead => (
                  <tr key={lead.id}>
                    <td>
                      <div className="lead-name-cell">
                        <div className="lead-avatar-placeholder">
                          {lead.name.charAt(0)}
                        </div>
                        <span className="lead-name-text">{lead.name}</span>
                      </div>
                    </td>
                    <td><span className="lead-phone">{lead.phone}</span></td>
                    <td>
                      <span className={`status-badge status-${lead.status.toLowerCase().replace(' ', '-')}`}>
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
                            <button className="dropdown-item" onClick={() => { setActiveDropdownLead(null); }}>Editar</button>
                            <button className="dropdown-item" onClick={() => { setActiveDropdownLead(null); }}>Salvar</button>
                            <button className="dropdown-item danger" onClick={() => { 
                              setLeads(leads.filter(l => l.id !== lead.id));
                              setActiveDropdownLead(null);
                            }}>Deletar</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {isAddManualOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Adicionar Contato</h2>
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
                    placeholder="Ex: (11) 99999-9999" 
                    value={manualContact.phone}
                    onChange={(e) => setManualContact({...manualContact, phone: e.target.value})}
                  />
                </div>
                <div className="modal-actions" style={{ padding: '0 24px 24px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsAddManualOpen(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={!manualContact.name || !manualContact.phone}>Salvar Contato</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Label Management Modal */}
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
                  Selecione as tags para este contato ou crie uma nova.
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
    
    const newTag = {
      id: Date.now(),
      name: newGlobalTagName,
      ...randColor
    };
    
    setAvailableTags([...availableTags, newTag]);
    setNewGlobalTagName('');
    setIsGlobalTagModalOpen(false);
  };

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
          
          <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} /> Importar Planilha ou CSV
          </button>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Nova Lista
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
            <input type="text" placeholder="Buscar listas ou contatos específicos..." />
          </div>
          <button className="icon-btn" title="Filtros avançados"><Filter size={18} /></button>
        </div>

        <div className="lists-grid">
          {lists.map(list => (
            <div key={list.id} className="list-card" onClick={() => setActiveList(list)}>
              <div className="list-card-header">
                <div className="list-icon">
                  <Users size={20} color="#F59E0B" />
                </div>
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
                      <button className="dropdown-item" onClick={() => { setActiveDropdownList(null); }}>Editar</button>
                      <button className="dropdown-item" onClick={() => { setActiveDropdownList(null); }}>Salvar</button>
                      <button className="dropdown-item danger" onClick={() => { 
                        setLists(lists.filter(l => l.id !== list.id));
                        setActiveDropdownList(null);
                      }}>Deletar</button>
                    </div>
                  )}
                </div>
              </div>
              <h3 className="list-name">{list.name}</h3>
              <div className="list-meta">
                <span>{list.count} contatos</span>
                <span className="dot">•</span>
                <span>Criada em {list.date}</span>
              </div>
            </div>
          ))}
          
          <div className="list-card dashed-card" onClick={() => setIsModalOpen(true)}>
             <Plus size={24} color="#A1A1AA" />
             <span>Criar Nova Lista Vazia</span>
          </div>
        </div>
      </div>

      {/* Existing Modals */}
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
                  placeholder="Ex: Clientes Dezembro 2026" 
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
