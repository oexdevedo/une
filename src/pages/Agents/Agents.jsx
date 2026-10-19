import React, { useState, useRef, useEffect } from 'react';
import './Agents.css';
import {
  Robot,
  Plus,
  Search,
  Sliders,
  Upload,
  Close,
  Message,
  Shield,
  Database,
  Trash,
  MagicEdit,
  Calendar,
  Zap,
  Check
} from 'pixelarticons/react';

import { getWorkspaceId } from '../../utils/workspace';

export default function Agents() {
  const workspaceId = getWorkspaceId();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [editingAgent, setEditingAgent] = useState(null);
  const fileInputRef = useRef(null);

  // Form State
  const [agentForm, setAgentForm] = useState({
    name: '',
    icon: '/avatar/1.png',
    role: 'Atendimento e Agendamento',
    prompt: '',
    hasCalendar: true,
    calendarLink: 'https://cal.com/atendimento',
    goal: 'Atender clientes com excelência e realizar agendamentos de reuniões.',
    style: 'Educado, acolhedor, conciso e ágil',
    prohibited: 'Não falar sobre concorrentes, política ou prometer prazos não documentados.',
    knowledge: '',
    flow: '1. Cumprimentar pelo nome.\n2. Compreender a dúvida ou interesse.\n3. Oferecer horários de agendamento se solicitado.\n4. Confirmar os dados do cliente.'
  });

  const [workspaceCalLink, setWorkspaceCalLink] = useState(() => localStorage.getItem(`unne_cal_embed_url_ws_${workspaceId}`) || '');
  const [remindersInfo, setRemindersInfo] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerStatus, setTriggerStatus] = useState(null);
  const [showRemindersModal, setShowRemindersModal] = useState(false);

  const fetchAgents = async () => {
    try {
      const res = await fetch(`/api/agents?workspace_id=${workspaceId}`);
      const data = await res.json();
      setAgents(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCalendarSettings = async () => {
    try {
      const res = await fetch(`/api/calendar/settings?workspace_id=${workspaceId}`);
      const data = await res.json();
      if (data && data.cal_link) {
        setWorkspaceCalLink(data.cal_link);
      } else {
        setWorkspaceCalLink('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReminders = async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/reminders`);
      const data = await res.json();
      setRemindersInfo(data);
    } catch (e) {
      console.error(e);
    }
  };

  const [editingPhoneBookingId, setEditingPhoneBookingId] = useState(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  const handleSavePhone = async (bookingId, attendeeName) => {
    if (!phoneInput.trim()) {
      alert('Por favor, informe um número de telefone válido.');
      return;
    }
    setSavingPhone(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/reminders/booking-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, attendeeName, phone: phoneInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setEditingPhoneBookingId(null);
        fetchReminders();
      } else {
        alert(data.error || 'Erro ao salvar telefone');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar telefone');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleTriggerReminders = async () => {
    setIsTriggering(true);
    setTriggerStatus(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/reminders/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      setTriggerStatus(`Varredura concluída! ${data.checked} agendamentos verificados na agenda. ${data.sent} mensagens de confirmação 24h enviadas.`);
      fetchReminders();
    } catch (err) {
      console.error(err);
      setTriggerStatus('Erro ao executar verificação da agenda.');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleSendSingleReminder = async (booking) => {
    if (!booking.attendeePhone) {
      setEditingPhoneBookingId(booking.id);
      setPhoneInput('');
      alert(`Por favor, insira o número de WhatsApp de ${booking.attendeeName} no campo indicado para confirmar agora.`);
      return;
    }
    if (!window.confirm(`Deseja enviar a mensagem de confirmação 24h agora para ${booking.attendeeName} (${booking.attendeePhone})?`)) {
      return;
    }
    setIsTriggering(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/reminders/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceSendBookingId: booking.id })
      });
      const data = await res.json();
      if (data.sent > 0) {
        alert(`✅ Mensagem de confirmação enviada com sucesso para ${booking.attendeeName}! O chat foi atribuído à Mariana Confirmação.`);
      } else {
        alert('⚠️ Não foi possível enviar a mensagem. Verifique a conexão com o WhatsApp.');
      }
      fetchReminders();
    } catch (err) {
      console.error(err);
      alert('Erro ao disparar mensagem de confirmação.');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleMarkConfirmed = async (booking) => {
    try {
      const startDate = new Date(booking.start);
      const dateFormatted = startDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const timeFormatted = startDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      const res = await fetch(`/api/workspaces/${workspaceId}/reminders/mark-confirmed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          clientName: booking.attendeeName,
          clientPhone: booking.attendeePhone,
          title: booking.title,
          date: dateFormatted,
          time: timeFormatted
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchReminders();
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao marcar agendamento como confirmado.');
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchCalendarSettings();
    fetchReminders();
  }, [workspaceId]);

  const generateCalendarStandard = (link) => {
    return `[Padrão de Calendário e Agendamento]:
- Você consulta a disponibilidade oficial da agenda em tempo real.
- Quando o cliente demonstrar interesse em agendar, falar sobre disponibilidade ou perguntar que dias/horários você tem:
  1. Apresente os cinco horários disponíveis SEMPRE em forma de lista numerada no seguinte padrão exato:
     1 - Sáb 17/10 às 11h
     2 - Sáb 24/10 às 08h
     3 - Sáb 24/10 às 09h
     4 - Sáb 24/10 às 10h
     5 - Sáb 24/10 às 11h
  2. Pergunte: "Algum desses horários fica bom para você?".
  3. DADOS OBRIGATÓRIOS ANTES DE CONFIRMAR: Você DEVE OBRIGATORIAMENTE pedir o Nome completo e o Motivo do agendamento (dúvida ou assunto da mentoria) antes de oficializar a vaga.
  4. RESERVA NO CAL.COM: Assim que tiver Horário, Nome e Motivo, confirme o agendamento e inclua no final da mensagem a tag de sistema:
     [RESERVAR_CALENDARIO: {"horario": "<horário escolhido>", "nome": "<nome do cliente>", "motivo": "<motivo do agendamento>"}]
  5. REGRA ESTRITA: NUNCA envie ou mostre links externos nem o link do cal.com. Jamais envie links. O agendamento é feito diretamente aqui com você.
  6. Caso o cliente diga que não tem disponibilidade nesses horários ou pergunte por outro dia, pergunte qual dia seria melhor e informe que você verificará a disponibilidade para aquele dia e para os três dias seguintes!`;
  };

  const compilePrompt = (form = agentForm) => {
    let sections = [];
    sections.push(`Você é o funcionário virtual ${form.name || 'Assistente'}.`);
    if (form.role) sections.push(`Função Principal:\n${form.role}`);
    if (form.goal) sections.push(`Objetivo da Interação:\n${form.goal}`);
    if (form.style) sections.push(`Personalidade e Tom de Voz:\n${form.style}`);
    if (form.prohibited) sections.push(`Restrições e Assuntos Proibidos:\n${form.prohibited}`);
    if (form.knowledge) sections.push(`Base de Conhecimento e Políticas:\n${form.knowledge}`);
    if (form.hasCalendar) {
      sections.push(generateCalendarStandard(form.calendarLink));
    }
    if (form.flow) sections.push(`Fluxo de Atendimento:\n${form.flow}`);
    
    return sections.join('\n\n');
  };

  const applyPresetLucas = () => {
    const lucasForm = {
      name: 'Lucas Vendas',
      icon: '/avatar/1.png',
      role: 'Consultor Comercial e Agendamentos',
      hasCalendar: true,
      calendarLink: workspaceCalLink || 'https://cal.com/atendimento',
      goal: 'Atender clientes, qualificar interesse e agendar reuniões/mentorias.',
      style: 'Acolhedor, prestativo, educado e ágil',
      prohibited: 'Não enviar links externos nem link do cal.com.',
      knowledge: '',
      flow: '1. Apresentar os 5 horários disponíveis em lista numerada.\n2. Pedir Nome completo e Motivo do agendamento.\n3. Confirmar a vaga com a tag [RESERVAR_CALENDARIO].'
    };
    lucasForm.prompt = compilePrompt(lucasForm);
    setAgentForm(lucasForm);
  };

  const applyPresetMariana = () => {
    const marianaForm = {
      name: 'Mariana Confirmação',
      icon: '/avatar/2.png',
      role: 'Confirmação de Agendamentos e Lembretes (24h)',
      hasCalendar: true,
      calendarLink: workspaceCalLink || 'https://cal.com/atendimento',
      goal: 'Confirmar presença do cliente 24h antes do encontro ou reagendar caso não possa comparecer.',
      style: 'Empática, educada, prestativa e calorosa',
      prohibited: 'Nunca enviar links externos ou links do cal.com.',
      knowledge: '',
      flow: '1. Confirmar a presença calorosamente se o cliente confirmar.\n2. Se o cliente não puder comparecer, demonstrar empatia e oferecer 5 novos horários da agenda em lista numerada.\n3. Se o cliente quiser cancelar, confirmar cancelamento cordialmente.'
    };
    marianaForm.prompt = `Você é a Mariana, funcionária virtual especialista em confirmação de agendamentos e lembretes de reuniões e mentorias.

[MISSÃO E OBJETIVO PRINCIPAL]:
Seu papel é confirmar a presença do cliente agendado com 24h de antecedência, acolhê-lo com simpatia, tirar dúvidas rápidas sobre o encontro ou ajudá-lo a remarcar caso não possa comparecer.

[FLUXO E REGRAS DE ATENDIMENTO]:
1. CONFIRMAÇÃO DE PRESENÇA:
   - Quando o cliente confirmar a presença (ex: "Sim", "Confirmo", "Vou sim", "Estarei lá", "Com certeza", "Combinado", "Ok", "Perfeito"):
     Responda com entusiasmo, cordialidade e acolhimento!
     Exemplo: "Excelente, [Nome]! Sua presença está confirmada com sucesso para nosso encontro. Qualquer dúvida até lá, estamos por aqui. Tenha um ótimo dia!"

2. IMPOSSIBILIDADE DE COMPARECER OU PEDIDO DE REMARCAÇÃO:
   - Quando o cliente disser que não poderá comparecer, que teve um imprevisto ou pedir para remarcar:
     Demonstre empatia e compreensão imediata.
     Apresente os cinco horários disponíveis informados pelo sistema na lista numerada no seguinte padrão exato:
     1 - Sáb 24/10 às 08h
     2 - Sáb 24/10 às 09h
     3 - Sáb 24/10 às 10h
     4 - Sáb 24/10 às 11h
     5 - Sáb 24/10 às 12h
     Pergunte: "Qual desses horários fica melhor para você?"
   - Assim que o cliente escolher o novo horário, confirme a remarcação e inclua no final a tag de sistema:
     [RESERVAR_CALENDARIO: {"horario": "<novo horário escolhido>", "nome": "<nome do cliente>", "motivo": "Remarcação de mentoria"}]

3. CANCELAMENTO DEFINITIVO:
   - Se o cliente solicitar cancelar, confirme com gentileza e deixe as portas abertas.

4. REGRA ESTRITA DE LINKS:
   - NUNCA envie ou mostre links externos nem o link do cal.com. Jamais envie links.

5. TOM DE VOZ E ESTILO:
   - Empática, educada, prestativa e calorosa.
   - Responda como uma pessoa real no WhatsApp (máximo 2 a 3 frases curtas por balão).`;
    setAgentForm(marianaForm);
  };

  const handleOpenNewAgent = () => {
    setEditingAgent(null);
    const initialForm = {
      name: '',
      icon: '/avatar/1.png',
      role: 'Atendimento Comercial e Agendamento',
      prompt: '',
      hasCalendar: true,
      calendarLink: workspaceCalLink || 'https://cal.com/atendimento',
      goal: 'Tirar dúvidas e orientar os clientes de forma acolhedora, agendando reuniões quando solicitado.',
      style: 'Educado, acolhedor, direto ao ponto e paciente',
      prohibited: 'Não falar sobre política, religião ou assuntos concorrentes.',
      knowledge: '',
      flow: '1. Cumprimentar pelo nome.\n2. Tirar dúvidas com clareza.\n3. Oferecer agendamento no calendário se houver interesse.\n4. Finalizar cordialmente.'
    };
    initialForm.prompt = compilePrompt(initialForm);
    setAgentForm(initialForm);
    setIsModalOpen(true);
  };

  const handleEditAgent = (agent) => {
    setEditingAgent(agent);
    const existingPrompt = agent.prompt || '';
    const hasCal = existingPrompt.includes('[Padrão de Calendário') || existingPrompt.includes('cal.com') || existingPrompt.includes('calendário') || existingPrompt.includes('agendamento');
    const linkMatch = existingPrompt.match(/Link de Agendamento:\s*(\S+)/i);
    const link = linkMatch ? linkMatch[1] : (workspaceCalLink || 'https://cal.com/atendimento');

    setAgentForm({
      name: agent.name || '',
      icon: agent.icon || '/avatar/1.png',
      role: agent.role || 'Atendimento e Suporte',
      prompt: existingPrompt,
      hasCalendar: hasCal,
      calendarLink: link,
      goal: '',
      style: '',
      prohibited: '',
      knowledge: '',
      flow: ''
    });
    setIsModalOpen(true);
  };

  const handleSaveAgent = async (e) => {
    if (e) e.preventDefault();
    const name = agentForm.name.trim() || 'Novo Agente';
    const icon = agentForm.icon || '/avatar/1.png';
    const role = agentForm.role || 'Assistente Virtual';
    let prompt = agentForm.prompt.trim();
    
    if (!prompt) {
      prompt = compilePrompt();
    }

    try {
      if (editingAgent) {
        await fetch(`/api/agents/${editingAgent.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, icon, role, prompt })
        });
      } else {
        await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, icon, role, prompt, workspace_id: workspaceId })
        });
      }

      if (agentForm.hasCalendar && agentForm.calendarLink) {
        fetch('/api/calendar/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace_id: workspaceId, cal_link: agentForm.calendarLink })
        }).catch(console.error);
      }

      setIsModalOpen(false);
      setEditingAgent(null);
      fetchAgents();
    } catch (err) {
      console.error('Erro ao salvar agente:', err);
      alert('Erro ao salvar agente no banco de dados.');
    }
  };

  const handleDeleteAgent = async (id) => {
    if (!window.confirm('Tem certeza que deseja deletar este funcionário?')) return;
    try {
      await fetch(`/api/agents/${id}`, {
        method: 'DELETE'
      });
      fetchAgents();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setAgentForm(prev => {
        const updated = {
          ...prev,
          name: prev.name || file.name.replace('.md', ''),
          knowledge: text
        };
        updated.prompt = compilePrompt(updated);
        return updated;
      });
      alert("Arquivo .MD carregado! O conhecimento e o prompt foram atualizados.");
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const injectCalendarPrompt = () => {
    const calStandard = generateCalendarStandard(agentForm.calendarLink);
    if (!agentForm.prompt.includes('[Padrão de Calendário')) {
      setAgentForm(prev => ({
        ...prev,
        prompt: prev.prompt ? `${prev.prompt.trim()}\n\n${calStandard}` : calStandard
      }));
    }
  };

  return (
    <div className="agents-container">
      <header className="agents-header">
        <div>
          <h1>Funcionários de IA</h1>
          <p>Crie e gerencie sua equipe de funcionários virtuais com prompts armazenados no banco de dados.</p>
        </div>
        <button className="btn-primary" onClick={handleOpenNewAgent}>
          <Plus size={18} /> Novo Agente
        </button>
      </header>

      {/* Banner de Confirmação Automática de Agenda 24h */}
      <div style={{
        backgroundColor: '#FAF5FF',
        border: '1.5px solid #D8B4FE',
        borderRadius: '16px',
        padding: '18px 24px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: '#7C3AED',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem'
          }}>
            📅
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#581C87', fontWeight: 700 }}>
                Confirmação Automática de Agenda (24h antes)
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#059669', backgroundColor: '#ECFDF5', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                ● Serviço Ativo (Ciclo de 15min)
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6B21A8' }}>
              O sistema inspeciona a agenda em tempo real no Cal.com e dispara confirmação 24h antes. Se o cliente confirmar, a vaga é mantida; se precisar remarcar, novos horários são oferecidos.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {triggerStatus && (
            <span style={{ fontSize: '0.8rem', color: '#6B21A8', backgroundColor: '#F3E8FF', padding: '6px 12px', borderRadius: '8px', fontWeight: 600 }}>
              {triggerStatus}
            </span>
          )}
          <button
            onClick={handleTriggerReminders}
            disabled={isTriggering}
            style={{
              backgroundColor: '#10B981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)'
            }}
            title="Dispara confirmação 24h para os agendamentos de amanhã"
          >
            <Check size={16} /> {isTriggering ? 'Confirmando...' : 'Confirmar Agora'}
          </button>
          <button
            onClick={() => setShowRemindersModal(true)}
            style={{
              backgroundColor: '#ffffff',
              color: '#7C3AED',
              border: '1.5px solid #D8B4FE',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Calendar size={16} /> Agendamentos e Histórico ({remindersInfo?.upcoming?.length || 0})
          </button>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="agents-list-empty">
          <div className="empty-icon">
            <Robot size={48} />
          </div>
          <h2>Nenhum funcionário ativo</h2>
          <p>Você ainda não configurou nenhum agente de IA para responder seus clientes. Clique em "Novo Agente" para começar.</p>
          <button className="btn-secondary" onClick={handleOpenNewAgent}>
            <MagicEdit size={18} /> Criar meu primeiro agente
          </button>
        </div>
      ) : (
        <div className="agents-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', padding: '20px 0' }}>
          {agents.map(agent => (
            <div key={agent.id} className="agent-card" style={{ 
              backgroundColor: '#ffffff', 
              padding: '24px', 
              borderRadius: '16px', 
              border: (agent.name.includes('Confirmação') || (agent.role && agent.role.includes('Confirmação'))) ? '2px solid #a855f7' : '2px solid #eab308',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              gap: '14px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {agent.icon && agent.icon.startsWith('/') ? (
                  <img src={agent.icon} alt="Avatar" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #f8fafc', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }} />
                ) : (
                  <span style={{ fontSize: '3rem' }}>{agent.icon || '🤖'}</span>
                )}
              </div>
              <div style={{ flex: 1, width: '100%' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', color: '#1e293b', fontWeight: '700' }}>{agent.name}</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748B', display: 'block', marginBottom: '8px' }}>
                  {agent.role || 'Atendimento Geral'}
                </span>
                
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#10B981', backgroundColor: '#ECFDF5', padding: '3px 10px', borderRadius: '12px', fontWeight: '600' }}>
                    ● Ativo
                  </span>
                  {(agent.name.includes('Confirmação') || (agent.role && agent.role.includes('Confirmação'))) && (
                    <span style={{ fontSize: '0.75rem', color: '#7C3AED', backgroundColor: '#F3E8FF', padding: '3px 10px', borderRadius: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Zap size={12} /> Confirmação 24h
                    </span>
                  )}
                  {(agent.prompt && (agent.prompt.includes('Padrão de Calendário') || agent.prompt.includes('cal.com'))) && (
                    <span style={{ fontSize: '0.75rem', color: '#0284C7', backgroundColor: '#E0F2FE', padding: '3px 10px', borderRadius: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} /> Calendário Conectado
                    </span>
                  )}
                </div>

                {/* Caixa informativa do Prompt no Banco */}
                <div style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 600, marginBottom: '4px' }}>
                    <Database size={14} />
                    <span>Prompt no Banco de Dados:</span>
                  </div>
                  <p style={{
                    margin: 0,
                    color: '#475569',
                    fontSize: '0.78rem',
                    lineHeight: '1.4',
                    maxHeight: '44px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {agent.prompt ? agent.prompt : '(Nenhum prompt configurado no banco)'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '4px', width: '100%', justifyContent: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
                <button 
                  onClick={() => handleEditAgent(agent)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}
                  title="Editar Agente e Prompt"
                >
                  <MagicEdit size={16} /> Editar
                </button>
                <button 
                  onClick={() => handleDeleteAgent(agent.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}
                  title="Excluir Agente"
                >
                  <Trash size={16} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Criação / Edição de Funcionário */}
      {isModalOpen && (
        <div className="agent-modal-overlay">
          <div className="agent-modal">
            <div className="agent-modal-header">
              <div className="header-title">
                <Robot size={24} color="var(--primary)" />
                <h2>{editingAgent ? 'Editar Funcionário de IA' : 'Novo Funcionário de IA'}</h2>
              </div>
              <button className="close-btn" onClick={() => {
                setIsModalOpen(false);
                setEditingAgent(null);
              }}>
                <Close size={24} />
              </button>
            </div>

            <div className="agent-modal-content">
              <div className="import-banner">
                <div className="import-info">
                  <h4>Preencher prompt via arquivo .MD</h4>
                  <p>Envie um arquivo Markdown para importar suas instruções diretamente no banco de dados.</p>
                </div>
                <button type="button" className="btn-secondary small" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} /> Carregar .MD
                </button>
                <input 
                  type="file" 
                  accept=".md" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />
              </div>

              {/* Modelos Prontos de Funcionários */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '20px',
                padding: '12px 16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                  Modelos Prontos:
                </span>
                <button
                  type="button"
                  onClick={applyPresetLucas}
                  style={{
                    backgroundColor: '#FEF3C7',
                    color: '#92400E',
                    border: '1px solid #FCD34D',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ⚡ Lucas Vendas (Agendamento Comercial)
                </button>
                <button
                  type="button"
                  onClick={applyPresetMariana}
                  style={{
                    backgroundColor: '#F3E8FF',
                    color: '#6B21A8',
                    border: '1px solid #D8B4FE',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  ⏰ Mariana Confirmação (Lembrete 24h)
                </button>
              </div>

              <form className="agent-form" onSubmit={handleSaveAgent}>
                {/* Seção 1: Identidade */}
                <div className="form-section">
                  <div className="section-title">
                    <span className="step-number">1</span>
                    <h3>Identidade e Função Principal</h3>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group flex-1">
                      <label>Nome do Funcionário *</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Ana Atendimento, Consultor Roberto..."
                        value={agentForm.name}
                        onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group w-32">
                      <label>Ícone / Avatar *</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <img 
                          id="avatar-preview"
                          src={agentForm.icon} 
                          alt="Avatar" 
                          style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #e2e8f0' }} 
                        />
                        <select 
                          className="modern-input" 
                          style={{ padding: '8px', flex: 1 }}
                          value={agentForm.icon}
                          onChange={(e) => setAgentForm({ ...agentForm, icon: e.target.value })}
                        >
                          {Array.from({ length: 29 }, (_, i) => (
                            <option key={i+1} value={`/avatar/${i+1}.png`}>Avatar {i+1}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Função / Cargo Principal</label>
                    <input 
                      type="text"
                      placeholder="Ex: Atendente de Vendas e Agendamentos"
                      value={agentForm.role}
                      onChange={(e) => setAgentForm({ ...agentForm, role: e.target.value })}
                    />
                  </div>
                </div>

                {/* Seção 2: Padrão de Calendário (API do Calendar) */}
                <div className="form-section" style={{ border: '2px solid #38BDF8', backgroundColor: '#F0F9FF', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={20} color="#0284C7" />
                      <h3 style={{ margin: 0, color: '#0369A1', fontSize: '1rem', fontWeight: 'bold' }}>
                        Padrão de Calendário (API do Calendar)
                      </h3>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#0369A1', fontWeight: 600, cursor: 'pointer' }}>
                      <input 
                        type="checkbox"
                        checked={agentForm.hasCalendar}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAgentForm(prev => {
                            const updated = { ...prev, hasCalendar: checked };
                            if (checked) {
                              updated.prompt = updated.prompt ? `${updated.prompt.trim()}\n\n${generateCalendarStandard(updated.calendarLink)}` : generateCalendarStandard(updated.calendarLink);
                            } else {
                              updated.prompt = updated.prompt.replace(/\[Padrão de Calendário[\s\S]*?objetiva\./g, '').trim();
                            }
                            return updated;
                          });
                        }}
                        style={{ width: '16px', height: '16px', accentColor: '#0284C7' }}
                      />
                      Habilitar Agendamento
                    </label>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#075985', marginBottom: '12px', lineHeight: '1.4' }}>
                    Integra o funcionário à infraestrutura do Cal.com / Google Calendar para ofertar horários disponíveis, capturar informações e confirmar reuniões diretamente pelo chat.
                  </p>

                  {agentForm.hasCalendar && (
                    <div className="form-group" style={{ marginBottom: '8px' }}>
                      <label style={{ color: '#0369A1', fontWeight: 600 }}>Link ou Agenda do Calendário (Cal.com / Google Calendar)</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          placeholder="Ex: https://cal.com/sua-empresa/atendimento"
                          value={agentForm.calendarLink}
                          onChange={(e) => setAgentForm({ ...agentForm, calendarLink: e.target.value })}
                          style={{ flex: 1, backgroundColor: 'white', borderColor: '#BAE6FD' }}
                        />
                        <button 
                          type="button" 
                          onClick={injectCalendarPrompt}
                          style={{ padding: '8px 12px', backgroundColor: '#0284C7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                        >
                          📅 Aplicar ao Prompt
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Seção 3: Prompt Salvo no Banco de Dados */}
                <div className="form-section" style={{ border: '2px solid #EAB308', backgroundColor: '#FEFCE8', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={20} color="#B45309" />
                      <h3 style={{ margin: 0, color: '#92400E', fontSize: '1.05rem', fontWeight: 'bold' }}>
                        Prompt do Agente (Armazenado no Banco de Dados)
                      </h3>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setAgentForm(prev => ({ ...prev, prompt: compilePrompt(prev) }))}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        borderRadius: '6px',
                        backgroundColor: '#F59E0B',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Compilar instruções e padrão de calendário"
                    >
                      <Zap size={14} /> Recompilar Prompt
                    </button>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: '#B45309', marginBottom: '10px' }}>
                    Este é o prompt exato persistido no banco SQLite que será executado pelo agente. Você pode customizar livremente qualquer detalhe.
                  </p>
                  <textarea 
                    value={agentForm.prompt}
                    onChange={(e) => setAgentForm({ ...agentForm, prompt: e.target.value })}
                    rows={8}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #FCD34D',
                      backgroundColor: '#FFFFFF',
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      color: '#1F2937',
                      fontFamily: 'monospace'
                    }}
                    placeholder="Instruções completas do sistema..."
                    required
                  />
                </div>

                {/* Seção 4: Seções Detalhadas para Alimentar o Prompt */}
                <div className="form-section">
                  <div className="section-title">
                    <span className="step-number">2</span>
                    <h3>Regras, Conhecimento e Fluxo de Atendimento</h3>
                  </div>

                  <div className="form-group">
                    <label>Objetivo Final da Interação</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Tirar dúvidas e agendar demonstração."
                      value={agentForm.goal}
                      onChange={(e) => setAgentForm({ ...agentForm, goal: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Personalidade e Tom de Voz</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Educado, acolhedor, objetivo e prestativo"
                      value={agentForm.style}
                      onChange={(e) => setAgentForm({ ...agentForm, style: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Informações do Negócio / Base de Conhecimento</label>
                    <textarea 
                      placeholder="Produtos oferecidos, tabela de preços, regras da empresa e horários de atendimento..."
                      rows={3}
                      value={agentForm.knowledge}
                      onChange={(e) => setAgentForm({ ...agentForm, knowledge: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Restrições (O que NÃO falar)</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Não falar de concorrentes, política ou prometer descontos não autorizados."
                      value={agentForm.prohibited}
                      onChange={(e) => setAgentForm({ ...agentForm, prohibited: e.target.value })}
                    />
                  </div>
                </div>

                <div className="agent-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button type="button" className="btn-secondary" onClick={() => {
                    setIsModalOpen(false);
                    setEditingAgent(null);
                  }}>Cancelar</button>
                  <button type="submit" className="btn-primary">
                    {editingAgent ? 'Atualizar no Banco' : 'Salvar no Banco de Dados'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Lembretes e Confirmações 24h */}
      {showRemindersModal && (
        <div className="agent-modal-overlay">
          <div className="agent-modal" style={{ maxWidth: '850px' }}>
            <div className="agent-modal-header">
              <div className="header-title">
                <Calendar size={24} color="#7C3AED" />
                <h2>Histórico e Agendamentos da Confirmação 24h</h2>
              </div>
              <button className="close-btn" onClick={() => setShowRemindersModal(false)}>
                <Close size={24} />
              </button>
            </div>

            <div className="agent-modal-content" style={{ padding: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>
                Lembretes Disparados Recentemente ({remindersInfo?.logs?.length || 0})
              </h4>
              {(!remindersInfo?.logs || remindersInfo.logs.length === 0) ? (
                <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '24px' }}>Nenhum lembrete 24h enviado ainda.</p>
              ) : (
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Cliente</th>
                        <th style={{ padding: '10px 12px' }}>Agendamento</th>
                        <th style={{ padding: '10px 12px' }}>Data / Hora</th>
                        <th style={{ padding: '10px 12px' }}>Disparado Em</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remindersInfo.logs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{log.client_name}</td>
                          <td style={{ padding: '10px 12px' }}>{log.appointment_title}</td>
                          <td style={{ padding: '10px 12px' }}>{log.appointment_date} às {log.appointment_time}</td>
                          <td style={{ padding: '10px 12px', color: '#64748B' }}>{log.sent_at}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              backgroundColor: log.status === 'confirmed' ? '#ECFDF5' : (log.status === 'rescheduled' ? '#EFF6FF' : (log.status === 'cancelled' ? '#FEF2F2' : '#F3E8FF')),
                              color: log.status === 'confirmed' ? '#059669' : (log.status === 'rescheduled' ? '#1D4ED8' : (log.status === 'cancelled' ? '#DC2626' : '#7C3AED'))
                            }}>
                              {log.status === 'confirmed' ? 'Confirmado' : (log.status === 'rescheduled' ? 'Remarcado' : (log.status === 'cancelled' ? 'Cancelado' : 'Aguardando'))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: '#1e293b' }}>
                  Próximos Agendamentos na Agenda Cal.com ({remindersInfo?.upcoming?.length || 0})
                </h4>
                <button
                  onClick={handleTriggerReminders}
                  disabled={isTriggering}
                  style={{
                    backgroundColor: '#10B981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
                  }}
                  title="Confirmar agora todos os agendamentos na janela de 24h"
                >
                  <Check size={14} /> {isTriggering ? 'Confirmando...' : 'Confirmar Todos Agora'}
                </button>
              </div>
              {(!remindersInfo?.upcoming || remindersInfo.upcoming.length === 0) ? (
                <p style={{ color: '#64748B', fontSize: '0.9rem' }}>Nenhum agendamento futuro encontrado na agenda.</p>
              ) : (
                <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>Cliente</th>
                        <th style={{ padding: '10px 12px' }}>Título</th>
                        <th style={{ padding: '10px 12px' }}>Data / Hora</th>
                        <th style={{ padding: '10px 12px', minWidth: '220px' }}>Telefone (WhatsApp)</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remindersInfo.upcoming.map(b => (
                        <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>{b.attendeeName}</td>
                          <td style={{ padding: '10px 12px' }}>{b.title}</td>
                          <td style={{ padding: '10px 12px' }}>{new Date(b.start).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                          <td style={{ padding: '10px 12px' }}>
                            {editingPhoneBookingId === b.id ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  placeholder="(61) 98168-4300"
                                  value={phoneInput}
                                  onChange={(e) => setPhoneInput(e.target.value)}
                                  autoFocus
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '0.82rem',
                                    borderRadius: '6px',
                                    border: '1.5px solid #7C3AED',
                                    width: '140px'
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSavePhone(b.id, b.attendeeName);
                                    if (e.key === 'Escape') setEditingPhoneBookingId(null);
                                  }}
                                />
                                <button
                                  onClick={() => handleSavePhone(b.id, b.attendeeName)}
                                  disabled={savingPhone}
                                  style={{
                                    backgroundColor: '#7C3AED',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {savingPhone ? '...' : 'Salvar'}
                                </button>
                                <button
                                  onClick={() => setEditingPhoneBookingId(null)}
                                  style={{
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 6px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : b.attendeePhone ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, color: '#1e293b' }}>{b.attendeePhone}</span>
                                <button
                                  onClick={() => {
                                    setEditingPhoneBookingId(b.id);
                                    setPhoneInput(b.attendeePhone || '');
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#7C3AED',
                                    padding: '2px 4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600
                                  }}
                                  title="Alterar número"
                                >
                                  ✏️ Alterar
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditingPhoneBookingId(b.id);
                                  setPhoneInput('');
                                }}
                                style={{
                                  backgroundColor: '#FEF3C7',
                                  color: '#92400E',
                                  border: '1px dashed #F59E0B',
                                  borderRadius: '6px',
                                  padding: '4px 10px',
                                  fontSize: '0.78rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Cadastrar telefone para envio do lembrete 24h"
                              >
                                ➕ Inserir Telefone
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <button
                                onClick={() => handleSendSingleReminder(b)}
                                disabled={isTriggering}
                                style={{
                                  backgroundColor: b.attendeePhone ? '#10B981' : '#F1F5F9',
                                  color: b.attendeePhone ? '#ffffff' : '#64748B',
                                  border: b.attendeePhone ? '1px solid #059669' : '1px solid #CBD5E1',
                                  borderRadius: '8px',
                                  padding: '6px 12px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  boxShadow: b.attendeePhone ? '0 2px 5px rgba(16, 185, 129, 0.28)' : 'none',
                                  whiteSpace: 'nowrap'
                                }}
                                title={b.attendeePhone ? 'Enviar mensagem de confirmação 24h agora no WhatsApp deste cliente' : 'Clique para cadastrar o telefone e confirmar agora'}
                              >
                                <Check size={14} /> Confirmar Agora
                              </button>
                              {b.status === 'confirmed' ? (
                                <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>
                                  ● Confirmado
                                </span>
                              ) : b.status === 'sent' ? (
                                <span style={{ fontSize: '0.7rem', color: '#7C3AED', fontWeight: 600 }}>
                                  ● Lembrete Enviado
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleMarkConfirmed(b)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    fontSize: '0.68rem',
                                    color: '#64748B',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                  }}
                                  title="Marcar como confirmado manualmente no sistema"
                                >
                                  Marcar Confirmado
                                </button>
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
          </div>
        </div>
      )}
    </div>
  );
}
