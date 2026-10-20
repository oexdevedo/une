const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('./db');

// Configuração padrão de App ID e Hash (Telegram Web / Desktop oficial)
// Pode ser customizado via .env ou informado pelo usuário no Workspace
const DEFAULT_API_ID = parseInt(process.env.TELEGRAM_API_ID || '2040', 10);
const DEFAULT_API_HASH = process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627';

// Sessões ativas por workspace_id: { [workspaceId]: { client, user, isSyncing, massDispatch } }
const activeSessions = {};

// Tentativas de login pendentes por workspace_id: { [workspaceId]: { client, phone, phoneCodeHash, apiId, apiHash, createdAt } }
const pendingLogins = {};

/**
 * Retorna o cliente ativo ou tenta inicializá-lo a partir do banco de dados
 */
async function getClient(workspaceId) {
  if (activeSessions[workspaceId] && activeSessions[workspaceId].client) {
    const client = activeSessions[workspaceId].client;
    if (client.connected) {
      return client;
    }
    try {
      await client.connect();
      return client;
    } catch (e) {
      console.warn(`[TelegramUser] Falha ao reconectar cliente existente do Workspace ${workspaceId}:`, e.message);
    }
  }

  // Tenta restaurar do banco de dados
  const database = await db.getDB();
  const ws = await database.get(
    'SELECT telegram_session, telegram_api_id, telegram_api_hash, telegram_phone FROM workspaces WHERE id = ?',
    [workspaceId]
  );

  if (!ws || !ws.telegram_session) {
    return null;
  }

  const apiId = parseInt(ws.telegram_api_id || DEFAULT_API_ID, 10);
  const apiHash = ws.telegram_api_hash || DEFAULT_API_HASH;
  const stringSession = new StringSession(ws.telegram_session);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.connect();
    const me = await client.getMe();
    if (me) {
      activeSessions[workspaceId] = {
        client,
        user: {
          id: me.id ? me.id.toString() : '',
          firstName: me.firstName || '',
          lastName: me.lastName || '',
          username: me.username || '',
          phone: me.phone || ws.telegram_phone || ''
        },
        isSyncing: false
      };
      console.log(`✅ [TelegramUser] Conta conectada para Workspace ${workspaceId}: ${me.firstName} (@${me.username || 'sem_user'})`);
      return client;
    }
  } catch (err) {
    console.error(`❌ [TelegramUser] Erro ao restaurar sessão MTProto do Workspace ${workspaceId}:`, err.message);
  }

  return null;
}

/**
 * 1. Enviar código de verificação para o aplicativo do Telegram do usuário
 */
async function sendCode(workspaceId, phone, customApiId, customApiHash) {
  if (!phone) {
    throw new Error('Número de telefone obrigatório');
  }

  // Sanitiza o número: garante formato internacional com código do país (ex: 5561981684300 ou +5561981684300)
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const apiId = parseInt(customApiId || DEFAULT_API_ID, 10);
  const apiHash = (customApiHash && customApiHash.trim()) || DEFAULT_API_HASH;

  // Se já houver um cliente anterior pendente, desconecta
  if (pendingLogins[workspaceId] && pendingLogins[workspaceId].client) {
    try {
      await pendingLogins[workspaceId].client.disconnect();
    } catch (e) {}
    delete pendingLogins[workspaceId];
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  console.log(`📲 [TelegramUser] Solicitando código de login para ${cleanPhone} (Workspace ${workspaceId})...`);
  
  const { phoneCodeHash } = await client.sendCode(
    {
      apiId,
      apiHash,
    },
    cleanPhone
  );

  pendingLogins[workspaceId] = {
    client,
    phone: cleanPhone,
    phoneCodeHash,
    apiId,
    apiHash,
    createdAt: Date.now()
  };

  return {
    success: true,
    phone: cleanPhone,
    phoneCodeHash,
    message: 'Código de confirmação enviado para o seu aplicativo Telegram!'
  };
}

/**
 * 2. Concluir login com código (e senha 2FA se exigida)
 */
async function signIn(workspaceId, { code, password }) {
  const pending = pendingLogins[workspaceId];
  if (!pending || !pending.client) {
    throw new Error('Nenhum login em andamento. Solicite um novo código primeiro.');
  }

  const { client, phone, phoneCodeHash, apiId, apiHash } = pending;
  const cleanCode = (code || '').toString().replace(/\D/g, '').trim() || (code || '').toString().trim();

  if (!cleanCode) {
    throw new Error('Código de confirmação obrigatório');
  }

  // Garante que o cliente MTProto está conectado
  if (!client.connected) {
    await client.connect();
  }

  let me;
  let needPasswordCheck = false;

  try {
    const signInResult = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash: phoneCodeHash,
        phoneCode: cleanCode,
      })
    );
    if (signInResult && signInResult.user) {
      me = signInResult.user;
    }
  } catch (err) {
    const errText = ((err && err.message) || (err && err.errorMessage) || '').toUpperCase();
    if (errText.includes('SESSION_PASSWORD_NEEDED')) {
      needPasswordCheck = true;
    } else if (password) {
      // Caso o código de 5 dígitos já tenha sido aceito e a sessão esteja aguardando a senha 2FA
      try {
        const pwdTest = await client.invoke(new Api.account.GetPassword());
        if (pwdTest && pwdTest.hasPassword) {
          needPasswordCheck = true;
        } else {
          throw err;
        }
      } catch (e) {
        throw err;
      }
    } else {
      throw err;
    }
  }

  // Caso o Telegram exija Senha de Duas Etapas (2FA Cloud Password)
  if (needPasswordCheck) {
    if (!password) {
      return {
        success: false,
        needPassword: true,
        error: 'Sua conta possui Verificação em Duas Etapas (2FA). Por favor, informe sua senha.'
      };
    }

    try {
      const { computeCheck } = require('telegram/Password');
      const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
      const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
      const authResult = await client.invoke(
        new Api.auth.CheckPassword({
          password: passwordSrpCheck,
        })
      );
      if (authResult && authResult.user) {
        me = authResult.user;
      }
    } catch (pwdErr) {
      const pwdErrText = ((pwdErr && pwdErr.message) || (pwdErr && pwdErr.errorMessage) || '').toUpperCase();
      if (pwdErrText.includes('PASSWORD_HASH_INVALID')) {
        return {
          success: false,
          needPassword: true,
          error: 'Senha de 2FA incorreta. Verifique a senha definida no seu Telegram e tente novamente.'
        };
      }
      throw new Error('Falha ao validar senha de 2FA: ' + (pwdErr.message || pwdErr.errorMessage || 'Erro desconhecido'));
    }
  }

  if (!me) {
    me = await client.getMe();
  }
  const sessionString = client.session.save();

  // Salva permanentemente no banco SQLite do Workspace
  const database = await db.getDB();
  await database.run(
    `UPDATE workspaces SET 
      telegram_session = ?, 
      telegram_phone = ?, 
      telegram_user_id = ?, 
      telegram_first_name = ?, 
      telegram_username = ?,
      telegram_api_id = ?,
      telegram_api_hash = ?,
      telegram_connected_at = ?
     WHERE id = ?`,
    [
      sessionString,
      phone,
      me.id ? me.id.toString() : '',
      me.firstName || '',
      me.username || '',
      String(apiId),
      apiHash,
      Math.floor(Date.now() / 1000),
      workspaceId
    ]
  );

  activeSessions[workspaceId] = {
    client,
    user: {
      id: me.id ? me.id.toString() : '',
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone || phone
    },
    isSyncing: false
  };

  delete pendingLogins[workspaceId];

  // Inicia a sincronização de contatos automaticamente em segundo plano!
  syncContacts(workspaceId).catch(err => {
    console.error(`[TelegramUser] Erro ao auto-sincronizar contatos após login:`, err);
  });

  return {
    success: true,
    user: {
      id: me.id ? me.id.toString() : '',
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone || phone
    }
  };
}

/**
 * 3. Sincronizar todos os contatos do Telegram para a tabela contacts do Unico CRM
 *    Sem necessidade de CSV ou catalogação manual!
 */
async function syncContacts(workspaceId) {
  const client = await getClient(workspaceId);
  if (!client) {
    throw new Error('Conta do Telegram não está conectada');
  }

  if (activeSessions[workspaceId]) {
    if (activeSessions[workspaceId].isSyncing) {
      return { success: true, message: 'Sincronização já está em andamento.' };
    }
    activeSessions[workspaceId].isSyncing = true;
  }

  console.log(`🔄 [TelegramUser] Iniciando leitura de contatos da nuvem do Telegram (Workspace ${workspaceId})...`);

  try {
    const result = await client.invoke(
      new Api.contacts.GetContacts({
        hash: BigInt(0),
      })
    );

    const users = (result && result.users) ? result.users : [];
    console.log(`📋 [TelegramUser] Encontrados ${users.length} contatos na conta do Telegram!`);

    const database = await db.getDB();

    // 1. Encontra ou cria a Lista "Contatos Telegram (Minha Conta)"
    const listName = 'Contatos Telegram (Minha Conta)';
    let list = await database.get(
      'SELECT id FROM lists WHERE workspace_id = ? AND name = ?',
      [workspaceId, listName]
    );

    if (!list) {
      const listInsert = await database.run(
        'INSERT INTO lists (workspace_id, name) VALUES (?, ?)',
        [workspaceId, listName]
      );
      list = { id: listInsert.lastID };
    }

    const listId = list.id;

    // 2. Busca contatos já cadastrados no Workspace nesta lista para evitar duplicatas
    const existingRows = await database.all(
      'SELECT phone FROM contacts WHERE workspace_id = ? AND list_id = ?',
      [workspaceId, listId]
    );
    const existingPhones = new Set(existingRows.map(r => r.phone));

    // 3. Insere em lote dentro de uma transação SQLite ultra-rápida
    await database.run('BEGIN TRANSACTION');
    let insertedCount = 0;

    for (const u of users) {
      // Ignora contas deletadas ou bots
      if (u.deleted || u.bot) continue;

      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'Contato Telegram';
      let phone = '';
      if (u.phone) {
        phone = u.phone.startsWith('+') ? u.phone : `+${u.phone}`;
      } else if (u.username) {
        phone = `@${u.username}`;
      } else if (u.id) {
        phone = `${u.id}@telegram`;
      }

      if (!phone || existingPhones.has(phone)) {
        continue;
      }

      await database.run(
        'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
        [workspaceId, listId, name, phone, 'Novo']
      );
      existingPhones.add(phone);
      insertedCount++;
    }

    await database.run('COMMIT');

    console.log(`✅ [TelegramUser] Sincronização concluída: ${insertedCount} novos contatos inseridos na lista "${listName}"!`);

    return {
      success: true,
      totalTelegram: users.length,
      inserted: insertedCount,
      listId,
      listName
    };
  } catch (err) {
    console.error(`❌ [TelegramUser] Erro ao sincronizar contatos:`, err);
    try {
      const database = await db.getDB();
      await database.run('ROLLBACK');
    } catch (rbErr) {}
    throw err;
  } finally {
    if (activeSessions[workspaceId]) {
      activeSessions[workspaceId].isSyncing = false;
    }
  }
}

/**
 * 4. Status da conexão Telegram MTProto (User)
 */
async function getStatus(workspaceId) {
  const database = await db.getDB();
  const ws = await database.get(
    'SELECT telegram_session, telegram_phone, telegram_user_id, telegram_first_name, telegram_username, telegram_connected_at FROM workspaces WHERE id = ?',
    [workspaceId]
  );

  const hasSession = !!(ws && ws.telegram_session);
  const isPending = !!(pendingLogins[workspaceId]);
  const isSyncing = !!(activeSessions[workspaceId] && activeSessions[workspaceId].isSyncing);

  // Conta total de contatos importados do Telegram
  let totalContacts = 0;
  try {
    const countRow = await database.get(
      `SELECT COUNT(*) as count FROM contacts c 
       JOIN lists l ON c.list_id = l.id 
       WHERE c.workspace_id = ? AND l.name = 'Contatos Telegram (Minha Conta)'`,
      [workspaceId]
    );
    totalContacts = countRow ? countRow.count : 0;
  } catch (e) {}

  return {
    connected: hasSession,
    isPending,
    isSyncing,
    phone: ws ? ws.telegram_phone : '',
    firstName: ws ? ws.telegram_first_name : '',
    username: ws ? ws.telegram_username : '',
    userId: ws ? ws.telegram_user_id : '',
    connectedAt: ws ? ws.telegram_connected_at : null,
    totalContacts
  };
}

/**
 * 5. Desconectar conta do Telegram
 */
async function disconnectTelegramUser(workspaceId) {
  if (activeSessions[workspaceId] && activeSessions[workspaceId].client) {
    try {
      await activeSessions[workspaceId].client.disconnect();
    } catch (e) {}
    delete activeSessions[workspaceId];
  }
  if (pendingLogins[workspaceId]) {
    try {
      await pendingLogins[workspaceId].client.disconnect();
    } catch (e) {}
    delete pendingLogins[workspaceId];
  }

  const database = await db.getDB();
  await database.run(
    `UPDATE workspaces SET 
      telegram_session = NULL, 
      telegram_phone = NULL, 
      telegram_user_id = NULL, 
      telegram_first_name = NULL, 
      telegram_username = NULL,
      telegram_connected_at = NULL
     WHERE id = ?`,
    [workspaceId]
  );

  return { success: true };
}

/**
 * 6. Enviar mensagem direta via Telegram MTProto
 */
async function sendMessage(workspaceId, to, text, file) {
  const client = await getClient(workspaceId);
  if (!client) {
    throw new Error('Sessão do Telegram (Conta de Usuário) não conectada');
  }

  let cleanTarget = (to || '').trim();
  if (cleanTarget.endsWith('@telegram')) {
    cleanTarget = cleanTarget.replace('@telegram', '');
  }

  // Tenta resolver o peer (número de telefone, username ou ID)
  let peer = cleanTarget;
  if (/^\+?\d+$/.test(cleanTarget)) {
    // Número de telefone: se não começar com +, adiciona
    peer = cleanTarget.startsWith('+') ? cleanTarget : `+${cleanTarget}`;
  }

  console.log(`✈️ [TelegramUser] Enviando mensagem para ${peer}...`);

  let sent;
  try {
    if (file && file.path) {
      sent = await client.sendFile(peer, {
        file: file.path,
        caption: text || ''
      });
    } else {
      sent = await client.sendMessage(peer, {
        message: text || ''
      });
    }
  } catch (err) {
    // Trata erros comuns do Telegram
    if (err.message && err.message.includes('FLOOD_WAIT')) {
      const seconds = err.seconds || 30;
      throw new Error(`Limite temporário do Telegram (FloodWait): aguarde ${seconds} segundos antes de enviar para este número.`);
    }
    if (err.message && err.message.includes('USER_PRIVACY_RESTRICTED')) {
      throw new Error('Este usuário configurou a privacidade para não receber mensagens diretas.');
    }
    throw err;
  }

  // Registra mensagem no banco SQLite
  try {
    const database = await db.getDB();
    const dbJid = `${cleanTarget}@telegram`;
    const messageId = Date.now().toString() + '_' + dbJid;
    await database.run(
      `INSERT INTO messages (id, workspace_id, remote_jid, from_me, text, type, file_url, timestamp, push_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        workspaceId,
        dbJid,
        1,
        text || '',
        file ? (file.mimetype && file.mimetype.startsWith('image/') ? 'image' : 'file') : 'text',
        null,
        Math.floor(Date.now() / 1000),
        'Você'
      ]
    );
  } catch (dbErr) {
    console.warn('[TelegramUser] Falha ao registrar mensagem no histórico:', dbErr.message);
  }

  return { success: true, id: sent.id ? sent.id.toString() : 'ok' };
}

/**
 * 7. Disparo em Massa Inteligente com Fila e Proteção Anti-Flood
 */
// Armazena estado dos disparos ativos: { [workspaceId]: { isRunning, total, sent, failed, currentContact, logs, stopped } }
const massDispatches = {};

function getMassDispatchStatus(workspaceId) {
  return massDispatches[workspaceId] || { isRunning: false, total: 0, sent: 0, failed: 0, logs: [] };
}

function stopMassDispatch(workspaceId) {
  if (massDispatches[workspaceId]) {
    massDispatches[workspaceId].stopped = true;
    massDispatches[workspaceId].isRunning = false;
    return { success: true, message: 'Disparo interrompido pelo usuário.' };
  }
  return { success: false, message: 'Nenhum disparo em execução.' };
}

async function startMassDispatch(workspaceId, { listId, message, delayMin = 5, delayMax = 12 }) {
  const client = await getClient(workspaceId);
  if (!client) {
    throw new Error('Conta do Telegram não está conectada');
  }

  if (massDispatches[workspaceId] && massDispatches[workspaceId].isRunning) {
    throw new Error('Já existe um disparo em massa em andamento neste Workspace.');
  }

  const database = await db.getDB();

  // Busca contatos da lista especificada (ou de "Contatos Telegram (Minha Conta)" por padrão)
  let contacts = [];
  if (listId) {
    contacts = await database.all(
      'SELECT id, name, phone FROM contacts WHERE workspace_id = ? AND list_id = ?',
      [workspaceId, listId]
    );
  } else {
    contacts = await database.all(
      `SELECT c.id, c.name, c.phone FROM contacts c
       JOIN lists l ON c.list_id = l.id
       WHERE c.workspace_id = ? AND l.name = 'Contatos Telegram (Minha Conta)'`,
      [workspaceId]
    );
  }

  if (!contacts || contacts.length === 0) {
    throw new Error('Nenhum contato encontrado para envio.');
  }

  const state = {
    isRunning: true,
    stopped: false,
    total: contacts.length,
    sent: 0,
    failed: 0,
    currentContact: '',
    logs: []
  };

  massDispatches[workspaceId] = state;

  // Executa em segundo plano de forma assíncrona
  (async () => {
    state.logs.push(`🚀 Iniciando disparo em massa para ${contacts.length} contatos do Telegram...`);
    
    for (let i = 0; i < contacts.length; i++) {
      if (state.stopped) {
        state.logs.push(`⏹️ Disparo cancelado pelo usuário.`);
        break;
      }

      const contact = contacts[i];
      state.currentContact = `${contact.name} (${contact.phone})`;

      // Substitui variáveis personalizadas no texto
      const firstName = (contact.name || '').split(' ')[0] || 'amigo(a)';
      const personalizedMsg = message
        .replace(/\{nome\}/gi, contact.name || '')
        .replace(/\{primeiro_nome\}/gi, firstName)
        .replace(/\{telefone\}/gi, contact.phone || '');

      try {
        await sendMessage(workspaceId, contact.phone, personalizedMsg);
        state.sent++;
        state.logs.push(`[${state.sent + state.failed}/${state.total}] ✅ Enviado para ${contact.name} (${contact.phone})`);
      } catch (sendErr) {
        state.failed++;
        state.logs.push(`[${state.sent + state.failed}/${state.total}] ❌ Falha para ${contact.name}: ${sendErr.message}`);

        // Se for FloodWait, pausa e aguarda conforme exigido pelo Telegram!
        if (sendErr.seconds || (sendErr.message && sendErr.message.includes('FloodWait'))) {
          const waitTime = (sendErr.seconds || 45) + 3;
          state.logs.push(`⏳ [Anti-Flood] Telegram solicitou pausa de ${waitTime} segundos. Aguardando com segurança...`);
          await new Promise(r => setTimeout(r, waitTime * 1000));
        }
      }

      // Intervalo randômico (jitter) entre mensagens para parecer comportamento humano
      if (i < contacts.length - 1 && !state.stopped) {
        const randomSeconds = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
        await new Promise(r => setTimeout(r, randomSeconds * 1000));
      }
    }

    state.isRunning = false;
    state.logs.push(`🏁 Disparo finalizado! Enviados: ${state.sent} | Falhas: ${state.failed}`);
  })().catch(fatalErr => {
    state.isRunning = false;
    state.logs.push(`💥 Erro fatal no disparo: ${fatalErr.message}`);
  });

  return {
    success: true,
    total: contacts.length,
    message: `Disparo iniciado para ${contacts.length} contatos em segundo plano.`
  };
}

module.exports = {
  sendCode,
  signIn,
  syncContacts,
  getStatus,
  disconnectTelegramUser,
  sendMessage,
  startMassDispatch,
  getMassDispatchStatus,
  stopMassDispatch,
  getClient
};
