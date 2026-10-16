import React, { useState, useEffect, useRef } from 'react';
import './Templates.css';
import { Plus, Trash, Save, Pencil, File } from 'pixelarticons/react';

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const textareaRef = useRef(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/templates?workspace_id=1');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTemplates(data);
        if (!activeId) setActiveId(data[0].id);
      } else {
        // Fallback to local storage or defaults
        const saved = localStorage.getItem('unne_templates');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setTemplates(parsed);
            if (!activeId && parsed.length > 0) setActiveId(parsed[0].id);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('Error fetching templates:', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (templates.length > 0) {
      localStorage.setItem('unne_templates', JSON.stringify(templates));
    }
  }, [templates]);

  const activeTemplate = templates.find(t => t.id === activeId);

  const handleCreate = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: 1, title: 'Novo Template', content: '' })
      });
      const data = await res.json();
      const newId = data.id || Date.now();
      const newTemplate = { id: newId, title: 'Novo Template', content: '' };
      setTemplates([newTemplate, ...templates]);
      setActiveId(newId);
    } catch (e) {
      console.error(e);
      const newId = Date.now().toString();
      const newTemplate = { id: newId, title: 'Novo Template', content: '' };
      setTemplates([...templates, newTemplate]);
      setActiveId(newId);
    }
  };

  const handleUpdate = async (field, value) => {
    const updated = templates.map(t => t.id === activeId ? { ...t, [field]: value } : t);
    setTemplates(updated);
    const curr = updated.find(t => t.id === activeId);
    if (curr) {
      try {
        await fetch(`http://localhost:3001/api/templates/${activeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: curr.title, content: curr.content })
        });
      } catch (e) {
        console.error('Error auto-saving template to DB:', e);
      }
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (window.confirm('Tem certeza que deseja apagar este template do banco de dados?')) {
      try {
        await fetch(`http://localhost:3001/api/templates/${id}`, {
          method: 'DELETE'
        });
      } catch (err) {
        console.error('Error deleting template:', err);
      }
      const newTemplates = templates.filter(t => t.id !== id);
      setTemplates(newTemplates);
      if (activeId === id) {
        setActiveId(newTemplates[0]?.id || null);
      }
    }
  };

  const insertTag = (tag) => {
    if (!activeTemplate || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = activeTemplate.content;
    const newContent = currentContent.substring(0, start) + tag + currentContent.substring(end);
    
    handleUpdate('content', newContent);
    
    // Reset focus and cursor position after React re-renders
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const availableTags = [
    '{primeiro_nome}',
    '{nome}',
    '{saudacao}',
    '{profissao}',
    '{regiao}',
    '{email}'
  ];

  return (
    <div className="templates-container">
      <div className="templates-sidebar">
        <div className="templates-sidebar-header">
          <h2>Meus Templates</h2>
          <button className="btn-primary-small" onClick={handleCreate}>
            <Plus size={16} /> Novo
          </button>
        </div>
        <div className="templates-list">
          {templates.length === 0 ? (
            <p className="no-templates">Nenhum template criado.</p>
          ) : (
            templates.map(t => (
              <div 
                key={t.id} 
                className={`template-item ${t.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(t.id)}
              >
                <div className="template-item-info">
                  <File size={16} />
                  <span>{t.title || 'Sem título'}</span>
                </div>
                <button className="btn-delete" onClick={(e) => handleDelete(e, t.id)} title="Apagar">
                  <Trash size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="templates-editor">
        {activeTemplate ? (
          <>
            <div className="editor-header">
              <input 
                type="text" 
                className="editor-title-input" 
                value={activeTemplate.title} 
                onChange={(e) => handleUpdate('title', e.target.value)}
                placeholder="Título do template..."
              />
            </div>
            <div className="editor-body">
              <textarea 
                ref={textareaRef}
                className="editor-textarea"
                value={activeTemplate.content}
                onChange={(e) => handleUpdate('content', e.target.value)}
                placeholder="Escreva sua mensagem em Markdown aqui..."
              ></textarea>
            </div>
            <div className="editor-footer">
              <div className="tags-container">
                {availableTags.map(tag => (
                  <button key={tag} className="tag-button" onClick={() => insertTag(tag)}>
                    + {tag}
                  </button>
                ))}
                <button className="tag-button tag-spintax" onClick={() => insertTag('{Opção 1|Opção 2}')}>
                  + Inserir Spintax
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="editor-empty">
            <Pencil size={48} color="#e4e4e7" />
            <p>Selecione um template ou crie um novo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
