import React, { useState, useEffect } from 'react';
import './Automations.css';
import {
  Play,
  Plus,
  Trash,
  ArrowDown,
  Message,
  Zap,
  Clock,
  Close,
  Save,
  File
} from 'pixelarticons/react';

import { getWorkspaceId } from '../../utils/workspace';

export default function Automations() {
  const workspaceId = getWorkspaceId();
  const [automations, setAutomations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [availableAgents, setAvailableAgents] = useState([]);

  const fetchAutomations = async () => {
    try {
      const res = await fetch(`/api/automations?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const formatted = data.map(item => {
          let parsedNodes = [{ id: 1, type: 'trigger', title: 'Início', description: 'Quando receber uma nova mensagem' }];
          if (item.nodes_json) {
            try { parsedNodes = JSON.parse(item.nodes_json); } catch (e) {}
          }
          return {
            ...item,
            nodes: parsedNodes
          };
        });
        setAutomations(formatted);
        if (!activeId && formatted.length > 0) {
          setActiveId(formatted[0].id);
        }
      } else {
        const saved = localStorage.getItem(`unne_automations_list_ws_${workspaceId}`) || localStorage.getItem('unne_automations_list');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setAutomations(parsed);
            if (!activeId && parsed.length > 0) setActiveId(parsed[0].id);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('Error fetching automations:', e);
    }
  };

  useEffect(() => {
    fetchAutomations();
    fetch(`/api/agents?workspace_id=${workspaceId}`)
      .then(res => res.json())
      .then(data => setAvailableAgents(data))
      .catch(err => console.error(err));
  }, [workspaceId]);

  const activeAutomation = automations.find(a => a.id === activeId);
  const nodes = activeAutomation ? activeAutomation.nodes : [];

  const handleSave = async () => {
    if (!activeAutomation) return;
    try {
      await fetch(`/api/automations/${activeAutomation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: activeAutomation.name,
          mode: activeAutomation.mode,
          porteiro_prompt: activeAutomation.porteiro_prompt || '',
          agents_json: JSON.stringify(activeAutomation.agents || []),
          nodes_json: JSON.stringify(activeAutomation.nodes || [])
        })
      });
      localStorage.setItem(`unne_automations_list_ws_${workspaceId}`, JSON.stringify(automations));
      alert('Automação salva com sucesso no banco de dados!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar no banco de dados.');
    }
  };

  const setNodes = (newNodes) => {
    setAutomations(automations.map(a => a.id === activeId ? { ...a, nodes: newNodes } : a));
  };

  const createAutomation = async () => {
    const defaultNodes = [{ id: 1, type: 'trigger', title: 'Início', description: 'Quando receber uma nova mensagem' }];
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: 'Nova Automação',
          mode: 'script',
          porteiro_prompt: '',
          agents_json: '[]',
          nodes_json: JSON.stringify(defaultNodes)
        })
      });
      const data = await res.json();
      const newId = data.id;
      const newAutomation = {
        id: newId,
        name: 'Nova Automação',
        mode: 'script',
        nodes: defaultNodes
      };
      setAutomations([...automations, newAutomation]);
      setActiveId(newId);
    } catch (e) {
      console.error(e);
      const newId = Date.now();
      const newAutomation = {
        id: newId,
        name: 'Nova Automação',
        mode: 'script',
        nodes: defaultNodes
      };
      setAutomations([...automations, newAutomation]);
      setActiveId(newId);
    }
  };

  const deleteAutomation = async (e, id) => {
    e.stopPropagation();
    if(window.confirm("Deseja apagar esta automação do banco de dados?")) {
      try {
        await fetch(`/api/automations/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error(err);
      }
      const newAutos = automations.filter(a => a.id !== id);
      setAutomations(newAutos);
      localStorage.setItem('unne_automations_list', JSON.stringify(newAutos));
      if(activeId === id) setActiveId(newAutos[0]?.id || null);
    }
  };

  const handleNameChange = (e) => {
    setAutomations(automations.map(a => a.id === activeId ? { ...a, name: e.target.value } : a));
  };

  const handleModeChange = (mode) => {
    setAutomations(automations.map(a => a.id === activeId ? { ...a, mode } : a));
  };


  const addNode = (type) => {
    const newId = nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
    let title = '';
    let description = '';
    
    if (type === 'condition') {
      title = 'Se / Ou (Condição)';
      description = 'Se a mensagem contiver a palavra "preço"';
    } else if (type === 'action') {
      title = 'Ação (Resposta)';
      description = 'Enviar mensagem de texto';
    } else if (type === 'end') {
      title = 'Fim';
      description = 'Encerrar o fluxo';
    }

    setNodes([...nodes, { id: newId, type, title, description }]);
  };

  const removeNode = (id) => {
    // Não permite remover o nó inicial
    if (nodes.find(n => n.id === id)?.type === 'trigger') return;
    setNodes(nodes.filter(n => n.id !== id));
  };

  return (
    <div className="automations-container" style={{ display: 'flex', height: '100%' }}>
      
      {/* Sidebar de Automações */}
      <div className="automations-sidebar" style={{ width: '280px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface)' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Automações</h2>
          <button className="btn-primary-small" onClick={createAutomation} style={{ padding: '6px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer' }}>
            <Plus size={16} /> Nova
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {automations.map(a => (
            <div 
              key={a.id} 
              onClick={() => setActiveId(a.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', cursor: 'pointer',
                backgroundColor: a.id === activeId ? 'var(--primary-light)' : 'transparent',
                color: a.id === activeId ? 'var(--primary)' : 'var(--text-secondary)',
                fontWeight: a.id === activeId ? 500 : 'normal'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <File size={16} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name || 'Sem título'}</span>
              </div>
              <button 
                onClick={(e) => deleteAutomation(e, a.id)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
              >
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Editor Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className="automations-header" style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface)' }}>
          <div>
            {activeAutomation ? (
              <input 
                type="text" 
                value={activeAutomation.name} 
                onChange={handleNameChange}
                style={{ fontSize: '1.5rem', fontWeight: 700, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-main)', marginBottom: '4px' }}
                placeholder="Nome da automação"
              />
            ) : (
              <h1>Automação</h1>
            )}
            <p>Gerencie o fluxo de respostas e a inteligência da automação.</p>
          </div>
          <button className="btn-primary" onClick={handleSave} disabled={!activeAutomation}><Save size={18}/> Salvar Automação</button>
        </header>

        {activeAutomation ? (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

          <div style={{ flex: 1, padding: '40px', overflow: 'auto', backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {/* INÍCIO DO FLUXOGRAMA */}
            <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              
              {/* Nó: Agente Porteiro */}
              <div style={{ width: '100%', backgroundColor: 'white', padding: '32px', borderRadius: '16px', border: '2px solid var(--primary)', position: 'relative', zIndex: 2 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--primary)', fontSize: '1.25rem', justifyContent: 'center', fontWeight: 'bold' }}>
                  <Zap size={24} fill="currentColor" /> Porteiro (Roteador IA)
                </h3>
                <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '24px', textAlign: 'center' }}>
                  Lê a mensagem inicial e roteia para o especialista.
                </p>
                
                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', display: 'block', color: '#374151' }}>Instruções do Porteiro</label>
                  <textarea 
                    className="modern-input" 
                    style={{ minHeight: '80px', width: '100%', padding: '16px', borderRadius: '12px', border: '1px solid #F3F4F6', backgroundColor: '#F9FAFB', resize: 'vertical', fontSize: '0.95rem', color: '#4B5563' }} 
                    placeholder="Ex: Identifique a intenção e repasse..."
                    value={activeAutomation.porteiroPrompt || 'Você é o recepcionista. Identifique a intenção do usuário e repasse para o agente correto.'}
                    onChange={(e) => setAutomations(automations.map(a => a.id === activeId ? { ...a, porteiroPrompt: e.target.value } : a))}
                  ></textarea>
                </div>
              </div>

              {/* Linha vertical descendo do Porteiro com botão + */}
              <div style={{ width: '2px', height: '60px', backgroundColor: 'var(--primary)', position: 'relative', zIndex: 1 }}>
                {(activeAutomation.agents || []).length < 10 && (
                  <button 
                    onClick={() => {
                       const newAgents = [...(activeAutomation.agents || []), { id: Date.now(), name: 'Novo Especialista', prompt: '' }];
                       setAutomations(automations.map(a => a.id === activeId ? { ...a, agents: newAgents } : a));
                    }} 
                    style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}
                    title="Adicionar Especialista"
                  >
                    <Plus size={20} />
                  </button>
                )}
              </div>
              
              {/* Container dos Nós Especialistas */}
              <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'nowrap', justifyContent: 'center', width: '100%', position: 'relative', paddingTop: '20px', overflowX: 'auto', paddingBottom: '24px' }}>
                
                {/* Linha horizontal conectando */}
                {(activeAutomation.agents || []).length > 1 && (
                  <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '2px', backgroundColor: 'var(--primary)', zIndex: 1 }} />
                )}

                {(activeAutomation.agents || []).map((agent, index) => (
                  <div key={agent.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '300px', flex: 1 }}>
                    
                    {/* Conector individual vertical */}
                    <div style={{ width: '2px', height: '20px', backgroundColor: 'var(--primary)', position: 'relative', marginTop: '-20px', zIndex: 1 }}></div>
                    
                    {/* Nó: Especialista */}
                    <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #E5E7EB', position: 'relative', width: '100%', zIndex: 2 }}>
                      
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ backgroundColor: '#FEF3C7', color: '#D97706', width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                            {index + 1}
                          </span>
                          <h4 style={{ margin: 0, color: '#111827', fontSize: '1.05rem', fontWeight: 600 }}>{agent.name || 'Especialista'}</h4>
                        </div>
                        <button 
                          onClick={() => {
                            const newAgents = (activeAutomation.agents || []).filter(a => a.id !== agent.id);
                            setAutomations(automations.map(a => a.id === activeId ? { ...a, agents: newAgents } : a));
                          }}
                          style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                          title="Remover agente"
                        >
                          <Trash size={18} />
                        </button>
                      </div>

                      <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label style={{ fontWeight: 500, fontSize: '0.85rem', marginBottom: '6px', display: 'block', color: '#4B5563' }}>Agente de IA Conectado</label>
                        <select 
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #F3F4F6', backgroundColor: '#F9FAFB', fontSize: '0.9rem', color: '#111827' }} 
                          value={agent.agentId || ''}
                          onChange={(e) => {
                             const newAgents = [...activeAutomation.agents];
                             newAgents[index].agentId = e.target.value;
                             const selected = availableAgents.find(a => String(a.id) === e.target.value);
                             if (selected) {
                               newAgents[index].name = selected.name;
                             } else {
                               newAgents[index].name = 'Especialista';
                             }
                             setAutomations(automations.map(a => a.id === activeId ? { ...a, agents: newAgents } : a));
                          }}
                        >
                          <option value="">-- Selecione um Agente da Página de IA --</option>
                          {availableAgents.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Footer do Card */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F3F4F6', paddingTop: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#10B981', fontWeight: 500 }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }}></div>
                          Conectado
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>ID: esp_{String(index + 1).padStart(2, '0')}</span>
                      </div>

                    </div>
                  </div>
                ))}
              </div>

              {/* Botão Inferior: Adicionar Especialista */}
              {(activeAutomation.agents || []).length < 10 && (
                <button 
                  onClick={() => {
                    const newAgents = [...(activeAutomation.agents || []), { id: Date.now(), name: 'Novo Especialista', prompt: '' }];
                    setAutomations(automations.map(a => a.id === activeId ? { ...a, agents: newAgents } : a));
                  }}
                  style={{ width: '100%', maxWidth: '900px', padding: '16px', marginTop: '8px', backgroundColor: 'transparent', border: '2px dashed #E5E7EB', borderRadius: '16px', color: '#6B7280', fontSize: '0.95rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#6B7280'; }}
                >
                  <Plus size={18} /> + Adicionar Especialista (Máx 10)
                </button>
              )}

            </div>
          </div>

          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <p>Selecione uma automação ao lado ou crie uma nova.</p>
          </div>
        )}
      </div>
    </div>
  );
}
