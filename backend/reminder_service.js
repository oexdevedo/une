const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { getWhatsAppAuthDir } = require('./storage');
const { normalizePhone, formatDisplayPhone } = require('./phone_utils');

const SHORT_DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/**
 * Extrai o telefone de um remote_jid (suporta LID com mapeamento reverso)
 */
function getPhoneNumberFromJid(jid, workspaceId = 1) {
  if (!jid) return '';
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '');
  }
  if (jid.endsWith('@telegram')) {
    return jid.replace('@telegram', '');
  }
  if (jid.endsWith('@lid')) {
    const lid = jid.replace('@lid', '');
    const authDir = getWhatsAppAuthDir(workspaceId);
    const mappingFile = path.join(authDir, `lid-mapping-${lid}_reverse.json`);
    try {
      if (fs.existsSync(mappingFile)) {
        const content = fs.readFileSync(mappingFile, 'utf8');
        const phone = JSON.parse(content);
        if (phone) return String(phone);
      }
    } catch (e) {}
    return lid;
  }
  return jid.split('@')[0];
}

/**
 * Resolve o remote_jid para WhatsApp (incluindo mapeamento reverso de LID)
 */
function resolveRemoteJidForPhone(workspaceId, phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.endsWith('@lid') || raw.endsWith('@telegram')) {
    return raw;
  }
  if (raw.endsWith('@s.whatsapp.net')) {
    return raw;
  }

  // Normaliza o número com o normalizador internacional (Tailândia +66, Brasil +55, etc.)
  const normalized = normalizePhone(raw, '66');
  const cleanPhone = normalized.cleanDigits;
  if (!cleanPhone) return null;

  // Se o número for do Brasil, tenta resolver para @lid se houver mapeamento
  if (normalized.ddi === '55' || cleanPhone.startsWith('55')) {
    const authDir = getWhatsAppAuthDir(workspaceId);
    try {
      const directLidFile = path.join(authDir, `lid-mapping-${cleanPhone}.json`);
      if (fs.existsSync(directLidFile)) {
        const lid = JSON.parse(fs.readFileSync(directLidFile, 'utf8'));
        if (lid) return `${lid}@lid`;
      }

      const withoutDdi = cleanPhone.slice(2);
      const withDdi = cleanPhone;
      
      const altLidFile = path.join(authDir, `lid-mapping-${withDdi}.json`);
      if (fs.existsSync(altLidFile)) {
        const lid = JSON.parse(fs.readFileSync(altLidFile, 'utf8'));
        if (lid) return `${lid}@lid`;
      }

      if (fs.existsSync(authDir)) {
        const files = fs.readdirSync(authDir);
        for (const file of files) {
          if (file.startsWith('lid-mapping-') && file.endsWith('_reverse.json')) {
            try {
              const mappedPhone = JSON.parse(fs.readFileSync(path.join(authDir, file), 'utf8'));
              if (String(mappedPhone).includes(withoutDdi) || String(mappedPhone) === withDdi) {
                const lid = file.replace('lid-mapping-', '').replace('_reverse.json', '');
                return `${lid}@lid`;
              }
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar LID do telefone:', err);
    }
  }

  // Fallback para padrão @s.whatsapp.net normalizado
  return normalized.jid;
}

/**
 * Identifica o nome do usuário e cadastra automaticamente no CRM caso não exista
 */
async function autoRegisterContact(workspaceId = 1, { jid, pushName, text }) {
  try {
    const database = await db.getDB();
    const phone = getPhoneNumberFromJid(jid, workspaceId);
    if (!phone) return null;

    const cleanPhone = phone.replace(/\D/g, '');
    let identifiedName = (pushName && pushName.trim()) || '';

    // Tenta identificar se o usuário disse o nome no texto da mensagem
    if (text) {
      const match = text.match(/(?:meu nome é|me chamo|sou o|sou a|aqui é o|aqui é a|nome:\s*)\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]{2,30})/i);
      if (match && match[1]) {
        identifiedName = match[1].trim();
      }
    }

    if (!identifiedName) {
      identifiedName = `Cliente ${cleanPhone.slice(-4)}`;
    }

    // Formata telefone legível para o CRM usando formatDisplayPhone
    const formattedPhone = formatDisplayPhone(cleanPhone, '66');

    const existing = await database.get(
      'SELECT id, name, phone FROM contacts WHERE workspace_id = ? AND (phone = ? OR phone = ? OR phone LIKE ?)',
      [workspaceId, cleanPhone, formattedPhone, `%${cleanPhone.slice(-8)}%`]
    );

    if (!existing) {
      const result = await database.run(
        `INSERT INTO contacts (workspace_id, name, phone, status) VALUES (?, ?, ?, 'Novo')`,
        [workspaceId, identifiedName, formattedPhone]
      );
      console.log(`👤 Contato cadastrado automaticamente no CRM: "${identifiedName}" (${formattedPhone}) - ID: ${result.lastID}`);
      return { id: result.lastID, name: identifiedName, phone: formattedPhone, isNew: true };
    } else {
      // Se já existe mas o nome era genérico e agora temos pushName real ou nome declarado
      if ((existing.name.startsWith('Cliente ') || existing.name === 'Novo') && identifiedName && !identifiedName.startsWith('Cliente ')) {
        await database.run('UPDATE contacts SET name = ? WHERE id = ?', [identifiedName, existing.id]);
        console.log(`👤 Nome do contato atualizado no CRM: ${existing.name} -> "${identifiedName}"`);
      }
      return { id: existing.id, name: existing.name, phone: existing.phone, isNew: false };
    }
  } catch (err) {
    console.error('Erro em autoRegisterContact:', err.message);
    return null;
  }
}

/**
 * Obtém ou cria automaticamente a lista de sistema "Agendados"
 */
async function getOrCreateAgendadosList(database, workspaceId = 1) {
  let list = await database.get('SELECT id, name FROM lists WHERE workspace_id = ? AND name = ?', [workspaceId, 'Agendados']);
  if (!list) {
    const res = await database.run(
      'INSERT INTO lists (workspace_id, name) VALUES (?, ?)',
      [workspaceId, 'Agendados']
    );
    list = { id: res.lastID, name: 'Agendados' };
    console.log(`📋 Lista automática "Agendados" criada no banco (ID: ${list.id})`);
  }
  return list.id;
}

/**
 * Sincroniza todos os contatos da agenda (Cal.com e calendar_events) para a lista Agendados
 */
async function syncAgendaToAgendadosList(workspaceId = 1) {
  try {
    const database = await db.getDB();
    const agendadosListId = await getOrCreateAgendadosList(database, workspaceId);

    // 1. Move qualquer contato com status 'Agendado' para a lista Agendados
    await database.run(
      'UPDATE contacts SET list_id = ? WHERE workspace_id = ? AND status = ? AND (list_id IS NULL OR list_id != ?)',
      [agendadosListId, workspaceId, 'Agendado', agendadosListId]
    );

    // 2. Extrai participantes de calendar_events e cadastra/atualiza na lista Agendados
    const events = await database.all(
      'SELECT DISTINCT attendee_name, attendee_phone, title FROM calendar_events WHERE workspace_id = ?',
      [workspaceId]
    );
    for (const evt of events) {
      let name = (evt.attendee_name || '').trim();
      if (!name || name === 'Cliente') {
        const m = (evt.title || '').match(/Mentoria\s*(?:Yuri entre [^e]+e\s*|-\s*)([^(]+)/i);
        if (m && m[1]) name = m[1].trim();
      }
      if (!name || name === 'Cliente') continue;

      let phone = (evt.attendee_phone || '').trim();
      
      // Se não tiver telefone na agenda, tenta encontrar em contatos existentes no mesmo workspace
      if (!phone) {
        const nameParts = name.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
        const candidates = await database.all(
          'SELECT name, phone FROM contacts WHERE workspace_id = ? AND phone != "" AND phone IS NOT NULL',
          [workspaceId]
        );
        const matched = candidates.find(c => {
          const cName = c.name.toLowerCase();
          return nameParts.some(part => cName.includes(part)) || cName.startsWith(name.toLowerCase().slice(0, 4));
        });
        if (matched && matched.phone) {
          phone = matched.phone;
        }
      }

      const existing = await database.get(
        'SELECT id, list_id, phone FROM contacts WHERE workspace_id = ? AND (name = ? OR (phone != "" AND phone = ?))',
        [workspaceId, name, phone]
      );
      if (!existing) {
        await database.run(
          'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
          [workspaceId, agendadosListId, name, phone, 'Agendado']
        );
      } else {
        // Se já existe mas estava sem telefone e agora encontramos telefone
        const finalPhone = (!existing.phone && phone) ? phone : existing.phone;
        await database.run(
          'UPDATE contacts SET list_id = ?, status = ?, phone = ? WHERE id = ?',
          [agendadosListId, 'Agendado', finalPhone, existing.id]
        );
      }
    }

    // 3. Atualiza também a partir dos overrides de booking
    const overrides = await database.all('SELECT attendee_name, phone FROM booking_contact_overrides WHERE workspace_id = ?', [workspaceId]);
    for (const ov of overrides) {
      if (ov.attendee_name && ov.attendee_name !== 'Cliente') {
        const existing = await database.get('SELECT id FROM contacts WHERE workspace_id = ? AND name = ?', [workspaceId, ov.attendee_name]);
        if (existing) {
          await database.run('UPDATE contacts SET phone = ?, list_id = ?, status = ? WHERE id = ?', [ov.phone, agendadosListId, 'Agendado', existing.id]);
        } else {
          await database.run(
            'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
            [workspaceId, agendadosListId, ov.attendee_name, ov.phone, 'Agendado']
          );
        }
      }
    }

    return agendadosListId;
  } catch (err) {
    console.error('Erro ao sincronizar contatos com lista Agendados:', err);
    return null;
  }
}

/**
 * Salva ou edita manualmente o telefone de um agendamento
 */
async function saveBookingPhone(workspaceId = 1, { bookingId, attendeeName, phone }) {
  const database = await db.getDB();
  const cleanPhone = (phone && phone.trim()) || '';
  if (!cleanPhone) {
    throw new Error('Telefone não pode estar vazio');
  }

  // 1. Salva na tabela booking_contact_overrides
  await database.run(
    `INSERT INTO booking_contact_overrides (workspace_id, booking_id, attendee_name, phone)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(booking_id) DO UPDATE SET phone = excluded.phone, attendee_name = excluded.attendee_name, updated_at = CURRENT_TIMESTAMP`,
    [workspaceId, bookingId, attendeeName || 'Cliente', cleanPhone]
  );
  console.log(`💾 Telefone salvo manualmente para booking [${bookingId}]: ${cleanPhone}`);

  // 2. Atualiza ou cadastra em contacts na lista Agendados
  if (attendeeName && attendeeName !== 'Cliente') {
    const agendadosListId = await getOrCreateAgendadosList(database, workspaceId);
    const contact = await database.get(
      'SELECT id, phone FROM contacts WHERE workspace_id = ? AND (name LIKE ? OR name = ?)',
      [workspaceId, `%${attendeeName}%`, attendeeName]
    );
    if (contact) {
      await database.run('UPDATE contacts SET phone = ?, list_id = ?, status = ? WHERE id = ?', [cleanPhone, agendadosListId, 'Agendado', contact.id]);
      console.log(`👤 Telefone do contato [${attendeeName}] atualizado na lista Agendados para: ${cleanPhone}`);
    } else {
      await database.run(
        `INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, 'Agendado')`,
        [workspaceId, agendadosListId, attendeeName, cleanPhone]
      );
      console.log(`👤 Novo contato [${attendeeName}] cadastrado na lista Agendados com telefone: ${cleanPhone}`);
    }
  }

  // 3. Se for evento local (local_ID), atualiza calendar_events
  if (bookingId && bookingId.startsWith('local_')) {
    const eventId = bookingId.replace('local_', '');
    await database.run(
      'UPDATE calendar_events SET attendee_phone = ?, attendee_name = ? WHERE id = ?',
      [cleanPhone, attendeeName || 'Cliente', eventId]
    );
  }

  return { success: true };
}

/**
 * Busca agendamentos futuros do Cal.com e do banco local
 * - Aplica telefones manuais de booking_contact_overrides
 * - Caso não esteja na agenda local, cadastra automaticamente
 * - Caso não esteja nos contatos, cadastra automaticamente
 */
async function getUpcomingBookings(workspaceId = 1) {
  const database = await db.getDB();
  const ws = await database.get('SELECT cal_api_key FROM workspaces WHERE id = ?', [workspaceId]);
  const apiKey = ws && ws.cal_api_key && ws.cal_api_key.trim();

  // Carrega mapeamento de telefones manuais
  const overrides = await database.all(
    'SELECT booking_id, phone, attendee_name FROM booking_contact_overrides WHERE workspace_id = ?',
    [workspaceId]
  );
  const overrideMap = new Map(overrides.map(o => [o.booking_id, o]));

  // Carrega logs de confirmação para mapear status dos agendamentos
  const reminderLogs = await database.all(
    'SELECT booking_id, status, sent_at FROM reminder_logs WHERE workspace_id = ?',
    [workspaceId]
  );
  const logMap = new Map(reminderLogs.map(l => [l.booking_id, l]));

  // Carrega contatos existentes para resolver telefones por nome
  const allContacts = await database.all('SELECT name, phone FROM contacts WHERE workspace_id = ?', [workspaceId]);

  const bookings = [];

  // 1. Cal.com API v2 (somente se este workspace possuir API key configurada)
  if (apiKey) {
    try {
      const res = await fetch('https://api.cal.com/v2/bookings?status=upcoming', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': '2024-08-13'
        }
      });

    if (res.ok) {
      const json = await res.json();
      if (json.status === 'success' && Array.isArray(json.data)) {
        for (const b of json.data) {
          const attendee = (b.attendees && b.attendees[0]) || {};
          const bookingKey = `cal_${b.id}`;
          const startDate = new Date(b.start);

          // 1.1 Telefone: verifica se há override manual
          let attendeePhone = (attendee.phoneNumber && attendee.phoneNumber.trim()) || '';
          if (overrideMap.has(bookingKey)) {
            attendeePhone = overrideMap.get(bookingKey).phone;
          }

          // 1.2 Se não tiver telefone direto, busca em contacts pelo nome do cliente
          const attendeeName = (attendee.name && attendee.name.trim()) || 'Cliente';
          if (!attendeePhone && attendeeName && attendeeName !== 'Cliente') {
            const matched = allContacts.find(c => 
              c.name.toLowerCase().includes(attendeeName.toLowerCase()) || 
              attendeeName.toLowerCase().includes(c.name.toLowerCase())
            );
            if (matched && matched.phone) {
              attendeePhone = matched.phone;
            }
          }

          // 1.3 [AUTO-CADASTRO NA AGENDA]: se o agendamento não estiver em calendar_events, cadastra automaticamente!
          try {
            const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const timeStr = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
            const existingLocal = await database.get(
              'SELECT id, attendee_phone FROM calendar_events WHERE workspace_id = ? AND date = ? AND time = ?',
              [workspaceId, dateStr, timeStr]
            );
            if (!existingLocal) {
              await database.run(
                `INSERT INTO calendar_events (workspace_id, title, date, time, type, attendee_name, attendee_phone)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [workspaceId, b.title, dateStr, timeStr, 'event-work', attendeeName, attendeePhone]
              );
              console.log(`📅 Agendamento Cal.com cadastrado automaticamente na agenda local: ${b.title} (${dateStr} às ${timeStr})`);
            } else if (!existingLocal.attendee_phone && attendeePhone) {
              await database.run(
                'UPDATE calendar_events SET attendee_phone = ?, attendee_name = ? WHERE id = ?',
                [attendeePhone, attendeeName, existingLocal.id]
              );
            }
          } catch (syncErr) {
            console.error('Erro ao auto-cadastrar na agenda local:', syncErr.message);
          }

          // 1.4 [AUTO-CADASTRO EM CONTATOS NA LISTA AGENDADOS]
          if (attendeeName && attendeeName !== 'Cliente') {
            const agendadosListId = await getOrCreateAgendadosList(database, workspaceId);
            const existsInContacts = allContacts.find(c => 
              c.name.toLowerCase() === attendeeName.toLowerCase()
            );
            if (!existsInContacts) {
              try {
                await database.run(
                  `INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, 'Agendado')`,
                  [workspaceId, agendadosListId, attendeeName, attendeePhone || '']
                );
                console.log(`👤 Participante cadastrado automaticamente na lista Agendados: ${attendeeName} (${attendeePhone})`);
                allContacts.push({ name: attendeeName, phone: attendeePhone || '', list_id: agendadosListId, status: 'Agendado' });
              } catch (cErr) {}
            } else if (existsInContacts.list_id !== agendadosListId) {
              await database.run('UPDATE contacts SET list_id = ?, status = ? WHERE id = ?', [agendadosListId, 'Agendado', existsInContacts.id]);
            }
          }

          const logEntry = logMap.get(bookingKey);

          bookings.push({
            id: bookingKey,
            calId: b.id,
            source: 'cal.com',
            title: b.title || 'Mentoria',
            start: startDate,
            end: new Date(b.end),
            attendeeName: attendeeName,
            attendeePhone: attendeePhone,
            attendeeEmail: attendee.email || '',
            meetingUrl: b.meetingUrl || b.location || '',
            status: logEntry ? logEntry.status : null,
            sentAt: logEntry ? logEntry.sent_at : null
          });
        }
      }
    }
  } catch (err) {
    console.error('Erro ao consultar Cal.com para confirmações:', err.message);
  }
}

  // 2. Eventos locais em calendar_events
  try {
    const localEvents = await database.all(
      'SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY id DESC',
      [workspaceId]
    );

    for (const evt of localEvents) {
      if (evt.date) {
        const timeStr = evt.time ? `${evt.time}:00` : '09:00:00';
        const eventDate = new Date(`${evt.date}T${timeStr}`);
        
        let extractedName = evt.attendee_name || 'Cliente';
        if (extractedName === 'Cliente') {
          const nameMatch = evt.title.match(/Mentoria\s*-\s*([^(]+)/i);
          if (nameMatch) {
            extractedName = nameMatch[1].trim();
          }
        }

        const localKey = `local_${evt.id}`;
        let localPhone = evt.attendee_phone || '';
        if (overrideMap.has(localKey)) {
          localPhone = overrideMap.get(localKey).phone;
        }

        if (!localPhone && extractedName && extractedName !== 'Cliente') {
          const matched = allContacts.find(c => 
            c.name.toLowerCase().includes(extractedName.toLowerCase()) || 
            extractedName.toLowerCase().includes(c.name.toLowerCase())
          );
          if (matched && matched.phone) {
            localPhone = matched.phone;
          }
        }

        // Verifica se já temos esse agendamento vindo do Cal.com para não duplicar
        const exists = bookings.some(b => 
          Math.abs(b.start.getTime() - eventDate.getTime()) < 5 * 60 * 1000 &&
          (b.attendeeName.toLowerCase().includes(extractedName.toLowerCase()) || extractedName.toLowerCase().includes(b.attendeeName.toLowerCase()))
        );

        if (!exists) {
          const logEntry = logMap.get(localKey);
          bookings.push({
            id: localKey,
            calId: null,
            source: 'local',
            title: evt.title,
            start: eventDate,
            end: new Date(eventDate.getTime() + 60 * 60 * 1000),
            attendeeName: extractedName,
            attendeePhone: localPhone,
            attendeeEmail: '',
            meetingUrl: '',
            status: logEntry ? logEntry.status : null,
            sentAt: logEntry ? logEntry.sent_at : null
          });
        }
      }
    }
  } catch (err) {
    console.error('Erro ao consultar calendar_events para confirmações:', err.message);
  }

  return bookings;
}

/**
 * Executa a verificação e envia mensagens de confirmação 24h antes
 * @param {number} workspaceId 
 * @param {object} options { forceSendBookingId, withinHours }
 */
async function checkAndSend24hReminders(workspaceId = 1, options = {}) {
  const database = await db.getDB();
  const now = new Date();
  console.log(`⏰ [ReminderService] Verificando agendamentos para confirmação 24h antes... (Horário atual: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);

  // 1. Busca configurações do workspace
  const ws = await database.get('SELECT confirmation_enabled, confirmation_agent_id FROM workspaces WHERE id = ?', [workspaceId]);
  if (ws && ws.confirmation_enabled === 0 && !options.forceSendBookingId) {
    console.log('ℹ️ Confirmação automática 24h desativada no workspace.');
    return { checked: 0, sent: 0, skipped: 'disabled' };
  }

  // 2. Busca o agente de confirmação (padrão Mariana Confirmação)
  let agentId = ws && ws.confirmation_agent_id ? ws.confirmation_agent_id : '3';
  let agent = await database.get('SELECT * FROM agents WHERE id = ?', [agentId]);
  if (!agent) {
    // Fallback: procura agente com "Confirmação" no nome ou role
    agent = await database.get("SELECT * FROM agents WHERE name LIKE '%Confirmação%' OR role LIKE '%Confirmação%' LIMIT 1");
    if (agent) agentId = String(agent.id);
  }

  // 3. Busca agendamentos futuros
  const bookings = await getUpcomingBookings(workspaceId);
  console.log(`📋 [ReminderService] Total de agendamentos futuros encontrados: ${bookings.length}`);

  let sentCount = 0;
  const results = [];

  for (const b of bookings) {
    const bookingDate = b.start;
    const diffMs = bookingDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    const isTargetWindow = options.forceSendBookingId === b.id 
      ? true 
      : (options.withinHours ? (diffHours > 0 && diffHours <= options.withinHours) : (diffHours >= 20 && diffHours <= 28));

    console.log(`🔍 Booking [${b.id}] "${b.title}" para ${bookingDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (em ${diffHours.toFixed(1)}h) - Na janela: ${isTargetWindow}`);

    if (!isTargetWindow && !options.forceSendBookingId) {
      continue;
    }

    // Verifica se já foi enviado lembrete para este booking
    const existingLog = await database.get(
      'SELECT id, status, sent_at FROM reminder_logs WHERE workspace_id = ? AND booking_id = ?',
      [workspaceId, b.id]
    );

    if (existingLog && !options.forceSendBookingId) {
      console.log(`ℹ️ Lembrete já enviado anteriormente para ${b.id} em ${existingLog.sent_at} (Status: ${existingLog.status}).`);
      continue;
    }

    // Resolve telefone e JID do cliente
    let clientPhone = b.attendeePhone;
    
    // Se o booking não tiver telefone, procura em contacts ou messages pelo nome
    if (!clientPhone) {
      const contact = await database.get(
        'SELECT phone FROM contacts WHERE workspace_id = ? AND name LIKE ? LIMIT 1',
        [workspaceId, `%${b.attendeeName}%`]
      );
      if (contact && contact.phone) {
        clientPhone = contact.phone;
      }
    }

    let resolvedJid = null;
    if (clientPhone) {
      resolvedJid = resolveRemoteJidForPhone(workspaceId, clientPhone);
    } else {
      const msg = await database.get(
        'SELECT remote_jid FROM messages WHERE workspace_id = ? AND push_name LIKE ? ORDER BY timestamp DESC LIMIT 1',
        [workspaceId, `%${b.attendeeName}%`]
      );
      if (msg && msg.remote_jid) {
        resolvedJid = msg.remote_jid;
      }
    }

    if (!resolvedJid) {
      console.warn(`⚠️ Não foi possível encontrar número ou JID de WhatsApp para o agendamento ${b.id} (${b.attendeeName})`);
      results.push({ bookingId: b.id, success: false, reason: 'Telefone/JID não localizado' });
      continue;
    }

    // Formata a data e horário amigável para o cliente (em fuso SP)
    const dateOpts = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' };
    const dateFormatted = bookingDate.toLocaleDateString('pt-BR', dateOpts);
    const dayOfWeek = SHORT_DAYS[bookingDate.getDay()];
    const timeFormatted = bookingDate.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    const firstName = b.attendeeName.split(' ')[0] || 'Cliente';
    const cleanTitle = b.title.replace(/entre.*$/i, '').replace(/between.*$/i, '').trim();

    // Mensagem humanizada e calorosa de confirmação
    const confirmationMessage = `Olá, ${firstName}! Tudo bem? Passando para confirmar nosso agendamento de *${cleanTitle}* amanhã, *${dayOfWeek} (${dateFormatted}) às ${timeFormatted}*. Você confirma sua presença?`;

    console.log(`🚀 [ReminderService] Enviando mensagem de confirmação para ${b.attendeeName} (${resolvedJid}):\n"${confirmationMessage}"`);

    try {
      const whatsappApi = require('./whatsapp');
      await whatsappApi.sendMessage(workspaceId, resolvedJid, confirmationMessage, null);

      // Salva no banco de dados como mensagem do bot para aparecer na conversa do CRM
      const nowTs = Math.floor(Date.now() / 1000);
      await database.run(
        `INSERT INTO messages (id, workspace_id, remote_jid, from_me, text, type, timestamp, push_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `rem_${Date.now()}`,
          workspaceId,
          resolvedJid,
          1,
          confirmationMessage,
          'text',
          nowTs,
          agent ? agent.name : 'Mariana Confirmação'
        ]
      );

      // Atribui o chat ao Agente de Confirmação para quando o cliente responder!
      if (agentId) {
        await database.run(
          `INSERT INTO chat_assignments (workspace_id, remote_jid, agent_id)
           VALUES (?, ?, ?)
           ON CONFLICT(workspace_id, remote_jid) DO UPDATE SET agent_id = excluded.agent_id`,
          [workspaceId, resolvedJid, String(agentId)]
        );
        console.log(`📌 Chat [${resolvedJid}] atribuído ao Agente de Confirmação (ID: ${agentId})`);
      }

      // Registra no reminder_logs
      await database.run(
        `INSERT INTO reminder_logs (workspace_id, booking_id, client_name, client_phone, remote_jid, appointment_title, appointment_date, appointment_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, booking_id) DO UPDATE SET sent_at = CURRENT_TIMESTAMP, status = 'sent'`,
        [
          workspaceId,
          b.id,
          b.attendeeName,
          clientPhone || '',
          resolvedJid,
          cleanTitle,
          dateFormatted,
          timeFormatted,
          'sent'
        ]
      );

      sentCount++;
      results.push({ bookingId: b.id, attendeeName: b.attendeeName, remoteJid: resolvedJid, success: true });
    } catch (sendErr) {
      console.error(`❌ Erro ao enviar mensagem de confirmação para ${resolvedJid}:`, sendErr);
      results.push({ bookingId: b.id, success: false, error: sendErr.message });
    }
  }

  console.log(`✅ [ReminderService] Verificação finalizada. Enviados: ${sentCount}`);
  return { checked: bookings.length, sent: sentCount, results };
}

let reminderTimer = null;

function startReminderService(intervalMinutes = 15) {
  if (reminderTimer) clearInterval(reminderTimer);

  console.log(`🕒 [ReminderService] Serviço de Confirmação 24h agendado a cada ${intervalMinutes} minutos.`);

  // Executa uma primeira checagem após 5 segundos da inicialização do servidor
  setTimeout(() => {
    checkAndSend24hReminders(1).catch(err => console.error('Erro na checagem inicial do ReminderService:', err));
  }, 5000);

  // Intervalo recorrente
  reminderTimer = setInterval(() => {
    checkAndSend24hReminders(1).catch(err => console.error('Erro no ciclo periódico do ReminderService:', err));
  }, intervalMinutes * 60 * 1000);
}

async function markBookingConfirmed(workspaceId = 1, { bookingId, clientName, clientPhone, title, date, time }) {
  const database = await db.getDB();
  const existing = await database.get(
    'SELECT id FROM reminder_logs WHERE workspace_id = ? AND booking_id = ?',
    [workspaceId, bookingId]
  );

  const cleanPhone = clientPhone ? clientPhone.trim() : '';
  const resolvedJid = cleanPhone ? resolveRemoteJidForPhone(workspaceId, cleanPhone) : '';

  if (existing) {
    await database.run(
      `UPDATE reminder_logs SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [existing.id]
    );
  } else {
    await database.run(
      `INSERT INTO reminder_logs (workspace_id, booking_id, client_name, client_phone, remote_jid, appointment_title, appointment_date, appointment_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
      [
        workspaceId,
        bookingId,
        clientName || 'Cliente',
        cleanPhone,
        resolvedJid || '',
        title || 'Agendamento',
        date || '',
        time || ''
      ]
    );
  }
  console.log(`✅ Agendamento [${bookingId}] marcado como confirmado manualmente para ${clientName || 'Cliente'}.`);
  return { success: true };
}

function stopReminderService() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
    console.log('🛑 [ReminderService] Serviço de Confirmação interrompido.');
  }
}

module.exports = {
  getPhoneNumberFromJid,
  resolveRemoteJidForPhone,
  autoRegisterContact,
  saveBookingPhone,
  markBookingConfirmed,
  getUpcomingBookings,
  checkAndSend24hReminders,
  startReminderService,
  stopReminderService,
  getOrCreateAgendadosList,
  syncAgendaToAgendadosList
};

