const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { convertToOgg } = require('./audio_converter');
const aiHandler = require('./ai_handler');
const { getWhatsAppAuthDir, clearWhatsAppAuthDir, UPLOADS_DIR } = require('./storage');
const { normalizePhone, getWhatsAppCandidates } = require('./phone_utils');

const MAX_SLOTS = 5;
const sessions = {}; 
let reconnectTimeouts = {};
const roundRobinCounters = {};

function normalizeSlot(slot = 1) {
  const n = Number(slot) || 1;
  return Math.min(Math.max(n, 1), MAX_SLOTS);
}

function getSessionKey(workspaceId, slot = 1) {
  const s = normalizeSlot(slot);
  return s === 1 ? String(workspaceId) : `${workspaceId}_slot${s}`;
}

async function connectToWhatsApp(workspaceId, forceNew = false, slot = 1) {
  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);

  if (!sessions[sessionKey]) {
    sessions[sessionKey] = { sock: null, status: 'disconnected', currentQR: '', messages: [], slot: numSlot };
  }

  const session = sessions[sessionKey];
  if (forceNew) {
    if (reconnectTimeouts[sessionKey]) {
      clearTimeout(reconnectTimeouts[sessionKey]);
      reconnectTimeouts[sessionKey] = null;
    }
    if (session.sock) {
      try { session.sock.end(); } catch (e) {}
      session.sock = null;
    }
    clearWhatsAppAuthDir(workspaceId, numSlot);
    session.status = 'disconnected';
    session.currentQR = '';
  } else if (session.status === 'connected' || session.status === 'connecting') {
    return;
  }
  
  session.status = 'connecting';
  session.currentQR = '';

  const authDir = getWhatsAppAuthDir(workspaceId, numSlot);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  // Perfis de navegadores legítimos e autênticos (Padrão Evolution API / Baileys)
  // Cada linha/slot recebe uma assinatura legítima para simular acessos desktop reais e evitar detecção heurística da Meta
  const browserProfiles = [
    Browsers.ubuntu('Chrome'),
    Browsers.windows('Chrome'),
    Browsers.macOS('Desktop'),
    Browsers.macOS('Chrome'),
    Browsers.windows('Desktop')
  ];
  const chosenBrowser = browserProfiles[(numSlot - 1) % browserProfiles.length] || Browsers.ubuntu('Chrome');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    logger: pino({ level: 'silent' }),
    browser: chosenBrowser
  });
  
  session.sock = sock;
  session.slot = numSlot;

  sock.ev.on('creds.update', async () => {
    try {
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
      await saveCreds();
    } catch (err) {
      console.error('Error saving WhatsApp credentials:', err.message);
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`📲 QR Code do WhatsApp (Linha #${numSlot}) gerado para Workspace ${workspaceId}`);
      session.currentQR = qr;
      session.status = 'connecting';
      session.isBanned = false;
      session.banReason = null;
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403;
      const shouldReconnect = !isLoggedOut;
      console.log(`🔌 WhatsApp Linha #${numSlot} desconectado (Workspace ${workspaceId}). Código: ${statusCode}. Reconectar? ${shouldReconnect}`);
      session.status = 'disconnected';
      session.currentQR = '';

      if (shouldReconnect) {
        session.isBanned = false;
        session.banReason = null;
        if (!reconnectTimeouts[sessionKey]) {
          reconnectTimeouts[sessionKey] = setTimeout(() => {
            reconnectTimeouts[sessionKey] = null;
            connectToWhatsApp(workspaceId, false, numSlot);
          }, 3000);
        }
      } else {
        // Se deslogou ou foi banido (401/403/loggedOut)
        session.isBanned = true;
        session.banReason = `Conta deslogada ou bloqueada pela Meta (Status ${statusCode || '401'}).`;
        const bannedPhone = (session.sock?.user?.id || '').split(':')[0].split('@')[0];
        clearWhatsAppAuthDir(workspaceId, numSlot);
        session.sock = null;
        console.log(`⚠️ WhatsApp Linha #${numSlot} desconectado/deslogado pela Meta (Workspace ${workspaceId}). Código: ${statusCode}`);

        // Registra evento de banimento da Meta no banco de dados para auditoria do Administrador
        (async () => {
          try {
            const database = await db.getDB();
            await database.run(
              'INSERT INTO whatsapp_ban_logs (workspace_id, slot, phone, reason, status_code) VALUES (?, ?, ?, ?, ?)',
              [workspaceId, numSlot, bannedPhone || null, `Desconexão/Bloqueio pela Meta (Status ${statusCode || '401'})`, statusCode || 401]
            );
            await database.run(
              'UPDATE workspaces SET banned_whatsapp_count = COALESCE(banned_whatsapp_count, 0) + 1 WHERE id = ?',
              [workspaceId]
            );
          } catch (logErr) {
            console.error('Erro ao registrar log de banimento do WhatsApp:', logErr.message);
          }
        })();
      }
    } else if (connection === 'open') {
      if (reconnectTimeouts[sessionKey]) {
        clearTimeout(reconnectTimeouts[sessionKey]);
        reconnectTimeouts[sessionKey] = null;
      }
      console.log(`✅ WhatsApp Linha #${numSlot} CONECTADO com sucesso para Workspace ${workspaceId}! User:`, sock.user?.id);
      session.status = 'connected';
      session.currentQR = '';
      session.isBanned = false;
      session.banReason = null;
      try {
        sock.sendPresenceUpdate('available').catch(() => {});
      } catch (e) {}
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const messages = m.messages || [];
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        // Envia confirmação de leitura para simular comportamento de app real (Anti-Ban)
        try {
          if (sock && sock.readMessages && msg.key) {
            await sock.readMessages([msg.key]);
          }
        } catch (readErr) {}

        try {
          const database = await db.getDB();
          const settings = await database.get('SELECT allow_stories, allow_ephemeral, allow_groups FROM workspaces WHERE id = ?', [workspaceId]);
          const allowStories = settings ? settings.allow_stories : 1;
          const allowEphemeral = settings ? settings.allow_ephemeral : 1;
          const allowGroups = settings ? settings.allow_groups : 1;

          if (msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid.endsWith('@newsletter')) continue;
          if (!allowStories && msg.key.remoteJid === 'status@broadcast') continue;
          if (!allowGroups && msg.key.remoteJid.endsWith('@g.us')) continue;
          if (!allowEphemeral && msg.message?.ephemeralMessage) continue;
        } catch (e) {
          console.error("Erro ao ler configurações:", e);
        }

        console.log(`\n📩 Nova mensagem recebida pelo WhatsApp do Workspace ${workspaceId} de ${msg.key.remoteJid}!`);
        
        let text = '';
        let msgType = 'text';
        let fileUrl = null;

        let messageContent = msg.message;
        let isViewOnce = false;

        if (messageContent?.ephemeralMessage?.message) {
          messageContent = messageContent.ephemeralMessage.message;
        }
        if (messageContent?.viewOnceMessageV2?.message) {
          messageContent = messageContent.viewOnceMessageV2.message;
          isViewOnce = true;
        } else if (messageContent?.viewOnceMessage?.message) {
          messageContent = messageContent.viewOnceMessage.message;
          isViewOnce = true;
        } else if (messageContent?.documentWithCaptionMessage?.message) {
          messageContent = messageContent.documentWithCaptionMessage.message;
        }

        if (!messageContent) continue;

        if (messageContent.conversation) {
          text = messageContent.conversation;
        } else if (messageContent.extendedTextMessage?.text) {
          text = messageContent.extendedTextMessage.text;
        } else if (messageContent.imageMessage) {
          msgType = 'image';
          text = messageContent.imageMessage.caption || '';
        } else if (messageContent.videoMessage) {
          msgType = 'video';
          text = messageContent.videoMessage.caption || '';
        } else if (messageContent.audioMessage) {
          msgType = 'audio';
          text = '';
        } else if (messageContent.documentMessage) {
          msgType = 'file';
          text = messageContent.documentMessage.caption || messageContent.documentMessage.fileName || '';
        } else if (messageContent.buttonsResponseMessage?.selectedButtonId) {
          text = messageContent.buttonsResponseMessage.selectedDisplayText || messageContent.buttonsResponseMessage.selectedButtonId;
        } else if (messageContent.templateButtonReplyMessage?.selectedId) {
          text = messageContent.templateButtonReplyMessage.selectedDisplayText || messageContent.templateButtonReplyMessage.selectedId;
        } else if (messageContent.listResponseMessage?.singleSelectReply?.selectedRowId) {
          text = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
        }

        if (isViewOnce && text) {
          text = `[Visualização Única Capturada] ${text}`.trim();
        }

        const mediaMsg = messageContent.imageMessage || messageContent.videoMessage || messageContent.audioMessage || messageContent.documentMessage;
        if (mediaMsg) {
          try {
            const downloadableMsg = { key: msg.key, message: messageContent };
            const buffer = await downloadMediaMessage(
              downloadableMsg,
              'buffer',
              {},
              { logger: pino({ level: 'silent' }) }
            );
            
            const mime = mediaMsg.mimetype || '';
            let ext = '';
            if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
            else if (mime.includes('png')) ext = '.png';
            else if (mime.includes('webp')) ext = '.webp';
            else if (mime.includes('mp4')) ext = '.mp4';
            else if (mime.includes('ogg')) ext = '.ogg';
            else if (mime.includes('mpeg') || mime.includes('mp3')) ext = '.mp3';
            else if (mime.includes('pdf')) ext = '.pdf';

            const fileName = `${Date.now()}_${msg.key.id}${ext}`;
            fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buffer);
            fileUrl = '/uploads/' + fileName;
          } catch (err) {
            console.error('Error downloading media', err);
          }
        }

        if (text || fileUrl) {
          const rawTimestamp = msg.messageTimestamp;
          const timestampNum = typeof rawTimestamp === 'object' && rawTimestamp !== null
            ? (rawTimestamp.low || Math.floor(Date.now() / 1000))
            : (Number(rawTimestamp) || Math.floor(Date.now() / 1000));

          const msgObj = {
            id: msg.key.id,
            from: msg.key.remoteJid,
            fromMe: false,
            text: text,
            type: msgType,
            fileUrl: fileUrl,
            timestamp: timestampNum,
            pushName: msg.pushName || ''
          };
          
          try {
            await saveMessageToDB(workspaceId, msgObj);
            console.log(`💬 Mensagem salva de [${msgObj.from}]: "${msgObj.text}"`);

            // Tratamento de Opt-Out inteligente (Anti-Ban: impede reenvio a quem não quer mensagens)
            try {
              const optOutWords = ['sair', 'parar', 'cancelar', 'stop', 'descadastrar', 'não quero', 'nao quero'];
              const normalizedMsg = (msgObj.text || '').trim().toLowerCase();
              if (optOutWords.includes(normalizedMsg)) {
                const database = await db.getDB();
                const digits = msgObj.from.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
                if (digits) {
                  await database.run(
                    "UPDATE contacts SET status = 'Opt-out' WHERE workspace_id = ? AND (phone LIKE ? OR phone LIKE ?)",
                    [workspaceId, `%${digits.slice(-8)}%`, `%${digits}%`]
                  );
                  console.log(`🚫 [Anti-Ban] Contato ${msgObj.from} solicitou Opt-out ('${normalizedMsg}'). Status atualizado no CRM para evitar novos disparos.`);
                }
              }
            } catch (optErr) {
              console.error('Erro ao processar opt-out:', optErr.message);
            }

            // Identifica e cadastra automaticamente o contato no CRM se não existir
            try {
              const reminderService = require('./reminder_service');
              await reminderService.autoRegisterContact(workspaceId, {
                jid: msgObj.from,
                pushName: msgObj.pushName,
                text: msgObj.text
              });
            } catch (regErr) {
              console.error('Erro no auto-registro de contato:', regErr);
            }

            // Verifica se há coleta ativa de contrato para este contato
            try {
              const contractService = require('./contract_service');
              const handled = await contractService.handleInboundContractAnswer(workspaceId, msgObj.from, msgObj.text);
              if (handled) {
                console.log(`📄 Resposta de contrato processada com sucesso para ${msgObj.from}`);
                continue;
              }
            } catch (contractErr) {
              console.error('Erro ao verificar coleta de contrato:', contractErr);
            }

            // Verifica se é confirmação de reuniões do gestor (Briefing Sofia)
            try {
              const briefingService = require('./briefing_service');
              const handledBriefing = await briefingService.handleInboundConfirmation(workspaceId, msgObj.from, msgObj.text);
              if (handledBriefing) {
                console.log(`👔 Resposta de confirmação de briefing processada para o gestor em ${msgObj.from}`);
                continue;
              }
            } catch (briefingErr) {
              console.error('Erro ao verificar confirmação de briefing:', briefingErr);
            }

            // Check if AI agent or automation is assigned
            const database = await db.getDB();
            const assignment = await database.get('SELECT agent_id FROM chat_assignments WHERE workspace_id = ? AND remote_jid = ?', [workspaceId, msgObj.from]);
            
            let targetToRespond = null;
            if (assignment && assignment.agent_id && assignment.agent_id !== 'none') {
              targetToRespond = assignment.agent_id;
            } else if (!assignment || assignment.agent_id !== 'none') {
              // If no specific assignment, check if global auto_respond_all is enabled
              const ws = await database.get('SELECT auto_respond_all, auto_respond_type, auto_respond_target_id FROM workspaces WHERE id = ?', [workspaceId]);
              if (ws && ws.auto_respond_all && ws.auto_respond_target_id && ws.auto_respond_target_id !== 'none') {
                targetToRespond = ws.auto_respond_target_id;
              }
            }

            if (targetToRespond) {
              console.log(`🎯 Disparando IA (Target: ${targetToRespond}) para responder ${msgObj.from}...`);
              await aiHandler.processMessage(workspaceId, msgObj, targetToRespond);
            } else {
              console.log(`ℹ️ Nenhum agente ou automação configurado para responder o chat ${msgObj.from}`);
            }
          } catch (e) {
            console.error('Erro ao processar mensagem recebida ou IA:', e);
          }
        }
      }
    }
  });
}

function getSlotInfo(workspaceId, slot = 1) {
  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);
  const session = sessions[sessionKey];
  const rawUserId = session?.sock?.user?.id || '';
  const phone = rawUserId ? rawUserId.split(':')[0].split('@')[0] : '';
  const name = session?.sock?.user?.name || '';
  return {
    slot: numSlot,
    label: numSlot === 1 ? 'Linha 1 (Principal)' : `Linha ${numSlot}`,
    status: session?.status || 'disconnected',
    isBanned: !!session?.isBanned,
    banReason: session?.banReason || null,
    qr: session?.currentQR || '',
    phone,
    name,
    user: session?.sock?.user ? { id: session.sock.user.id, name: session.sock.user.name, phone } : null
  };
}

function getConnectedSlots(workspaceId) {
  const connected = [];
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const info = getSlotInfo(workspaceId, s);
    if (info.status === 'connected') {
      connected.push(info);
    }
  }
  return connected;
}

function getStatus(workspaceId, requestedSlot) {
  const slots = [];
  for (let s = 1; s <= MAX_SLOTS; s++) {
    slots.push(getSlotInfo(workspaceId, s));
  }

  const connectedSlots = slots.filter(s => s.status === 'connected');
  const connectingSlots = slots.filter(s => s.status === 'connecting');

  // Se um slot específico foi consultado, retorna o status e QR dele junto com a lista completa de slots
  if (requestedSlot) {
    const target = slots.find(s => s.slot === normalizeSlot(requestedSlot)) || slots[0];
    return {
      status: target.status,
      qr: target.qr,
      user: target.user,
      slot: target.slot,
      connectedCount: connectedSlots.length,
      slots
    };
  }

  const overallStatus = connectedSlots.length > 0
    ? 'connected'
    : (connectingSlots.length > 0 ? 'connecting' : 'disconnected');
  const primary = connectedSlots[0] || connectingSlots[0] || slots[0];

  return {
    status: overallStatus,
    qr: primary?.qr || '',
    user: primary?.user || null,
    connectedCount: connectedSlots.length,
    slots
  };
}

function getSocket(workspaceId, slot = 1) {
  const targetKey = getSessionKey(workspaceId, slot);
  if (sessions[targetKey]?.sock && sessions[targetKey]?.status === 'connected') {
    return sessions[targetKey].sock;
  }
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const key = getSessionKey(workspaceId, s);
    if (sessions[key]?.sock && sessions[key]?.status === 'connected') {
      return sessions[key].sock;
    }
  }
  return sessions[targetKey]?.sock || null;
}

function pickNextConnectedSlot(workspaceId, preferredSlot) {
  const connected = getConnectedSlots(workspaceId);
  if (connected.length === 0) return null;

  if (preferredSlot) {
    const found = connected.find(c => c.slot === normalizeSlot(preferredSlot));
    if (found) return found.slot;
  }

  const cursor = roundRobinCounters[workspaceId] || 0;
  const chosen = connected[cursor % connected.length];
  roundRobinCounters[workspaceId] = cursor + 1;
  return chosen.slot;
}

async function saveMessageToDB(workspaceId, msgObj) {
  const database = await db.getDB();
  await database.run(
    `INSERT OR REPLACE INTO messages (id, workspace_id, remote_jid, from_me, text, type, file_url, timestamp, push_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msgObj.id,
      workspaceId,
      msgObj.from,
      msgObj.fromMe ? 1 : 0,
      msgObj.text,
      msgObj.type,
      msgObj.fileUrl,
      msgObj.timestamp,
      msgObj.pushName
    ]
  );
}

async function getMessages(workspaceId) {
  const database = await db.getDB();
  const rows = await database.all('SELECT * FROM messages WHERE workspace_id = ? ORDER BY timestamp ASC', [workspaceId]);
  
  // Mapeia contatos cadastrados para preencher nomes reais nos chats
  let contactMap = {};
  try {
    const contacts = await database.all('SELECT name, phone FROM contacts WHERE workspace_id = ?', [workspaceId]);
    contacts.forEach(c => {
      if (c.phone && c.name) {
        const digits = c.phone.replace(/\D/g, '');
        if (digits) {
          contactMap[digits] = c.name;
          if (digits.length >= 8) contactMap[digits.slice(-8)] = c.name;
        }
      }
    });
  } catch (e) {}

  return rows.map(r => {
    let resolvedName = r.push_name;
    if (!resolvedName || resolvedName === 'Me' || resolvedName === 'Você' || resolvedName.includes('@')) {
      const cleanDigits = (r.remote_jid || '').replace(/\D/g, '');
      if (cleanDigits && (contactMap[cleanDigits] || contactMap[cleanDigits.slice(-8)])) {
        resolvedName = contactMap[cleanDigits] || contactMap[cleanDigits.slice(-8)];
      }
    }

    return {
      id: r.id,
      from: r.remote_jid,
      fromMe: r.from_me === 1,
      text: r.text,
      type: r.type || 'text',
      fileUrl: r.file_url,
      timestamp: typeof r.timestamp === 'number' ? r.timestamp : Math.floor(new Date(r.timestamp).getTime() / 1000) || Math.floor(Date.now() / 1000),
      pushName: resolvedName || (r.remote_jid ? r.remote_jid.split('@')[0] : 'Contato')
    };
  });
}

async function disconnectWhatsApp(workspaceId, slot = 1) {
  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);
  if (reconnectTimeouts[sessionKey]) {
    clearTimeout(reconnectTimeouts[sessionKey]);
    reconnectTimeouts[sessionKey] = null;
  }
  const session = sessions[sessionKey];
  if (session && session.sock) {
    try {
      await session.sock.logout();
    } catch (e) {
      try { session.sock.end(); } catch (err) {}
    }
    session.sock = null;
  }
  clearWhatsAppAuthDir(workspaceId, numSlot);
  sessions[sessionKey] = { sock: null, status: 'disconnected', currentQR: '', messages: [], slot: numSlot };
  console.log(`🚪 WhatsApp (Linha #${numSlot}) desconectado e credenciais limpas para Workspace ${workspaceId}`);
  return { success: true, slot: numSlot, message: `WhatsApp Linha #${numSlot} desconectado com sucesso` };
}

async function sendMessageRaw(workspaceId, jid, text, file, contactName = '', options = {}) {
  // Valida cota de mensagens e bloqueio da conta/workspace antes de enviar
  const { checkMessageQuota } = require('./quota_service');
  await checkMessageQuota(workspaceId);

  const chosenSlot = options._chosenSlot || pickNextConnectedSlot(workspaceId, options.slot) || 1;
  const sessionKey = getSessionKey(workspaceId, chosenSlot);
  const session = sessions[sessionKey];
  if (!session || session.status !== 'connected' || !session.sock) {
    throw new Error('WhatsApp não está conectado. Conecte o WhatsApp no menu Conexões antes de enviar mensagens.');
  }
  const senderPhone = (session.sock?.user?.id || '').split(':')[0].split('@')[0];

  let cleanJid = (jid || '').trim();
  if (!cleanJid || cleanJid === '@s.whatsapp.net' || cleanJid === '@lid') {
    throw new Error('Número de telefone não informado ou inválido para WhatsApp');
  }

  // Obtém o DDI padrão configurado no Workspace (padrão '66' para Tailândia)
  let defaultDdi = '66';
  try {
    const database = await db.getDB();
    const ws = await database.get('SELECT default_ddi FROM workspaces WHERE id = ?', [workspaceId]);
    if (ws && ws.default_ddi) defaultDdi = ws.default_ddi;
  } catch (e) {}

  // Resolve candidatos e formato E.164 universal
  const { primaryJid, candidates, ddi } = getWhatsAppCandidates(cleanJid, defaultDdi);
  cleanJid = primaryJid;

  // Se for @lid ou @telegram, não precisa verificar via onWhatsApp
  if (!cleanJid.endsWith('@lid') && !cleanJid.endsWith('@telegram')) {
    // 1. Se for Brasil, tenta resolver para LID se houver mapeamento
    if (ddi === '55') {
      try {
        const { resolveRemoteJidForPhone } = require('./reminder_service');
        const digits = cleanJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        const resolvedLid = resolveRemoteJidForPhone(workspaceId, digits);
        if (resolvedLid && resolvedLid.endsWith('@lid')) {
          cleanJid = resolvedLid;
        }
      } catch (e) {}
    }

    // 2. Se for @s.whatsapp.net, valida e resolve JID exato via onWhatsApp
    if (cleanJid.endsWith('@s.whatsapp.net')) {
      let verifiedJid = null;
      let checkedExists = null;
      try {
        const results = await session.sock.onWhatsApp(...candidates);
        if (Array.isArray(results) && results.length > 0) {
          const active = results.find(r => r.exists);
          if (active && active.jid) {
            verifiedJid = active.jid;
            checkedExists = true;
          } else {
            checkedExists = false;
          }
        }
      } catch (err) {
        console.warn('Aviso: Verificação onWhatsApp falhou:', err.message);
      }

      // Se o WhatsApp confirmou que o número não existe, NÃO dispara para evitar ban por spam/prospecção cega
      if (checkedExists === false) {
        throw new Error('Número não possui conta ativa no WhatsApp (ignorado para proteção anti-ban)');
      }

      if (verifiedJid) {
        console.log(`[WhatsApp] JID validado com sucesso via onWhatsApp: ${verifiedJid}`);
        cleanJid = verifiedJid;
      }
    }
  }

  console.log(`[WhatsApp] Enviando mensagem para JID final: ${cleanJid} (workspace: ${workspaceId})`);

  let messageOptions = { text: text || '' };
  let msgType = 'text';
  let fileUrl = null;

  if (file) {
    let filePath = file.path;
    let mimetype = file.mimetype;

    // Convert audio to ogg/opus to be recognized as WhatsApp voice note
    if (mimetype.startsWith('audio/')) {
      try {
        filePath = await convertToOgg(filePath);
        mimetype = 'audio/ogg; codecs=opus';
        file.filename = path.basename(filePath);
      } catch (err) {
        console.error('Error converting audio:', err);
      }
    }

    const buffer = fs.readFileSync(filePath);
    
    if (mimetype.startsWith('image/')) {
      messageOptions = { image: buffer, caption: text };
      msgType = 'image';
    } else if (mimetype.startsWith('audio/')) {
      messageOptions = { audio: buffer, mimetype: 'audio/mp4', ptt: true };
      msgType = 'audio';
    } else if (mimetype.startsWith('video/')) {
      messageOptions = { video: buffer, caption: text };
      msgType = 'video';
    } else {
      messageOptions = { document: buffer, mimetype: mimetype, fileName: file.originalname, caption: text };
      msgType = 'file';
    }
    fileUrl = '/uploads/' + file.filename;
  }

  // Simulação de presença humana completa (Anti-Ban padrão Evolution API)
  const simulateTyping = options.simulateTyping !== false;
  if (simulateTyping && session.sock) {
    try {
      const isAudio = msgType === 'audio';
      // 1. Inscreve na presença do contato (simula que o usuário abriu a conversa no WhatsApp Web)
      await session.sock.presenceSubscribe(cleanJid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 200 + Math.floor(Math.random() * 300)));

      // 2. Sinaliza presença online (available)
      await session.sock.sendPresenceUpdate('available').catch(() => {});
      
      // 3. Sinaliza "digitando..." (composing) ou "gravando áudio..." (recording)
      await session.sock.sendPresenceUpdate(isAudio ? 'recording' : 'composing', cleanJid).catch(() => {});
      
      // 4. Tempo humano realista proporcional ao tamanho da mensagem
      // Mínimo 1.8s, máx 5.2s (~35ms por caractere + jitter aleatório de 600-1200ms)
      const baseChars = (text || '').length || 30;
      const calculatedDuration = Math.min(Math.max(baseChars * 35, 1800), 5200);
      const jitter = Math.floor(Math.random() * 800);
      const typingMs = options.typingDurationMs || (calculatedDuration + jitter);
      
      await new Promise(resolve => setTimeout(resolve, typingMs));
      
      // 5. Pausa a digitação antes do envio (comportamento natural de releitura humana antes de enviar)
      await session.sock.sendPresenceUpdate('paused', cleanJid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 300 + Math.floor(Math.random() * 400)));
    } catch (presenceErr) {
      console.warn('[WhatsApp] Erro não-bloqueante ao atualizar presença:', presenceErr.message);
    }
  }

  // Aplica micro-variação Anti-Hash invisível (exclusividade criptográfica de byte-sequence)
  if (options.enableAntiHash !== false && text && msgType === 'text') {
    try {
      const { applyAntiHashJitter } = require('./antiban');
      text = applyAntiHashJitter(text);
      messageOptions.text = text;
    } catch (e) {}
  }

  const sentMsg = await session.sock.sendMessage(cleanJid, messageOptions);
  
  // Resolve nome do contato para o histórico
  let pushName = (contactName || '').trim();
  if (!pushName) {
    try {
      const database = await db.getDB();
      const phoneDigits = cleanJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace(/\D/g, '');
      if (phoneDigits) {
        const ct = await database.get(
          'SELECT name FROM contacts WHERE workspace_id = ? AND (phone LIKE ? OR phone LIKE ?) LIMIT 1',
          [workspaceId, `%${phoneDigits.slice(-8)}%`, `%${phoneDigits}%`]
        );
        if (ct && ct.name) pushName = ct.name;
      }
    } catch (e) {}
  }

  const msgObj = {
    id: sentMsg.key.id,
    from: cleanJid,
    fromMe: true,
    text: text || file?.originalname || '',
    type: msgType,
    fileUrl: fileUrl,
    timestamp: Math.floor(Date.now() / 1000),
    pushName: pushName || cleanJid.split('@')[0]
  };
  await saveMessageToDB(workspaceId, msgObj).catch(err => {
    console.error('Erro ao salvar mensagem no DB:', err.message);
  });

  if (sentMsg && typeof sentMsg === 'object') {
    sentMsg.usedSlot = chosenSlot;
    sentMsg.usedPhone = senderPhone;
  }
  return sentMsg;
}

// Envio protegido pela política anti-ban com rodízio automático entre até 3 números de WhatsApp conectados
function sendMessage(workspaceId, jid, text, file, contactName = '', options = {}) {
  const chosenSlot = pickNextConnectedSlot(workspaceId, options.slot) || 1;
  const antibanKey = `${workspaceId}_slot${chosenSlot}`;
  return require('./antiban').run('whatsapp', antibanKey, () =>
    sendMessageRaw(workspaceId, jid, text, file, contactName, { ...options, _chosenSlot: chosenSlot })
  );
}

async function getProfilePicUrl(workspaceId, jid) {
  const sock = getSocket(workspaceId);
  if (!sock) {
    return null;
  }
  try {
    return await sock.profilePictureUrl(jid, 'image');
  } catch (err) {
    return null;
  }
}

function hasSavedCredentials(workspaceId, slot = 1) {
  try {
    const authDir = getWhatsAppAuthDir(workspaceId, slot);
    return fs.existsSync(path.join(authDir, 'creds.json'));
  } catch {
    return false;
  }
}

function getSavedSlots(workspaceId) {
  const saved = [];
  for (let s = 1; s <= MAX_SLOTS; s++) {
    if (hasSavedCredentials(workspaceId, s)) {
      saved.push(s);
    }
  }
  return saved;
}

module.exports = { 
  MAX_SLOTS,
  connectToWhatsApp, 
  disconnectWhatsApp,
  getSocket, 
  getStatus, 
  getConnectedSlots,
  getMessages, 
  sendMessage, 
  getProfilePicUrl, 
  hasSavedCredentials,
  getSavedSlots
};
