const { Telegraf } = require('telegraf');
const db = require('./db');
const aiHandler = require('./ai_handler');

// Mapeia workspace_id para sua respectiva conexão
const sessions = {}; 

async function connectToTelegram(workspaceId, token) {
  let cleanToken = token ? token.trim() : null;

  // Se não foi passado token no parâmetro, busca do banco de dados
  if (!cleanToken) {
    try {
      const database = await db.getDB();
      const ws = await database.get('SELECT telegram_token FROM workspaces WHERE id = ?', [workspaceId]);
      if (ws && ws.telegram_token && ws.telegram_token.trim()) {
        cleanToken = ws.telegram_token.trim();
      }
    } catch (e) {
      console.error('Erro ao buscar token salvo do Telegram:', e);
    }
  }

  if (!cleanToken) return { success: false, error: 'Token não fornecido' };

  // Salva imediatamente no banco SQLite de forma preventiva para NUNCA perder
  try {
    const database = await db.getDB();
    await database.run('UPDATE workspaces SET telegram_token = ? WHERE id = ?', [cleanToken, workspaceId]);
    console.log(`💾 Token do Telegram salvo preventivamente no banco para Workspace ${workspaceId}`);
  } catch (dbErr) {
    console.error('Erro ao salvar token preventivo do Telegram:', dbErr);
  }

  if (!sessions[workspaceId]) {
    sessions[workspaceId] = { bot: null, status: 'disconnected', botInfo: null, token: cleanToken };
  }
  
  const session = sessions[workspaceId];
  session.token = cleanToken;
  session.status = 'connecting';

  try {
    if (session.bot) {
      try {
        session.bot.stop('RESTART');
      } catch (stopErr) {
        console.warn(`[Telegram] Aviso ao parar bot existente (Workspace ${workspaceId}):`, stopErr.message);
      }
      session.bot = null;
    }

    const bot = new Telegraf(cleanToken);

    // Valida o token chamando getMe() antes de declarar sucesso
    const botInfo = await bot.telegram.getMe();
    console.log(`🤖 Bot Telegram validado: @${botInfo.username} (${botInfo.first_name}) para Workspace ${workspaceId}`);

    bot.start((ctx) => {
      ctx.reply('Olá! Bem-vindo ao atendimento do Unico CRM.');
    });

    bot.on('message', async (ctx) => {
      console.log(`\n✈️ Nova mensagem do Telegram no Workspace ${workspaceId}!`);
      
      const message = ctx.message;
      if (!message || (!message.text && !message.photo && !message.video && !message.voice && !message.document)) return;

      const remoteJid = message.chat.id.toString();
      const pushName = message.from.first_name + (message.from.last_name ? ' ' + message.from.last_name : '');
      const timestamp = message.date;
      const messageId = message.message_id.toString() + '_' + remoteJid;

      let text = message.text || message.caption || '';
      let type = 'text';
      let fileUrl = null;

      try {
        if (message.photo) {
          type = 'image';
          // Telegram photos are arrays, get the highest quality one
          const fileId = message.photo[message.photo.length - 1].file_id;
          fileUrl = await ctx.telegram.getFileLink(fileId);
        } else if (message.video) {
          type = 'video';
          fileUrl = await ctx.telegram.getFileLink(message.video.file_id);
        } else if (message.voice) {
          type = 'audio';
          fileUrl = await ctx.telegram.getFileLink(message.voice.file_id);
        } else if (message.document) {
          type = 'file';
          fileUrl = await ctx.telegram.getFileLink(message.document.file_id);
        }
      } catch (fileErr) {
        console.error('Erro ao obter link do arquivo no Telegram:', fileErr);
      }

      const msgObj = {
        id: messageId,
        from: remoteJid + '@telegram', // Suffix to distinguish from WA
        fromMe: false,
        text: text,
        type: type,
        fileUrl: fileUrl ? fileUrl.toString() : null,
        timestamp: timestamp,
        pushName: pushName
      };

      try {
        const database = await db.getDB();
        await database.run(
          `INSERT OR IGNORE INTO messages (id, workspace_id, remote_jid, from_me, text, type, file_url, timestamp, push_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            msgObj.id,
            workspaceId,
            msgObj.from,
            0,
            msgObj.text,
            msgObj.type,
            msgObj.fileUrl,
            msgObj.timestamp,
            msgObj.pushName
          ]
        );
        console.log(`💬 Mensagem salva do Telegram [${msgObj.from}]: "${msgObj.text}"`);

        // Identifica e cadastra automaticamente o contato no CRM se não existir
        try {
          const reminderService = require('./reminder_service');
          await reminderService.autoRegisterContact(workspaceId, {
            jid: msgObj.from,
            pushName: msgObj.pushName,
            text: msgObj.text
          });
        } catch (regErr) {
          console.error('Erro no auto-registro de contato Telegram:', regErr);
        }

        // Check for AI or automation assignment
        const assignment = await database.get('SELECT agent_id FROM chat_assignments WHERE workspace_id = ? AND remote_jid = ?', [workspaceId, msgObj.from]);
        let targetToRespond = null;
        if (assignment && assignment.agent_id && assignment.agent_id !== 'none') {
          targetToRespond = assignment.agent_id;
        } else if (!assignment || assignment.agent_id !== 'none') {
          const ws = await database.get('SELECT auto_respond_all, auto_respond_type, auto_respond_target_id FROM workspaces WHERE id = ?', [workspaceId]);
          if (ws && ws.auto_respond_all && ws.auto_respond_target_id && ws.auto_respond_target_id !== 'none') {
            targetToRespond = ws.auto_respond_target_id;
          }
        }

        if (targetToRespond) {
          await aiHandler.processMessage(workspaceId, msgObj, targetToRespond);
        }
      } catch (err) {
        console.error('Erro ao salvar mensagem do Telegram:', err);
      }
    });

    bot.catch((err) => {
      console.error(`❌ Erro no Telegraf Bot (Workspace ${workspaceId}):`, err.message);
    });

    bot.launch({ dropPendingUpdates: true }).catch((err) => {
      console.error(`❌ Erro no polling do Telegram (Workspace ${workspaceId}):`, err.message);
      if (sessions[workspaceId]) {
        sessions[workspaceId].status = 'disconnected';
      }
    });

    session.bot = bot;
    session.status = 'connected';
    session.botInfo = botInfo;
    session.token = cleanToken;

    process.once('SIGINT', () => {
      try { bot.stop('SIGINT'); } catch (e) {}
    });
    process.once('SIGTERM', () => {
      try { bot.stop('SIGTERM'); } catch (e) {}
    });

    return { success: true, botInfo };
  } catch (error) {
    console.error(`❌ Erro ao conectar no Telegram (Workspace ${workspaceId}):`, error);
    if (session) {
      session.status = 'disconnected';
      session.bot = null;
      session.botInfo = null;
    }
    return { success: false, error: error.message || 'Token inválido ou recusado pelo Telegram' };
  }
}

async function saveToken(workspaceId, token) {
  const cleanToken = token ? token.trim() : null;
  const database = await db.getDB();
  await database.run('UPDATE workspaces SET telegram_token = ? WHERE id = ?', [cleanToken, workspaceId]);
  if (sessions[workspaceId]) {
    sessions[workspaceId].token = cleanToken;
  }
  console.log(`💾 Token do Telegram atualizado no banco (Workspace ${workspaceId})`);
  return { success: true };
}

async function getStatus(workspaceId) {
  let session = sessions[workspaceId];

  let savedToken = null;
  try {
    const database = await db.getDB();
    const ws = await database.get('SELECT telegram_token FROM workspaces WHERE id = ?', [workspaceId]);
    if (ws && ws.telegram_token && ws.telegram_token.trim()) {
      savedToken = ws.telegram_token.trim();
    }
  } catch (dbErr) {
    console.error('Erro ao consultar telegram_token no banco:', dbErr);
  }

  // Se a sessão em memória não está conectada nem conectando, mas temos token salvo no banco, tentar auto-conectar
  if ((!session || session.status === 'disconnected') && savedToken) {
    try {
      console.log(`🔄 Auto-reconectando Telegram para Workspace ${workspaceId} via getStatus com token salvo...`);
      const connectResult = await connectToTelegram(workspaceId, savedToken);
      if (connectResult.success) {
        session = sessions[workspaceId];
      }
    } catch (e) {
      console.error('Falha ao auto-conectar Telegram durante getStatus:', e.message);
    }
  }

  return {
    status: session && session.status === 'connected' ? 'connected' : (session ? session.status : 'disconnected'),
    token: savedToken || (session ? session.token : null) || null,
    botInfo: session && session.botInfo ? session.botInfo : null
  };
}

async function disconnectTelegram(workspaceId, clearToken = false) {
  try {
    const session = sessions[workspaceId];
    if (session && session.bot) {
      try {
        session.bot.stop('DISCONNECT');
      } catch (e) {
        console.warn('Aviso ao parar bot no disconnect:', e.message);
      }
    }

    // Preserva o token na sessão a não ser que clearToken seja explicitamente true
    const preservedToken = clearToken ? null : (session?.token || null);
    sessions[workspaceId] = { bot: null, status: 'disconnected', botInfo: null, token: preservedToken };

    if (clearToken) {
      const database = await db.getDB();
      await database.run('UPDATE workspaces SET telegram_token = NULL WHERE id = ?', [workspaceId]);
      console.log(`🔌 Telegram desconectado e token removido do banco (Workspace ${workspaceId})`);
    } else {
      console.log(`🔌 Bot do Telegram parado, token mantido no banco de dados para reconexão futura (Workspace ${workspaceId})`);
    }

    return { success: true };
  } catch (err) {
    console.error(`Erro ao desconectar Telegram (Workspace ${workspaceId}):`, err);
    return { success: false, error: err.message };
  }
}

async function sendMessage(workspaceId, jid, text, file) {
  let session = sessions[workspaceId];
  if (!session || session.status !== 'connected' || !session.bot) {
    const database = await db.getDB();
    const ws = await database.get('SELECT telegram_token FROM workspaces WHERE id = ?', [workspaceId]);
    if (ws && ws.telegram_token) {
      await connectToTelegram(workspaceId, ws.telegram_token);
      session = sessions[workspaceId];
    }
  }

  if (!session || session.status !== 'connected' || !session.bot) {
    throw new Error('Telegram is not connected');
  }

  const chatId = jid.replace('@telegram', '');
  
  if (file) {
    const filePath = file.path;
    const mimetype = file.mimetype;
    if (mimetype.startsWith('image/')) {
       await session.bot.telegram.sendPhoto(chatId, { source: filePath }, { caption: text });
    } else {
       await session.bot.telegram.sendDocument(chatId, { source: filePath }, { caption: text });
    }
  } else {
    if (text) {
      await session.bot.telegram.sendMessage(chatId, text);
    }
  }

  // Save to DB
  const database = await db.getDB();
  const messageId = Date.now().toString() + '_' + jid;
  await database.run(
    `INSERT INTO messages (id, workspace_id, remote_jid, from_me, text, type, file_url, timestamp, push_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      messageId,
      workspaceId,
      jid,
      1,
      text || '',
      file ? (file.mimetype.startsWith('image/') ? 'image' : 'file') : 'text',
      null,
      Math.floor(Date.now() / 1000),
      'Você'
    ]
  );

  return { success: true, messageId };
}

module.exports = { connectToTelegram, getStatus, sendMessage, disconnectTelegram, saveToken };

