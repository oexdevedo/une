import React, { useState, useEffect } from 'react';
import './Tasks.css';
import {
  Notes,
  Clipboard,
  Plus,
  Trash,
  Check,
  Close,
  Search,
  Bookmark,
  Clock,
  User,
  Flag,
  ChevronLeft,
  ChevronRight,
  Pencil
} from 'pixelarticons/react';

const API_BASE = 'http://localhost:3001/api/tasks';

const POSTIT_COLORS = [
  { id: 'yellow', label: 'Amarelo', bg: '#FEF08A', border: '#FDE047' },
  { id: 'pink', label: 'Rosa', bg: '#FBCFE8', border: '#F472B6' },
  { id: 'green', label: 'Verde', bg: '#BBF7D0', border: '#4ADE80' },
  { id: 'blue', label: 'Azul', bg: '#BAE6FD', border: '#38BDF8' },
  { id: 'purple', label: 'Roxo', bg: '#DDD6FE', border: '#A78BFA' },
  { id: 'orange', label: 'Laranja', bg: '#FED7AA', border: '#FB923C' }
];

const KANBAN_COLUMNS = [
  { id: 'todo', title: 'A Fazer', dotClass: 'todo' },
  { id: 'in_progress', title: 'Em Progresso', dotClass: 'in_progress' },
  { id: 'review', title: 'Em Revisão', dotClass: 'review' },
  { id: 'done', title: 'Concluído', dotClass: 'done' }
];

export default function Tasks() {
  // Active Tab: 'notebook' (post-its) or 'kanban' (projects)
  const [activeTab, setActiveTab] = useState('notebook');

  // State
  const [notes, setNotes] = useState([]);
  const [kanbanCards, setKanbanCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Modal States
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  const [isKanbanModalOpen, setIsKanbanModalOpen] = useState(false);
  const [editingKanban, setEditingKanban] = useState(null);

  // Note Form
  const [noteForm, setNoteForm] = useState({
    title: '',
    category: 'Geral',
    color: 'yellow',
    is_pinned: 0,
    itemsText: ''
  });

  // Kanban Form
  const [kanbanForm, setKanbanForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    tag: 'Geral',
    assignee_name: 'Equipe',
    assignee_avatar: 'EQ',
    checklist_total: 3,
    checklist_done: 0
  });

  // Inline Quick Add item map for notes: { [noteId]: string }
  const [quickItemText, setQuickItemText] = useState({});

  // Drag & drop state for Kanban
  const [draggedCardId, setDraggedCardId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [notesRes, kanbanRes] = await Promise.all([
        fetch(`${API_BASE}/notes`),
        fetch(`${API_BASE}/kanban`)
      ]);

      if (notesRes.ok) {
        const notesData = await notesRes.json();
        setNotes(notesData);
      }

      if (kanbanRes.ok) {
        const kanbanData = await kanbanRes.json();
        setKanbanCards(kanbanData);
      }
    } catch (err) {
      console.error('Erro ao carregar tarefas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ----------------------------------------------------
  // NOTEBOOK / POST-ITS HANDLERS
  // ----------------------------------------------------
  const handleOpenCreateNote = () => {
    setEditingNote(null);
    setNoteForm({
      title: '',
      category: 'Geral',
      color: 'yellow',
      is_pinned: 0,
      itemsText: ''
    });
    setIsNoteModalOpen(true);
  };

  const handleOpenEditNote = (note) => {
    setEditingNote(note);
    setNoteForm({
      title: note.title || '',
      category: note.category || 'Geral',
      color: note.color || 'yellow',
      is_pinned: note.is_pinned || 0,
      itemsText: (note.items || []).map(i => i.text).join('\n')
    });
    setIsNoteModalOpen(true);
  };

  const handleToggleCheckItem = async (noteId, itemId) => {
    // Optimistic UI update
    setNotes(prev =>
      prev.map(note => {
        if (note.id !== noteId) return note;
        const updatedItems = (note.items || []).map(it =>
          String(it.id) === String(itemId) ? { ...it, completed: !it.completed } : it
        );
        return { ...note, items: updatedItems };
      })
    );

    try {
      await fetch(`${API_BASE}/notes/${noteId}/toggle-item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId })
      });
    } catch (err) {
      console.error('Erro ao alternar item:', err);
      fetchData();
    }
  };

  const handleTogglePinNote = async (note) => {
    const updatedPinned = note.is_pinned ? 0 : 1;
    setNotes(prev =>
      prev.map(n => (n.id === note.id ? { ...n, is_pinned: updatedPinned } : n))
    );

    try {
      await fetch(`${API_BASE}/notes/${note.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: updatedPinned })
      });
      fetchData();
    } catch (err) {
      console.error('Erro ao fixar nota:', err);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Tem certeza de que deseja excluir este post-it permanentemente?')) return;
    setNotes(prev => prev.filter(n => n.id !== noteId));
    setIsNoteModalOpen(false);

    try {
      await fetch(`${API_BASE}/notes/${noteId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Erro ao excluir nota:', err);
      fetchData();
    }
  };

  const handleAddQuickItem = async (noteId, e) => {
    e.preventDefault();
    const text = (quickItemText[noteId] || '').trim();
    if (!text) return;

    const targetNote = notes.find(n => n.id === noteId);
    if (!targetNote) return;

    const newItem = {
      id: Date.now().toString(),
      text,
      completed: false
    };

    const newItems = [...(targetNote.items || []), newItem];

    setNotes(prev =>
      prev.map(n => (n.id === noteId ? { ...n, items: newItems } : n))
    );
    setQuickItemText(prev => ({ ...prev, [noteId]: '' }));

    try {
      await fetch(`${API_BASE}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems })
      });
    } catch (err) {
      console.error('Erro ao adicionar item:', err);
      fetchData();
    }
  };

  const handleDeleteCheckItem = async (noteId, itemId, e) => {
    e.stopPropagation();
    const targetNote = notes.find(n => n.id === noteId);
    if (!targetNote) return;

    const newItems = (targetNote.items || []).filter(it => String(it.id) !== String(itemId));

    setNotes(prev =>
      prev.map(n => (n.id === noteId ? { ...n, items: newItems } : n))
    );

    try {
      await fetch(`${API_BASE}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems })
      });
    } catch (err) {
      console.error('Erro ao remover item:', err);
      fetchData();
    }
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteForm.title.trim()) return;

    // Preserve existing items completion state if editing
    const lines = noteForm.itemsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    let parsedItems = [];
    if (editingNote && editingNote.items) {
      const existingMap = new Map((editingNote.items || []).map(it => [it.text, it.completed]));
      parsedItems = lines.map((text, idx) => ({
        id: editingNote.items[idx]?.id || `${Date.now()}_${idx}`,
        text,
        completed: existingMap.has(text) ? existingMap.get(text) : false
      }));
    } else {
      parsedItems = lines.map((text, idx) => ({
        id: `${Date.now()}_${idx}`,
        text,
        completed: false
      }));
    }

    try {
      if (editingNote) {
        // UPDATE NOTE
        const res = await fetch(`${API_BASE}/notes/${editingNote.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: noteForm.title,
            category: noteForm.category,
            color: noteForm.color,
            is_pinned: noteForm.is_pinned,
            items: parsedItems
          })
        });

        if (res.ok) {
          setIsNoteModalOpen(false);
          setEditingNote(null);
          fetchData();
        }
      } else {
        // CREATE NOTE
        const res = await fetch(`${API_BASE}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: noteForm.title,
            category: noteForm.category,
            color: noteForm.color,
            is_pinned: noteForm.is_pinned,
            items: parsedItems
          })
        });

        if (res.ok) {
          setIsNoteModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      console.error('Erro ao salvar nota:', err);
    }
  };

  // ----------------------------------------------------
  // KANBAN HANDLERS
  // ----------------------------------------------------
  const handleOpenCreateKanban = (defaultStatus = 'todo') => {
    setEditingKanban(null);
    setKanbanForm({
      title: '',
      description: '',
      status: defaultStatus,
      priority: 'medium',
      due_date: '',
      tag: 'Geral',
      assignee_name: 'Equipe',
      assignee_avatar: 'EQ',
      checklist_total: 3,
      checklist_done: 0
    });
    setIsKanbanModalOpen(true);
  };

  const handleOpenEditKanban = (card) => {
    setEditingKanban(card);
    setKanbanForm({
      title: card.title || '',
      description: card.description || '',
      status: card.status || 'todo',
      priority: card.priority || 'medium',
      due_date: card.due_date || '',
      tag: card.tag || 'Geral',
      assignee_name: card.assignee_name || 'Equipe',
      assignee_avatar: card.assignee_avatar || 'EQ',
      checklist_total: card.checklist_total !== undefined ? card.checklist_total : 0,
      checklist_done: card.checklist_done !== undefined ? card.checklist_done : 0
    });
    setIsKanbanModalOpen(true);
  };

  const handleMoveKanbanCard = async (cardId, newStatus) => {
    setKanbanCards(prev =>
      prev.map(card => (card.id === cardId ? { ...card, status: newStatus } : card))
    );

    try {
      await fetch(`${API_BASE}/kanban/${cardId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error('Erro ao mover card:', err);
      fetchData();
    }
  };

  const handleDeleteKanbanCard = async (cardId) => {
    if (!window.confirm('Tem certeza de que deseja excluir este card do projeto?')) return;
    setKanbanCards(prev => prev.filter(c => c.id !== cardId));
    setIsKanbanModalOpen(false);

    try {
      await fetch(`${API_BASE}/kanban/${cardId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Erro ao excluir card:', err);
      fetchData();
    }
  };

  const handleClearColumn = async (columnId, columnTitle) => {
    const cardsCount = kanbanCards.filter(c => c.status === columnId).length;
    if (cardsCount === 0) return;

    if (!window.confirm(`Deseja excluir todos os ${cardsCount} cards da coluna "${columnTitle}"?`)) {
      return;
    }

    setKanbanCards(prev => prev.filter(c => c.status !== columnId));

    try {
      await fetch(`${API_BASE}/kanban/column/${columnId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Erro ao limpar coluna:', err);
      fetchData();
    }
  };

  const handleSaveKanbanCard = async (e) => {
    e.preventDefault();
    if (!kanbanForm.title.trim()) return;

    try {
      if (editingKanban) {
        // UPDATE KANBAN CARD
        const res = await fetch(`${API_BASE}/kanban/${editingKanban.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kanbanForm)
        });

        if (res.ok) {
          setIsKanbanModalOpen(false);
          setEditingKanban(null);
          fetchData();
        }
      } else {
        // CREATE KANBAN CARD
        const res = await fetch(`${API_BASE}/kanban`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kanbanForm)
        });

        if (res.ok) {
          setIsKanbanModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      console.error('Erro ao salvar card:', err);
    }
  };

  // Drag and Drop
  const handleDragStart = (e, cardId) => {
    setDraggedCardId(cardId);
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDragOver = (e, colId) => {
    e.preventDefault();
    setDragOverCol(colId);
  };

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const cardId = Number(e.dataTransfer.getData('text/plain') || draggedCardId);
    if (!cardId) return;

    handleMoveKanbanCard(cardId, targetStatus);
    setDraggedCardId(null);
  };

  // ----------------------------------------------------
  // FILTERING
  // ----------------------------------------------------
  const filteredNotes = notes.filter(note => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (note.items || []).some(it => it.text.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'pinned') return note.is_pinned === 1;
    return note.category.toLowerCase() === selectedFilter.toLowerCase();
  });

  const filteredKanbanCards = kanbanCards.filter(card => {
    const matchesSearch =
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (card.description && card.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (card.tag && card.tag.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'urgent') return card.priority === 'urgent';
    if (selectedFilter === 'high') return card.priority === 'high';
    return card.tag.toLowerCase() === selectedFilter.toLowerCase();
  });

  // Calculate unique categories / tags
  const noteCategories = Array.from(new Set(notes.map(n => n.category).filter(Boolean)));
  const kanbanTags = Array.from(new Set(kanbanCards.map(c => c.tag).filter(Boolean)));

  return (
    <div className="tasks-container">
      {/* HEADER */}
      <div className="tasks-header">
        <div className="tasks-header-left">
          <div className="tasks-header-icon">
            {activeTab === 'notebook' ? <Notes size={24} /> : <Clipboard size={24} />}
          </div>
          <div className="tasks-header-title">
            <h1>Tarefas & Projetos</h1>
            <div className="tasks-header-subtitle">
              {activeTab === 'notebook'
                ? 'Bloco de notas estilo checklist em post-its coloridos'
                : 'Quadro Kanban interativo para gerenciamento de projetos'}
            </div>
          </div>
        </div>

        <div className="tasks-header-controls">
          {/* Subpage / Tabs Switcher */}
          <div className="tasks-tabs-switcher">
            <button
              className={`tasks-tab-btn ${activeTab === 'notebook' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('notebook');
                setSelectedFilter('all');
              }}
            >
              <Notes size={16} />
              <span>Bloco Post-its</span>
              <span className="tasks-tab-count">{notes.length}</span>
            </button>
            <button
              className={`tasks-tab-btn ${activeTab === 'kanban' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('kanban');
                setSelectedFilter('all');
              }}
            >
              <Clipboard size={16} />
              <span>Quadro Kanban</span>
              <span className="tasks-tab-count">{kanbanCards.length}</span>
            </button>
          </div>

          {/* Action Button */}
          {activeTab === 'notebook' ? (
            <button
              className="btn-add-task"
              onClick={handleOpenCreateNote}
              title="Criar novo post-it"
            >
              <Plus size={18} />
              <span>Novo Post-it</span>
            </button>
          ) : (
            <button
              className="btn-add-task"
              onClick={() => handleOpenCreateKanban('todo')}
              title="Criar novo card no Kanban"
            >
              <Plus size={18} />
              <span>Novo Projeto</span>
            </button>
          )}
        </div>
      </div>

      {/* TOOLBAR: SEARCH & CATEGORY FILTERS */}
      <div className="tasks-toolbar">
        <div className="tasks-search-box">
          <Search size={16} color="#71717A" />
          <input
            type="text"
            placeholder={
              activeTab === 'notebook'
                ? 'Pesquisar post-its ou itens...'
                : 'Pesquisar projetos, tags...'
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => setSearchQuery('')}
            >
              <Close size={14} color="#71717A" />
            </button>
          )}
        </div>

        <div className="tasks-filter-chips">
          <button
            className={`tasks-chip ${selectedFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedFilter('all')}
          >
            Todos
          </button>

          {activeTab === 'notebook' ? (
            <>
              <button
                className={`tasks-chip ${selectedFilter === 'pinned' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('pinned')}
              >
                📌 Fixados
              </button>
              {noteCategories.map(cat => (
                <button
                  key={cat}
                  className={`tasks-chip ${selectedFilter === cat ? 'active' : ''}`}
                  onClick={() => setSelectedFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                className={`tasks-chip ${selectedFilter === 'urgent' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('urgent')}
              >
                🚨 Urgente
              </button>
              <button
                className={`tasks-chip ${selectedFilter === 'high' ? 'active' : ''}`}
                onClick={() => setSelectedFilter('high')}
              >
                ⚡ Alta Prioridade
              </button>
              {kanbanTags.map(tag => (
                <button
                  key={tag}
                  className={`tasks-chip ${selectedFilter === tag ? 'active' : ''}`}
                  onClick={() => setSelectedFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ======================================================= */}
      {/* SUBPAGE 1: NOTEBOOK / POST-ITS CHECKLIST GRID           */}
      {/* ======================================================= */}
      {activeTab === 'notebook' && (
        <div className="postits-board-area">
          {filteredNotes.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '350px',
                color: 'var(--text-muted)'
              }}
            >
              <Notes size={48} style={{ opacity: 0.4, marginBottom: 12 }} />
              <p style={{ fontWeight: 600 }}>Nenhum post-it encontrado.</p>
              <button
                className="btn-add-task"
                style={{ marginTop: 12 }}
                onClick={handleOpenCreateNote}
              >
                <Plus size={16} /> Criar Primeiro Post-it
              </button>
            </div>
          ) : (
            <div className="postits-grid">
              {filteredNotes.map(note => {
                const items = note.items || [];
                const total = items.length;
                const completed = items.filter(i => i.completed).length;
                const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                const colorClass = `postit-${note.color || 'yellow'}`;

                return (
                  <div key={note.id} className={`postit-card ${colorClass}`}>
                    {/* Top tape sticker effect */}
                    <div className="postit-tape" />

                    {/* Header */}
                    <div className="postit-header">
                      <span className="postit-category-pill">{note.category || 'Geral'}</span>
                      <div className="postit-actions">
                        <button
                          className={`postit-btn-icon ${note.is_pinned ? 'pinned' : ''}`}
                          onClick={() => handleTogglePinNote(note)}
                          title={note.is_pinned ? 'Desafixar' : 'Fixar no topo'}
                        >
                          <Bookmark size={15} />
                        </button>
                        <button
                          className="postit-btn-icon"
                          onClick={() => handleOpenEditNote(note)}
                          title="Editar post-it"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="postit-btn-icon"
                          onClick={() => handleDeleteNote(note.id)}
                          title="Excluir post-it"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Title */}
                    <div
                      className="postit-title"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleOpenEditNote(note)}
                      title="Clique para editar"
                    >
                      {note.title}
                    </div>

                    {/* Checklist Items */}
                    <div className="postit-checklist">
                      {items.map(item => (
                        <div
                          key={item.id}
                          className="postit-check-item"
                          onClick={() => handleToggleCheckItem(note.id, item.id)}
                        >
                          <div
                            className={`postit-checkbox ${item.completed ? 'checked' : ''}`}
                          >
                            {item.completed && <Check size={12} />}
                          </div>
                          <span
                            className={`postit-item-text ${
                              item.completed ? 'completed' : ''
                            }`}
                          >
                            {item.text}
                          </span>
                          <button
                            className="postit-delete-item-btn"
                            onClick={e => handleDeleteCheckItem(note.id, item.id, e)}
                            title="Remover item"
                          >
                            <Close size={12} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Quick Add Checklist Item */}
                    <form
                      className="postit-add-item-form"
                      onSubmit={e => handleAddQuickItem(note.id, e)}
                    >
                      <input
                        type="text"
                        className="postit-add-item-input"
                        placeholder="+ Adicionar item..."
                        value={quickItemText[note.id] || ''}
                        onChange={e =>
                          setQuickItemText(prev => ({ ...prev, [note.id]: e.target.value }))
                        }
                      />
                      {quickItemText[note.id] && (
                        <button type="submit" className="postit-add-item-btn">
                          OK
                        </button>
                      )}
                    </form>

                    {/* Footer Progress */}
                    {total > 0 && (
                      <div className="postit-footer">
                        <div className="postit-progress-text">
                          <span>
                            {completed} de {total} concluídos
                          </span>
                          <span>{percent}%</span>
                        </div>
                        <div className="postit-progress-track">
                          <div
                            className="postit-progress-bar"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================= */}
      {/* SUBPAGE 2: KANBAN BOARD FOR PROJECTS                    */}
      {/* ======================================================= */}
      {activeTab === 'kanban' && (
        <div className="kanban-board-area">
          <div className="kanban-columns-container">
            {KANBAN_COLUMNS.map(col => {
              const cardsInCol = filteredKanbanCards.filter(c => c.status === col.id);

              return (
                <div
                  key={col.id}
                  className="kanban-column"
                  onDragOver={e => handleDragOver(e, col.id)}
                  onDrop={e => handleDrop(e, col.id)}
                >
                  {/* Column Header */}
                  <div className="kanban-column-header">
                    <div className="kanban-col-title-group">
                      <div className={`kanban-col-dot ${col.dotClass}`} />
                      <span className="kanban-col-title">{col.title}</span>
                      <span className="kanban-col-badge">{cardsInCol.length}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {cardsInCol.length > 0 && (
                        <button
                          className="kanban-col-add-btn"
                          onClick={() => handleClearColumn(col.id, col.title)}
                          title={`Limpar todos os cards de ${col.title}`}
                        >
                          <Trash size={14} />
                        </button>
                      )}
                      <button
                        className="kanban-col-add-btn"
                        onClick={() => handleOpenCreateKanban(col.id)}
                        title={`Adicionar projeto em ${col.title}`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Cards List */}
                  <div
                    className={`kanban-cards-list ${
                      dragOverCol === col.id ? 'drag-over' : ''
                    }`}
                  >
                    {cardsInCol.map(card => {
                      const totalSub = card.checklist_total || 0;
                      const doneSub = card.checklist_done || 0;
                      const subPercent =
                        totalSub > 0 ? Math.round((doneSub / totalSub) * 100) : 0;

                      // Move column helpers
                      const colIdx = KANBAN_COLUMNS.findIndex(c => c.id === col.id);
                      const prevCol = colIdx > 0 ? KANBAN_COLUMNS[colIdx - 1] : null;
                      const nextCol =
                        colIdx < KANBAN_COLUMNS.length - 1
                          ? KANBAN_COLUMNS[colIdx + 1]
                          : null;

                      return (
                        <div
                          key={card.id}
                          className="kanban-card"
                          draggable
                          onDragStart={e => handleDragStart(e, card.id)}
                        >
                          {/* Card Top: Tag + Priority */}
                          <div className="kanban-card-top">
                            <span className="kanban-tag">{card.tag || 'Geral'}</span>
                            <div className="postit-actions">
                              <span className={`kanban-priority ${card.priority}`}>
                                <Flag size={11} />
                                {card.priority === 'urgent'
                                  ? 'Urgente'
                                  : card.priority === 'high'
                                  ? 'Alta'
                                  : card.priority === 'medium'
                                  ? 'Média'
                                  : 'Baixa'}
                              </span>
                              <button
                                className="postit-btn-icon"
                                onClick={() => handleOpenEditKanban(card)}
                                title="Editar card"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                className="postit-btn-icon"
                                onClick={() => handleDeleteKanbanCard(card.id)}
                                title="Excluir card"
                              >
                                <Trash size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Title & Description */}
                          <div
                            className="kanban-card-title"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleOpenEditKanban(card)}
                            title="Clique para editar"
                          >
                            {card.title}
                          </div>
                          {card.description && (
                            <div
                              className="kanban-card-desc"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleOpenEditKanban(card)}
                            >
                              {card.description}
                            </div>
                          )}

                          {/* Subtask / Checklist progress if present */}
                          {totalSub > 0 && (
                            <div className="kanban-card-checklist-bar">
                              <div className="kanban-checklist-label">
                                <span>Progresso</span>
                                <span>
                                  {doneSub}/{totalSub} ({subPercent}%)
                                </span>
                              </div>
                              <div className="kanban-checklist-track">
                                <div
                                  className="kanban-checklist-fill"
                                  style={{ width: `${subPercent}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Card Footer: Due Date, Assignee, Quick Column Move */}
                          <div className="kanban-card-footer">
                            <div className="kanban-due-date">
                              <Clock size={12} />
                              <span>{card.due_date || 'Sem prazo'}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div
                                className="kanban-assignee-avatar"
                                title={`Responsável: ${card.assignee_name}`}
                              >
                                {card.assignee_avatar || 'EQ'}
                              </div>

                              {/* Quick Move Buttons */}
                              <div className="kanban-quick-move">
                                {prevCol && (
                                  <button
                                    className="kanban-move-btn"
                                    onClick={() => handleMoveKanbanCard(card.id, prevCol.id)}
                                    title={`Mover para ${prevCol.title}`}
                                  >
                                    <ChevronLeft size={12} />
                                  </button>
                                )}
                                {nextCol && (
                                  <button
                                    className="kanban-move-btn"
                                    onClick={() => handleMoveKanbanCard(card.id, nextCol.id)}
                                    title={`Mover para ${nextCol.title}`}
                                  >
                                    <ChevronRight size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL: CRIAR / EDITAR POST-IT CHECKLIST                 */}
      {/* ======================================================= */}
      {isNoteModalOpen && (
        <div className="tasks-modal-overlay" onClick={() => setIsNoteModalOpen(false)}>
          <div className="tasks-modal" onClick={e => e.stopPropagation()}>
            <div className="tasks-modal-header">
              <div className="tasks-modal-title">
                {editingNote ? <Pencil size={18} /> : <Notes size={18} />}
                <span>{editingNote ? 'Editar Post-it' : 'Novo Post-it Checklist'}</span>
              </div>
              <button
                className="postit-btn-icon"
                onClick={() => setIsNoteModalOpen(false)}
              >
                <Close size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveNote}>
              <div className="tasks-modal-body">
                <div className="tasks-form-group">
                  <label>Título do Post-it *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Tarefas do Dia, Checklist Reunião..."
                    value={noteForm.title}
                    onChange={e => setNoteForm({ ...noteForm, title: e.target.value })}
                  />
                </div>

                <div className="tasks-form-group">
                  <label>Categoria</label>
                  <input
                    type="text"
                    placeholder="Ex: Marketing, Vendas, Pessoal, Urgente"
                    value={noteForm.category}
                    onChange={e => setNoteForm({ ...noteForm, category: e.target.value })}
                  />
                </div>

                <div className="tasks-form-group">
                  <label>Cor do Post-it</label>
                  <div className="color-picker-row">
                    {POSTIT_COLORS.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-option-btn ${
                          noteForm.color === c.id ? 'selected' : ''
                        }`}
                        style={{ background: c.bg, borderColor: c.border }}
                        title={c.label}
                        onClick={() => setNoteForm({ ...noteForm, color: c.id })}
                      />
                    ))}
                  </div>
                </div>

                <div className="tasks-form-group">
                  <label>Itens da Checklist (um por linha)</label>
                  <textarea
                    rows={4}
                    placeholder={"Revisar propostas enviadas\nLigar para clientes inativos\nAtualizar planilha de metas"}
                    value={noteForm.itemsText}
                    onChange={e => setNoteForm({ ...noteForm, itemsText: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="pinCheckbox"
                    checked={noteForm.is_pinned === 1}
                    onChange={e =>
                      setNoteForm({ ...noteForm, is_pinned: e.target.checked ? 1 : 0 })
                    }
                  />
                  <label
                    htmlFor="pinCheckbox"
                    style={{ fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Fixar este post-it no topo
                  </label>
                </div>
              </div>

              <div className="tasks-modal-footer">
                {editingNote && (
                  <button
                    type="button"
                    className="tasks-btn-danger"
                    onClick={() => handleDeleteNote(editingNote.id)}
                  >
                    <Trash size={14} />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="button"
                  className="tasks-btn-cancel"
                  onClick={() => setIsNoteModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="tasks-btn-submit">
                  {editingNote ? 'Salvar Alterações' : 'Criar Post-it'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL: CRIAR / EDITAR PROJETO NO KANBAN                 */}
      {/* ======================================================= */}
      {isKanbanModalOpen && (
        <div className="tasks-modal-overlay" onClick={() => setIsKanbanModalOpen(false)}>
          <div className="tasks-modal" onClick={e => e.stopPropagation()}>
            <div className="tasks-modal-header">
              <div className="tasks-modal-title">
                {editingKanban ? <Pencil size={18} /> : <Clipboard size={18} />}
                <span>{editingKanban ? 'Editar Projeto / Card Kanban' : 'Novo Projeto / Card Kanban'}</span>
              </div>
              <button
                className="postit-btn-icon"
                onClick={() => setIsKanbanModalOpen(false)}
              >
                <Close size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveKanbanCard}>
              <div className="tasks-modal-body">
                <div className="tasks-form-group">
                  <label>Título do Projeto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Landing Page de Lançamento"
                    value={kanbanForm.title}
                    onChange={e => setKanbanForm({ ...kanbanForm, title: e.target.value })}
                  />
                </div>

                <div className="tasks-form-group">
                  <label>Descrição</label>
                  <textarea
                    rows={3}
                    placeholder="Detalhes, objetivos e escopo do projeto..."
                    value={kanbanForm.description}
                    onChange={e =>
                      setKanbanForm({ ...kanbanForm, description: e.target.value })
                    }
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="tasks-form-group">
                    <label>Coluna / Status</label>
                    <select
                      value={kanbanForm.status}
                      onChange={e => setKanbanForm({ ...kanbanForm, status: e.target.value })}
                    >
                      <option value="todo">A Fazer</option>
                      <option value="in_progress">Em Progresso</option>
                      <option value="review">Em Revisão</option>
                      <option value="done">Concluído</option>
                    </select>
                  </div>

                  <div className="tasks-form-group">
                    <label>Prioridade</label>
                    <select
                      value={kanbanForm.priority}
                      onChange={e =>
                        setKanbanForm({ ...kanbanForm, priority: e.target.value })
                      }
                    >
                      <option value="low">Baixa</option>
                      <option value="medium">Média</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="tasks-form-group">
                    <label>Tag / Área</label>
                    <input
                      type="text"
                      placeholder="Ex: Dev, Marketing, Infra"
                      value={kanbanForm.tag}
                      onChange={e => setKanbanForm({ ...kanbanForm, tag: e.target.value })}
                    />
                  </div>

                  <div className="tasks-form-group">
                    <label>Prazo Estimado</label>
                    <input
                      type="text"
                      placeholder="Ex: 25 Out, Amanhã, 18:00"
                      value={kanbanForm.due_date}
                      onChange={e =>
                        setKanbanForm({ ...kanbanForm, due_date: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="tasks-form-group">
                    <label>Responsável</label>
                    <input
                      type="text"
                      placeholder="Ex: Lucas Vendas, Sarah..."
                      value={kanbanForm.assignee_name}
                      onChange={e => {
                        const name = e.target.value;
                        const avatar = name
                          .split(' ')
                          .filter(Boolean)
                          .map(w => w[0].toUpperCase())
                          .slice(0, 2)
                          .join('') || 'EQ';
                        setKanbanForm({
                          ...kanbanForm,
                          assignee_name: name,
                          assignee_avatar: avatar
                        });
                      }}
                    />
                  </div>

                  <div className="tasks-form-group">
                    <label>Iniciais Avatar</label>
                    <input
                      type="text"
                      maxLength={3}
                      placeholder="Ex: LV"
                      value={kanbanForm.assignee_avatar}
                      onChange={e =>
                        setKanbanForm({
                          ...kanbanForm,
                          assignee_avatar: e.target.value.toUpperCase()
                        })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="tasks-form-group">
                    <label>Subtarefas Concluídas</label>
                    <input
                      type="number"
                      min={0}
                      value={kanbanForm.checklist_done}
                      onChange={e =>
                        setKanbanForm({
                          ...kanbanForm,
                          checklist_done: parseInt(e.target.value) || 0
                        })
                      }
                    />
                  </div>

                  <div className="tasks-form-group">
                    <label>Total de Subtarefas</label>
                    <input
                      type="number"
                      min={0}
                      value={kanbanForm.checklist_total}
                      onChange={e =>
                        setKanbanForm({
                          ...kanbanForm,
                          checklist_total: parseInt(e.target.value) || 0
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="tasks-modal-footer">
                {editingKanban && (
                  <button
                    type="button"
                    className="tasks-btn-danger"
                    onClick={() => handleDeleteKanbanCard(editingKanban.id)}
                  >
                    <Trash size={14} />
                    <span>Excluir</span>
                  </button>
                )}
                <button
                  type="button"
                  className="tasks-btn-cancel"
                  onClick={() => setIsKanbanModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="tasks-btn-submit">
                  {editingKanban ? 'Salvar Alterações' : 'Criar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
