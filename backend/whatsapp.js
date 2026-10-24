const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { convertToOgg } = require('./audio_converter');
const aiHandler = require('./ai_handler');
const { getWhatsAppAuthDir, clearWhatsAppAuthDir, UPLOADS_DIR } = require('./storage');
const { normalizePhone, getWhatsAppCandidates } = require('./phone_utils');

const sessions = {}; 
let reconnectTimeouts = {};

async function connectToWhatsApp(workspaceId, forceNew = false) {
  if (!sessions[workspaceId]) {
    sessions[workspaceId] = { sock: null, status: 'disconnected', currentQR: '', messages: [] };
  }

  const session = sessions[workspaceId];
  if (forceNew) {
    if (reconnectTimeouts[workspaceId]) {
      clearTimeout(reconnectTimeouts[workspaceId]);
      reconnectTimeouts[workspaceId] = null;
    }
    if (session.sock) {
      try { session.sock.end(); } catch (e) {}
      session.sock = null;
    }
    clearWhatsAppAuthDir(workspaceId);
    session.status = 'disconnected';
    session.currentQR = '';
  } else if (session.status === 'connected' || session.status === 'connecting') {
    return;
  }
  
  session.status = 'connecting';
  session.currentQR = '';

  const authDir = getWhatsAppAuthDir(workspaceId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Unico CRM', 'Chrome', '1.0.0']
  });
  
  session.sock = sock;

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
      console.log(`📲 QR Code do WhatsApp gerado para Workspace ${workspaceId}`);
      session.currentQR = qr;
      session.status = 'connecting';
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`🔌 WhatsApp desconectado (Workspace ${workspaceId}). Código: ${statusCode}. Reconectar? ${shouldReconnect}`);
      session.status = 'disconnected';
      session.currentQR = '';
      if (shouldReconnect) {
        if (!reconnectTimeouts[workspaceId]) {
          reconnectTimeouts[workspaceId] = setTimeout(() => {
            reconnectTimeouts[workspaceId] = null;
            connectToWhatsApp(workspaceId);
          }, 3000);
        }
      } else {
        // Se deslogou (401), apagar as pastas de sessão para permitir nova leitura de QR code
        clearWhatsAppAuthDir(workspaceId);
        session.sock = null;
        console.log(`🧹 Sessão expirada/deslogada limpa com sucesso para Workspace ${workspaceId}.`);
      }
    } else if (connection === 'open') {
      if (reconnectTimeouts[workspaceId]) {
        clearTimeout(reconnectTimeouts[workspaceId]);
        reconnectTimeouts[workspaceId] = null;
      }
      console.log(`✅ WhatsApp CONECTADO com sucesso para Workspace ${workspaceId}! User:`, sock.user?.id);
      session.status = 'connected';
      session.currentQR = '';
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const messages = m.messages || [];
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
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

function getStatus(workspaceId) {
  const session = sessions[workspaceId];
  if (!session) return { status: 'disconnected', qr: '', user: null };
  return { 
    status: session.status, 
    qr: session.currentQR,
    user: session.sock?.user ? { id: session.sock.user.id, name: session.sock.user.name } : null 
  };
}

function getSocket(workspaceId) {
  return sessions[workspaceId]?.sock;
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

async function disconnectWhatsApp(workspaceId) {
  if (reconnectTimeouts[workspaceId]) {
    clearTimeout(reconnectTimeouts[workspaceId]);
    reconnectTimeouts[workspaceId] = null;
  }
  const session = sessions[workspaceId];
  if (session && session.sock) {
    try {
      await session.sock.logout();
    } catch (e) {
      try { session.sock.end(); } catch (err) {}
    }
    session.sock = null;
  }
  clearWhatsAppAuthDir(workspaceId);
  sessions[workspaceId] = { sock: null, status: 'disconnected', currentQR: '', messages: [] };
  console.log(`🚪 WhatsApp desconectado e credenciais limpas para Workspace ${workspaceId}`);
  return { success: true, message: 'WhatsApp desconectado com sucesso' };
}

async function sendMessage(workspaceId, jid, text, file, contactName = '') {
  const session = sessions[workspaceId];
  if (!session || session.status !== 'connected' || !session.sock) {
    throw new Error('WhatsApp não está conectado. Conecte o WhatsApp no menu Conexões antes de enviar mensagens.');
  }

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
      try {
        const results = await session.sock.onWhatsApp(...candidates);
        if (Array.isArray(results) && results.length > 0) {
          const active = results.find(r => r.exists);
          if (active && active.jid) {
            verifiedJid = active.jid;
          }
        }
      } catch (err) {
        console.warn('Aviso: Verificação onWhatsApp falhou:', err.message);
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

  return sentMsg;
}

async function getProfilePicUrl(workspaceId, jid) {
  const session = sessions[workspaceId];
  if (!session || session.status !== 'connected' || !session.sock) {
    return null;
  }
  try {
    return await session.sock.profilePictureUrl(jid, 'image');
  } catch (err) {
    return null;
  }
}

function hasSavedCredentials(workspaceId) {
  try {
    const authDir = getWhatsAppAuthDir(workspaceId);
    return fs.existsSync(path.join(authDir, 'creds.json'));
  } catch {
    return false;
  }
}

module.exports = { 
  connectToWhatsApp, 
  disconnectWhatsApp,
  getSocket, 
  getStatus, 
  getMessages, 
  sendMessage, 
  getProfilePicUrl, 
  hasSavedCredentials 
};
