const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const db = require('./db');
const { normalizePhone } = require('./phone_utils');

const DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const cachedEventTypesByWs = new Map();

function detectRequestedDate(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const now = new Date();
  
  if (lower.includes('hoje')) {
    return new Date(now);
  }
  if (lower.includes('amanhã') || lower.includes('amanha')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes('depois de amanhã') || lower.includes('depois de amanha')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d;
  }
  
  const daysMap = {
    'domingo': 0,
    'segunda': 1,
    'terça': 2, 'terca': 2,
    'quarta': 3,
    'quinta': 4,
    'sexta': 5,
    'sábado': 6, 'sabado': 6
  };
  
  for (const [dayName, targetDay] of Object.entries(daysMap)) {
    if (lower.includes(dayName)) {
      const currentDay = now.getDay();
      let diff = targetDay - currentDay;
      if (diff <= 0) diff += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + diff);
      return d;
    }
  }
  
  const matchDay = lower.match(/dia\s*(\d{1,2})/) || lower.match(/(\d{1,2})\/(\d{1,2})/);
  if (matchDay) {
    const day = parseInt(matchDay[1], 10);
    const month = matchDay[2] ? parseInt(matchDay[2], 10) - 1 : now.getMonth();
    const d = new Date(now.getFullYear(), month, day);
    if (d < now) {
      d.setMonth(d.getMonth() + 1);
    }
    return d;
  }
  
  return null;
}

const SHORT_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatDateBr(isoString) {
  const date = new Date(isoString);
  const dayName = SHORT_DAYS[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = date.getMinutes();
  const timeStr = minutes === 0 ? `${hours}h` : `${hours}:${String(minutes).padStart(2, '0')}h`;
  return `${dayName} ${day}/${month} às ${timeStr}`;
}

async function getCalAvailability(workspaceId, currentMessageText, recentMessages = []) {
  try {
    const database = await db.getDB();
    const ws = await database.get('SELECT cal_api_key, cal_link FROM workspaces WHERE id = ?', [workspaceId]);
    
    const apiKey = ws && ws.cal_api_key && ws.cal_api_key.trim();
    if (!apiKey) {
      // Workspace não possui Cal.com configurado
      return null;
    }
    const defaultLink = (ws && ws.cal_link && ws.cal_link.startsWith('http')) ? ws.cal_link : '';

    // 1. Buscar tipos de eventos com cache de 5 minutos por workspace
    const nowMs = Date.now();
    let wsCache = cachedEventTypesByWs.get(workspaceId);
    if (!wsCache || nowMs - wsCache.time > 300000) {
      try {
        const resTypes = await fetch('https://api.cal.com/v2/event-types', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'cal-api-version': '2024-06-14'
          }
        });
        if (resTypes.ok) {
          const jsonTypes = await resTypes.json();
          wsCache = { data: jsonTypes.data || [], time: nowMs };
          cachedEventTypesByWs.set(workspaceId, wsCache);
        }
      } catch (e) {
        console.error('Erro ao buscar event types do Cal.com:', e.message);
      }
    }

    const eventTypes = (wsCache && wsCache.data) || [];

    // Escolhe o evento mais adequado (preferência para mentoria ou acolhimento)
    const lowerMsg = (currentMessageText || '').toLowerCase();
    let selectedEvent = null;
    if (lowerMsg.includes('acolhimento')) {
      selectedEvent = eventTypes.find(e => e.slug.includes('acolhimento') || e.title.toLowerCase().includes('acolhimento'));
    }
    if (!selectedEvent) {
      selectedEvent = eventTypes.find(e => e.title.toLowerCase().includes('mentoria') || e.slug.includes('mentoria')) || eventTypes[0] || {
        id: 5307553,
        title: 'Mentoria Yuri',
        bookingUrl: 'https://cal.com/exdevedor/mentoria'
      };
    }

    const combinedText = [
      currentMessageText || '',
      ...recentMessages.map(m => m.text || '')
    ].join(' ').toLowerCase();

    // 2. Detectar se o cliente pediu um dia específico
    const requestedDate = detectRequestedDate(currentMessageText);
    
    let startTime;
    let endTime;
    let isSpecificSearch = false;

    if (requestedDate) {
      isSpecificSearch = true;
      const start = new Date(requestedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 3); // Aquele dia e os 3 seguintes (4 dias no total)
      end.setHours(23, 59, 99, 999);
      startTime = start.toISOString();
      endTime = end.toISOString();
    } else {
      const now = new Date();
      startTime = now.toISOString();
      const end = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 3 semanas
      endTime = end.toISOString();
    }

    // 3. Consultar slots disponíveis no Cal.com
    const slotsUrl = `https://api.cal.com/v2/slots/available?eventTypeId=${selectedEvent.id}&startTime=${startTime}&endTime=${endTime}&timeZone=America/Sao_Paulo`;
    const resSlots = await fetch(slotsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13'
      }
    });

    let rawSlots = [];
    if (resSlots.ok) {
      const jsonSlots = await resSlots.json();
      const slotsByDay = jsonSlots.data?.slots || {};
      for (const day of Object.keys(slotsByDay).sort()) {
        const daySlots = slotsByDay[day] || [];
        for (const s of daySlots) {
          if (s.time) {
            rawSlots.push(s.time);
          }
        }
      }
    }

    // Formatar os horários
    const availableFormatted = rawSlots.slice(0, 5).map(formatDateBr);
    const bookingUrl = selectedEvent.bookingUrl || defaultLink;

    let promptContext = `\n\n--- [DISPONIBILIDADE DA AGENDA EM TEMPO REAL] ---\n`;
    promptContext += `Evento: ${selectedEvent.title}\n`;

    if (isSpecificSearch) {
      const dayLabel = SHORT_DAYS[requestedDate.getDay()] + ' ' + String(requestedDate.getDate()).padStart(2, '0') + '/' + String(requestedDate.getMonth() + 1).padStart(2, '0');
      promptContext += `Consulta de dia específico realizada pelo cliente: ${dayLabel} e os 3 dias seguintes.\n`;
      if (availableFormatted.length > 0) {
        promptContext += `Horários disponíveis encontrados para essa data e os 3 dias seguintes:\n`;
        availableFormatted.forEach((h, i) => {
          promptContext += `${i + 1} - ${h}\n`;
        });
      } else {
        promptContext += `Aviso: Infelizmente não há horários livres no dia ${dayLabel} nem nos 3 dias seguintes.\n`;
      }
    } else {
      if (availableFormatted.length > 0) {
        promptContext += `Os 5 horários disponíveis na agenda são:\n`;
        availableFormatted.forEach((h, i) => {
          promptContext += `${i + 1} - ${h}\n`;
        });
      } else {
        promptContext += `Aviso: Nenhum horário disponível aberto nas próximas 3 semanas.\n`;
      }
    }

    promptContext += `\nREGRAS CRÍTICAS DE RESPOSTA E AGENDAMENTO:\n`;
    promptContext += `- REGRA OBRIGATÓRIA DE FORMATAÇÃO: Formate os horários SEMPRE em forma de lista numerada, exatamente neste padrão:\n1 - Sáb 17/10 às 11h\n2 - Sáb 24/10 às 08h\n(cada horário em uma linha separada numerada).\n`;
    promptContext += `- REGRA ESTRITA DE LINKS: NUNCA mostre, mencione ou envie o link do cal.com ou qualquer outro link externo. Jamais envie URLs ou links.\n`;
    promptContext += `- DADOS OBRIGATÓRIOS DO CLIENTE: Para efetivar e reservar a vaga oficialmente na agenda, você DEVE OBRIGATORIAMENTE obter:\n  1. Horário escolhido\n  2. Nome completo do cliente\n  3. Motivo do agendamento (dúvida, assunto ou objetivo da mentoria)\n`;
    promptContext += `- Se o cliente escolher um horário mas ainda NÃO informou o Nome e o Motivo: peça gentilmente o Nome completo e o Motivo para poder garantir e registrar a reserva da vaga.\n`;
    promptContext += `- Se o cliente já informou o nome, peça o motivo (e vice-versa).\n`;
    promptContext += `- NUNCA confirme a reserva antes de ter o Nome e o Motivo.\n`;
    promptContext += `- COMANDO DE EFETIVAÇÃO DE RESERVA: Assim que você tiver o Horário, o Nome e o Motivo, confirme o agendamento de forma acolhedora e inclua OBRIGATORIAMENTE no final da resposta a tag de sistema:\n  [RESERVAR_CALENDARIO: {"horario": "<horário escolhido, ex: Sáb 17/10 às 11h>", "nome": "<nome do cliente>", "motivo": "<motivo do agendamento>"}]\n(Essa tag aciona a API oficial do Cal.com para travar o horário e será removida antes de ir ao WhatsApp).\n`;
    promptContext += `- Se o cliente disser que não pode nesses horários ou perguntar por outro dia: pergunte qual dia seria melhor e avise que você verificará a disponibilidade para aquele dia e para os três dias seguintes!\n`;
    promptContext += `- Se o cliente indicar uma data ou dia de preferência: apresente os horários encontrados para aquele dia e os 3 dias seguintes no mesmo formato de lista numerada.\n`;
    promptContext += `--------------------------------------------------\n`;

    return {
      success: true,
      slots: availableFormatted,
      rawSlots: rawSlots,
      eventTypeId: selectedEvent.id,
      eventTitle: selectedEvent.title,
      bookingUrl,
      promptContext
    };

  } catch (error) {
    console.error('Erro no calendar_service:', error.message);
    return {
      success: false,
      slots: [],
      rawSlots: [],
      bookingUrl: 'https://cal.com/exdevedor/mentoria',
      promptContext: ''
    };
  }
}

function resolveIsoSlot(text, slots) {
  if (!text || !slots || slots.length === 0) return slots ? slots[0] : null;
  if (slots.includes(text)) return text;
  
  for (const s of slots) {
    const d = new Date(s);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', timeZone: 'America/Sao_Paulo' });
    if (text.includes(day + '/' + month) && (text.includes(hour) || text.includes(hour.replace(/^0/, '')))) {
      return s;
    }
  }
  
  for (const s of slots) {
    const d = new Date(s);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    if (text.includes(day + '/' + month) || text.includes(day)) {
      return s;
    }
  }
  
  return slots[0];
}

async function createCalBooking(workspaceId, {
  slotIso,
  slotText,
  name,
  notes,
  phone,
  email,
  eventTypeId
}) {
  try {
    const database = await db.getDB();
    const ws = await database.get('SELECT cal_api_key, cal_link FROM workspaces WHERE id = ?', [workspaceId]);
    const apiKey = ws && ws.cal_api_key && ws.cal_api_key.trim();
    if (!apiKey) {
      console.warn(`[Cal.com] Workspace ${workspaceId} não possui Cal.com configurado para realizar reserva.`);
      return { success: false, error: 'Cal.com não configurado neste workspace' };
    }
    const targetEventTypeId = eventTypeId || 5307553;

    let targetIso = slotIso;
    if (!targetIso) {
      // Busca disponibilidade para resolver texto para ISO real do Cal.com
      const calData = await getCalAvailability(workspaceId, slotText || '');
      targetIso = resolveIsoSlot(slotText, calData.rawSlots);
    }

    if (!targetIso) {
      console.error('Não foi possível identificar o slot ISO para reserva no Cal.com');
      return { success: false, error: 'Horário não encontrado' };
    }

    const normPhone = phone ? normalizePhone(phone, '66') : null;
    const cleanPhone = normPhone?.cleanDigits || '';
    const attendeePhone = normPhone?.e164 || undefined;
    const attendeeEmail = email || (cleanPhone ? `cliente.${cleanPhone}@gmail.com` : 'cliente.contato@gmail.com');
    const attendeeName = (name && name.trim()) || 'Cliente WhatsApp';
    const attendeeNotes = (notes && notes.trim()) || 'Agendamento via Unico CRM WhatsApp';

    console.log(`📅 Criando reserva oficial no Cal.com: ${targetIso} para ${attendeeName} (${attendeePhone || attendeeEmail}) - Motivo: ${attendeeNotes}`);

    const res = await fetch('https://api.cal.com/v2/bookings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        start: targetIso,
        eventTypeId: targetEventTypeId,
        attendee: {
          name: attendeeName,
          email: attendeeEmail,
          phoneNumber: attendeePhone,
          timeZone: 'America/Sao_Paulo',
          language: 'pt-BR'
        },
        bookingFieldsResponses: {
          name: attendeeName,
          notes: attendeeNotes
        }
      })
    });

    const json = await res.json();
    if (res.ok && json.status === 'success') {
      console.log(`✅ Agendamento RESERVADO com sucesso no Cal.com! ID: ${json.data?.id}, UID: ${json.data?.uid}`);

      // Salva no SQLite calendar_events para exibir no /agenda do CRM
      try {
        const d = new Date(targetIso);
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
        const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        await database.run(
          `INSERT INTO calendar_events (workspace_id, title, date, time, type) VALUES (?, ?, ?, ?, ?)`,
          [workspaceId, `Mentoria - ${attendeeName} (${attendeeNotes.slice(0, 30)})`, dateStr, timeStr, 'event-work']
        );
      } catch (dbErr) {
        console.error('Erro ao salvar evento localmente:', dbErr.message);
      }

      return { success: true, booking: json.data };
    } else {
      console.error('❌ Erro na API do Cal.com ao criar reserva:', json);
      // Salva localmente mesmo assim para não perder
      try {
        const d = new Date(targetIso);
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        await database.run(
          `INSERT INTO calendar_events (workspace_id, title, date, time, type) VALUES (?, ?, ?, ?, ?)`,
          [workspaceId, `Mentoria - ${attendeeName} (${attendeeNotes.slice(0, 30)})`, dateStr, timeStr, 'event-work']
        );
      } catch (e) {}
      return { success: false, error: json.error?.message || 'Erro na API Cal.com' };
    }
  } catch (err) {
    console.error('Exceção ao criar reserva no Cal.com:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  detectRequestedDate,
  formatDateBr,
  getCalAvailability,
  createCalBooking,
  resolveIsoSlot
};
