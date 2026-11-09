const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const db = require('./db');

// Configuração padrão de App ID e Hash (Telegram Web / Desktop oficial)
// Pode ser customizado via .env ou informado pelo usuário no Workspace
const DEFAULT_API_ID = parseInt(process.env.TELEGRAM_API_ID || '2040', 10);
const DEFAULT_API_HASH = process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627';

// Suporta até 5 contas de Telegram (MTProto / Userbot) por Workspace em rodízio
const MAX_SLOTS = 5;

// Sessões ativas por sessionKey: { [sessionKey]: { client, slot, user, isSyncing } }
const activeSessions = {};

// Tentativas de login pendentes por sessionKey: { [sessionKey]: { client, slot, phone, phoneCodeHash, apiId, apiHash, createdAt } }
const pendingLogins = {};

// Contador Round-Robin por workspace_id
const roundRobinCounters = {};

let tableInitialized = false;

function normalizeSlot(slot = 1) {
  const n = Number(slot) || 1;
  return Math.min(Math.max(n, 1), MAX_SLOTS);
}

function getSessionKey(workspaceId, slot = 1) {
  const s = normalizeSlot(slot);
  return s === 1 ? String(workspaceId) : `${workspaceId}_slot${s}`;
}

async function ensureSessionsTable(database, workspaceId = null) {
  if (!tableInitialized) {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS telegram_user_sessions (
        workspace_id INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        telegram_session TEXT,
        telegram_phone TEXT,
        telegram_user_id TEXT,
        telegram_first_name TEXT,
        telegram_last_name TEXT,
        telegram_username TEXT,
        telegram_api_id TEXT,
        telegram_api_hash TEXT,
        telegram_connected_at INTEGER,
        PRIMARY KEY (workspace_id, slot)
      );
    `);
    tableInitialized = true;
  }

  // Migra automaticamente a sessão legada da tabela workspaces para o Slot 1 se ainda não estiver na tabela nova
  if (workspaceId) {
    const slot1 = await database.get(
      'SELECT telegram_session FROM telegram_user_sessions WHERE workspace_id = ? AND slot = 1',
      [workspaceId]
    );
    if (!slot1 || !slot1.telegram_session) {
      const ws = await database.get(
        'SELECT telegram_session, telegram_phone, telegram_user_id, telegram_first_name, telegram_username, telegram_api_id, telegram_api_hash, telegram_connected_at FROM workspaces WHERE id = ?',
        [workspaceId]
      );
      if (ws && ws.telegram_session) {
        await database.run(
          `INSERT OR REPLACE INTO telegram_user_sessions (
            workspace_id, slot, telegram_session, telegram_phone, telegram_user_id,
            telegram_first_name, telegram_last_name, telegram_username,
            telegram_api_id, telegram_api_hash, telegram_connected_at
          ) VALUES (?, 1, ?, ?, ?, ?, '', ?, ?, ?, ?)`,
          [
            workspaceId,
            ws.telegram_session,
            ws.telegram_phone || '',
            ws.telegram_user_id || '',
            ws.telegram_first_name || '',
            ws.telegram_username || '',
            ws.telegram_api_id || String(DEFAULT_API_ID),
            ws.telegram_api_hash || DEFAULT_API_HASH,
            ws.telegram_connected_at || Math.floor(Date.now() / 1000)
          ]
        );
      }
    }
  }
}

/**
 * Retorna os slots conectados em memória no momento (síncrono, útil para o mass_dispatcher)
 */
function getConnectedSlots(workspaceId) {
  const connected = [];
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const key = getSessionKey(workspaceId, s);
    if (activeSessions[key] && activeSessions[key].client && activeSessions[key].client.connected) {
      connected.push(s);
    }
  }
  return connected;
}

/**
 * Retorna todos os slots que possuem sessão ativa ou salva no banco para este Workspace
 */
async function getAvailableSlots(workspaceId) {
  const database = await db.getDB();
  await ensureSessionsTable(database, workspaceId);
  const rows = await database.all(
    `SELECT slot FROM telegram_user_sessions
     WHERE workspace_id = ? AND telegram_session IS NOT NULL AND TRIM(telegram_session) != ''
     ORDER BY slot ASC`,
    [workspaceId]
  );
  const slotSet = new Set(rows.map(r => normalizeSlot(r.slot)));
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const key = getSessionKey(workspaceId, s);
    if (activeSessions[key] && activeSessions[key].client && activeSessions[key].client.connected) {
      slotSet.add(s);
    }
  }
  return Array.from(slotSet).sort((a, b) => a - b);
}

/**
 * Seleciona a próxima conta de Telegram em rodízio (Round-Robin)
 */
async function pickNextConnectedSlot(workspaceId) {
  const available = await getAvailableSlots(workspaceId);
  if (available.length === 0) return null;
  const currentIdx = roundRobinCounters[workspaceId] || 0;
  const chosenSlot = available[currentIdx % available.length];
  roundRobinCounters[workspaceId] = (currentIdx + 1) % available.length;
  return chosenSlot;
}

/**
 * Retorna o cliente ativo de um slot específico ou tenta inicializá-lo a partir do banco de dados
 */
async function getClient(workspaceId, slot = 1) {
  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);

  if (activeSessions[sessionKey] && activeSessions[sessionKey].client) {
    const client = activeSessions[sessionKey].client;
    if (client.connected) {
      return client;
    }
    try {
      await client.connect();
      return client;
    } catch (e) {
      console.warn(`[TelegramUser] Falha ao reconectar cliente existente (Conta #${numSlot}, Workspace ${workspaceId}):`, e.message);
    }
  }

  const database = await db.getDB();
  await ensureSessionsTable(database, workspaceId);

  const row = await database.get(
    'SELECT * FROM telegram_user_sessions WHERE workspace_id = ? AND slot = ?',
    [workspaceId, numSlot]
  );

  if (!row || !row.telegram_session) {
    return null;
  }

  const apiId = parseInt(row.telegram_api_id || DEFAULT_API_ID, 10);
  const apiHash = row.telegram_api_hash || DEFAULT_API_HASH;
  const stringSession = new StringSession(row.telegram_session);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.connect();
    const me = await client.getMe();
    if (me) {
      activeSessions[sessionKey] = {
        client,
        slot: numSlot,
        user: {
          id: me.id ? me.id.toString() : '',
          firstName: me.firstName || '',
          lastName: me.lastName || '',
          username: me.username || '',
          phone: me.phone || row.telegram_phone || ''
        },
        isSyncing: false
      };
      console.log(`✅ [TelegramUser] Conta #${numSlot} conectada para Workspace ${workspaceId}: ${me.firstName} (@${me.username || 'sem_user'})`);
      return client;
    }
  } catch (err) {
    console.error(`❌ [TelegramUser] Erro ao restaurar sessão MTProto (Conta #${numSlot}, Workspace ${workspaceId}):`, err.message);
  }

  return null;
}

/**
 * Reconecta todas as contas de Telegram salvas do Workspace (Slots 1 a 5)
 */
async function connectAllSavedSlots(workspaceId) {
  const slots = await getAvailableSlots(workspaceId);
  const connected = [];
  for (const s of slots) {
    const client = await getClient(workspaceId, s);
    if (client) connected.push(s);
  }
  return connected;
}

/**
 * 1. Enviar código de verificação para o aplicativo do Telegram do usuário
 */
async function sendCode(workspaceId, phone, customApiId, customApiHash, slot = 1) {
  if (!phone) {
    throw new Error('Número de telefone obrigatório');
  }

  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);

  // Sanitiza o número: garante formato internacional com código do país (ex: 5561981684300 ou +5561981684300)
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  const apiId = parseInt(customApiId || DEFAULT_API_ID, 10);
  const apiHash = (customApiHash && customApiHash.trim()) || DEFAULT_API_HASH;

  // Se já houver um cliente anterior pendente neste slot, desconecta
  if (pendingLogins[sessionKey] && pendingLogins[sessionKey].client) {
    try {
      await pendingLogins[sessionKey].client.disconnect();
    } catch (e) {}
    delete pendingLogins[sessionKey];
  }

  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();

  console.log(`📲 [TelegramUser] Solicitando código de login para ${cleanPhone} (Conta #${numSlot}, Workspace ${workspaceId})...`);
  
  const { phoneCodeHash } = await client.sendCode(
    {
      apiId,
      apiHash,
    },
    cleanPhone
  );

  pendingLogins[sessionKey] = {
    client,
    slot: numSlot,
    phone: cleanPhone,
    phoneCodeHash,
    apiId,
    apiHash,
    createdAt: Date.now()
  };

  return {
    success: true,
    slot: numSlot,
    phone: cleanPhone,
    phoneCodeHash,
    message: `Código de confirmação enviado para o seu aplicativo Telegram (Conta #${numSlot})!`
  };
}

/**
 * 2. Concluir login com código (e senha 2FA se exigida)
 */
async function signIn(workspaceId, { code, password, slot = 1 }) {
  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);
  const pending = pendingLogins[sessionKey];
  if (!pending || !pending.client) {
    throw new Error(`Nenhum login em andamento na Conta #${numSlot}. Solicite um novo código primeiro.`);
  }

  const { client, phone, phoneCodeHash, apiId, apiHash } = pending;
  const cleanCode = (code || '').toString().replace(/\D/g, '').trim() || (code || '').toString().trim();

  if (!cleanCode) {
    throw new Error('Código de confirmação obrigatório');
  }

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
  const connectedAt = Math.floor(Date.now() / 1000);

  const database = await db.getDB();
  await ensureSessionsTable(database, workspaceId);

  await database.run(
    `INSERT OR REPLACE INTO telegram_user_sessions (
      workspace_id, slot, telegram_session, telegram_phone, telegram_user_id,
      telegram_first_name, telegram_last_name, telegram_username,
      telegram_api_id, telegram_api_hash, telegram_connected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workspaceId,
      numSlot,
      sessionString,
      me.phone || phone,
      me.id ? me.id.toString() : '',
      me.firstName || '',
      me.lastName || '',
      me.username || '',
      String(apiId),
      apiHash,
      connectedAt
    ]
  );

  // Mantém a coluna legada em workspaces sincronizada para o Slot 1 (ou se for a primeira conta conectada)
  const wsRow = await database.get('SELECT telegram_session FROM workspaces WHERE id = ?', [workspaceId]);
  if (numSlot === 1 || !wsRow || !wsRow.telegram_session) {
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
        me.phone || phone,
        me.id ? me.id.toString() : '',
        me.firstName || '',
        me.username || '',
        String(apiId),
        apiHash,
        connectedAt,
        workspaceId
      ]
    );
  }

  activeSessions[sessionKey] = {
    client,
    slot: numSlot,
    user: {
      id: me.id ? me.id.toString() : '',
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone || phone
    },
    isSyncing: false
  };

  delete pendingLogins[sessionKey];

  // Inicia a sincronização de contatos automaticamente em segundo plano!
  syncContacts(workspaceId, numSlot).catch(err => {
    console.error(`[TelegramUser] Erro ao auto-sincronizar contatos após login (Conta #${numSlot}):`, err);
  });

  return {
    success: true,
    slot: numSlot,
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
 */
async function syncContacts(workspaceId, slot = 1) {
  let numSlot = normalizeSlot(slot);
  let client = await getClient(workspaceId, numSlot);
  if (!client) {
    const available = await getAvailableSlots(workspaceId);
    if (available.length > 0) {
      numSlot = available[0];
      client = await getClient(workspaceId, numSlot);
    }
  }
  if (!client) {
    throw new Error(`Conta #${numSlot} do Telegram não está conectada`);
  }

  const sessionKey = getSessionKey(workspaceId, numSlot);
  if (activeSessions[sessionKey]) {
    if (activeSessions[sessionKey].isSyncing) {
      return { success: true, message: 'Sincronização já está em andamento.' };
    }
    activeSessions[sessionKey].isSyncing = true;
  }

  console.log(`🔄 [TelegramUser] Iniciando leitura de contatos da nuvem do Telegram (Conta #${numSlot}, Workspace ${workspaceId})...`);

  try {
    const result = await client.invoke(
      new Api.contacts.GetContacts({
        hash: BigInt(0),
      })
    );

    const users = (result && result.users) ? result.users : [];
    console.log(`📋 [TelegramUser] Encontrados ${users.length} contatos na Conta #${numSlot} do Telegram!`);

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

    console.log(`✅ [TelegramUser] Sincronização da agenda (Conta #${numSlot}) concluída: ${insertedCount} novos contatos inseridos na lista "${listName}"!`);

    // 4. Encontra ou cria a Segunda Lista "Telegram - Interações (Últimos 30 dias)"
    const recentListName = 'Telegram - Interações (Últimos 30 dias)';
    let recentList = await database.get(
      'SELECT id FROM lists WHERE workspace_id = ? AND name = ?',
      [workspaceId, recentListName]
    );

    if (!recentList) {
      const recentInsert = await database.run(
        'INSERT INTO lists (workspace_id, name) VALUES (?, ?)',
        [workspaceId, recentListName]
      );
      recentList = { id: recentInsert.lastID };
    }

    const recentListId = recentList.id;

    const existingRecentRows = await database.all(
      'SELECT phone FROM contacts WHERE workspace_id = ? AND list_id = ?',
      [workspaceId, recentListId]
    );
    const existingRecentPhones = new Set(existingRecentRows.map(r => r.phone));

    const thirtyDaysAgoSec = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    let recentInsertedCount = 0;
    let recentTotalFound = 0;

    console.log(`💬 [TelegramUser] Buscando conversas dos últimos 30 dias no Telegram (Conta #${numSlot})...`);

    try {
      await database.run('BEGIN TRANSACTION');

      for await (const dialog of client.iterDialogs({ limit: 500 })) {
        const lastMsgDate = (dialog.message && dialog.message.date) || dialog.date || 0;

        if (!dialog.pinned && lastMsgDate > 0 && lastMsgDate < thirtyDaysAgoSec) {
          break;
        }

        if (lastMsgDate >= thirtyDaysAgoSec && dialog.isUser) {
          const u = dialog.entity;
          if (u && !u.bot && !u.deleted && !u.self) {
            recentTotalFound++;
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || dialog.name || 'Contato Telegram';
            let phone = '';
            if (u.phone) {
              phone = u.phone.startsWith('+') ? u.phone : `+${u.phone}`;
            } else if (u.username) {
              phone = `@${u.username}`;
            } else if (u.id) {
              phone = `${u.id}@telegram`;
            }

            if (phone && !existingRecentPhones.has(phone)) {
              await database.run(
                'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
                [workspaceId, recentListId, name, phone, 'Ativo']
              );
              existingRecentPhones.add(phone);
              recentInsertedCount++;
            }
          }
        }
      }

      await database.run('COMMIT');
      console.log(`💬 [TelegramUser] ${recentTotalFound} pessoas interagidas nos últimos 30 dias (${recentInsertedCount} novos adicionados na lista "${recentListName}")!`);
    } catch (dialogErr) {
      try {
        await database.run('ROLLBACK');
      } catch (rbErr) {}
      console.warn(`⚠️ [TelegramUser] Aviso ao processar conversas recentes de 30 dias:`, dialogErr.message);
    }

    return {
      success: true,
      slot: numSlot,
      totalTelegram: users.length,
      inserted: insertedCount,
      listId,
      listName,
      recentListId,
      recentListName,
      recentTotal: recentTotalFound,
      recentInserted: recentInsertedCount
    };
  } catch (err) {
    console.error(`❌ [TelegramUser] Erro ao sincronizar contatos (Conta #${numSlot}):`, err);
    try {
      const database = await db.getDB();
      await database.run('ROLLBACK');
    } catch (rbErr) {}
    throw err;
  } finally {
    if (activeSessions[sessionKey]) {
      activeSessions[sessionKey].isSyncing = false;
    }
  }
}

/**
 * 4. Status da conexão Telegram MTProto (Suporta até 5 Contas por Workspace)
 */
async function getStatus(workspaceId, requestedSlot) {
  const database = await db.getDB();
  await ensureSessionsTable(database, workspaceId);

  const rows = await database.all(
    'SELECT * FROM telegram_user_sessions WHERE workspace_id = ? ORDER BY slot ASC',
    [workspaceId]
  );
  const rowBySlot = {};
  for (const r of rows) {
    rowBySlot[normalizeSlot(r.slot)] = r;
  }

  const slots = [];
  for (let s = 1; s <= MAX_SLOTS; s++) {
    const sKey = getSessionKey(workspaceId, s);
    const r = rowBySlot[s];
    const active = activeSessions[sKey];
    const hasSession = !!(r && r.telegram_session) || !!(active && active.client && active.client.connected);
    slots.push({
      slot: s,
      label: s === 1 ? 'Conta 1 (Principal)' : `Conta ${s}`,
      connected: hasSession,
      isPending: !!(pendingLogins[sKey]),
      isSyncing: !!(active && active.isSyncing),
      phone: (r && r.telegram_phone) || (active && active.user && active.user.phone) || '',
      firstName: (r && r.telegram_first_name) || (active && active.user && active.user.firstName) || '',
      username: (r && r.telegram_username) || (active && active.user && active.user.username) || '',
      userId: (r && r.telegram_user_id) || (active && active.user && active.user.id) || '',
      connectedAt: (r && r.telegram_connected_at) || null
    });
  }

  const connectedSlots = slots.filter(s => s.connected);
  const connectedCount = connectedSlots.length;

  // Conta total de contatos importados do Telegram (agenda e interações recentes)
  let totalContacts = 0;
  let totalRecentContacts = 0;
  try {
    const countRow = await database.get(
      `SELECT COUNT(*) as count FROM contacts c 
       JOIN lists l ON c.list_id = l.id 
       WHERE c.workspace_id = ? AND l.name = 'Contatos Telegram (Minha Conta)'`,
      [workspaceId]
    );
    totalContacts = countRow ? countRow.count : 0;

    const recentCountRow = await database.get(
      `SELECT COUNT(*) as count FROM contacts c 
       JOIN lists l ON c.list_id = l.id 
       WHERE c.workspace_id = ? AND l.name = 'Telegram - Interações (Últimos 30 dias)'`,
      [workspaceId]
    );
    totalRecentContacts = recentCountRow ? recentCountRow.count : 0;
  } catch (e) {}

  let targetSlotObj;
  if (requestedSlot !== undefined && requestedSlot !== null && requestedSlot !== '') {
    const numSlot = normalizeSlot(requestedSlot);
    targetSlotObj = slots.find(s => s.slot === numSlot) || slots[0];
  } else {
    targetSlotObj = connectedSlots[0] || slots[0];
  }

  return {
    slot: targetSlotObj.slot,
    connected: requestedSlot ? targetSlotObj.connected : (connectedCount > 0),
    slotConnected: targetSlotObj.connected,
    anyConnected: connectedCount > 0,
    connectedCount,
    slots,
    isPending: targetSlotObj.isPending,
    isSyncing: targetSlotObj.isSyncing,
    phone: targetSlotObj.phone,
    firstName: targetSlotObj.firstName,
    username: targetSlotObj.username,
    userId: targetSlotObj.userId,
    connectedAt: targetSlotObj.connectedAt,
    totalContacts,
    totalRecentContacts
  };
}

/**
 * 5. Desconectar conta específica do Telegram
 */
async function disconnectTelegramUser(workspaceId, slot = 1) {
  const numSlot = normalizeSlot(slot);
  const sessionKey = getSessionKey(workspaceId, numSlot);

  if (activeSessions[sessionKey] && activeSessions[sessionKey].client) {
    try {
      await activeSessions[sessionKey].client.disconnect();
    } catch (e) {}
    delete activeSessions[sessionKey];
  }
  if (pendingLogins[sessionKey]) {
    try {
      await pendingLogins[sessionKey].client.disconnect();
    } catch (e) {}
    delete pendingLogins[sessionKey];
  }

  const database = await db.getDB();
  await ensureSessionsTable(database, workspaceId);

  await database.run(
    'DELETE FROM telegram_user_sessions WHERE workspace_id = ? AND slot = ?',
    [workspaceId, numSlot]
  );

  // Atualiza a tabela workspaces se o slot 1 foi desconectado
  if (numSlot === 1) {
    const fallbackRow = await database.get(
      'SELECT * FROM telegram_user_sessions WHERE workspace_id = ? AND telegram_session IS NOT NULL ORDER BY slot ASC LIMIT 1',
      [workspaceId]
    );
    if (fallbackRow) {
      await database.run(
        `UPDATE workspaces SET 
          telegram_session = ?, 
          telegram_phone = ?, 
          telegram_user_id = ?, 
          telegram_first_name = ?, 
          telegram_username = ?,
          telegram_connected_at = ?
         WHERE id = ?`,
        [
          fallbackRow.telegram_session,
          fallbackRow.telegram_phone,
          fallbackRow.telegram_user_id,
          fallbackRow.telegram_first_name,
          fallbackRow.telegram_username,
          fallbackRow.telegram_connected_at,
          workspaceId
        ]
      );
    } else {
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
    }
  }

  return { success: true, slot: numSlot };
}

/**
 * 6. Enviar mensagem direta via Telegram MTProto (suporta rodízio entre até 5 contas)
 */
async function sendMessageRaw(workspaceId, to, text, file, contactName = '', preferredSlot = null) {
  let chosenSlot = preferredSlot ? normalizeSlot(preferredSlot) : await pickNextConnectedSlot(workspaceId);
  if (!chosenSlot) {
    chosenSlot = 1;
  }

  let client = await getClient(workspaceId, chosenSlot);
  if (!client) {
    // Tenta buscar qualquer outro slot disponível caso o escolhido tenha desconectado
    const available = await getAvailableSlots(workspaceId);
    for (const altSlot of available) {
      if (altSlot === chosenSlot) continue;
      const altClient = await getClient(workspaceId, altSlot);
      if (altClient) {
        chosenSlot = altSlot;
        client = altClient;
        break;
      }
    }
  }

  if (!client) {
    throw new Error('Nenhuma Conta de Usuário do Telegram conectada.');
  }

  const sessionKey = getSessionKey(workspaceId, chosenSlot);
  const activeUser = activeSessions[sessionKey]?.user || {};
  const usedLabel = activeUser.username ? `@${activeUser.username}` : (activeUser.phone || `Conta #${chosenSlot}`);

  let cleanTarget = (to || '').trim();
  if (cleanTarget.endsWith('@telegram')) {
    cleanTarget = cleanTarget.replace('@telegram', '');
  }

  // Tenta resolver o peer (número de telefone, username ou ID)
  let peer = cleanTarget;
  let resolvedEntity = null;
  if (/^\+?\d+$/.test(cleanTarget)) {
    let digits = cleanTarget.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }
    const candidates = [`+${digits}`];
    if (digits.startsWith('55') && digits.length === 12) {
      const ddd = digits.slice(2, 4);
      const rest = digits.slice(4);
      candidates.unshift(`+55${ddd}9${rest}`);
    } else if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
      const ddd = digits.slice(2, 4);
      const rest = digits.slice(5);
      candidates.push(`+55${ddd}${rest}`);
    }
    peer = candidates[0];

    for (const cand of candidates) {
      try {
        resolvedEntity = await client.getInputEntity(cand);
        if (resolvedEntity) {
          peer = cand;
          break;
        }
      } catch (_) {
        try {
          const imported = await client.invoke(
            new Api.contacts.ImportContacts({
              contacts: [
                new Api.InputPhoneContact({
                  clientId: BigInt(Date.now() + Math.floor(Math.random() * 1000)),
                  phone: cand.replace(/^\+/, ''),
                  firstName: (contactName || 'Contato').split(' ')[0] || 'Contato',
                  lastName: (contactName || '').split(' ').slice(1).join(' ') || ''
                })
              ]
            })
          );
          if (imported && imported.users && imported.users.length > 0) {
            resolvedEntity = imported.users[0];
            peer = cand;
            break;
          }
        } catch (__) {}
      }
    }
  }

  const targetEntity = resolvedEntity || peer;
  console.log(`✈️ [TelegramUser Conta #${chosenSlot} (${usedLabel})] Enviando mensagem para ${peer}...`);

  // Simulação de presença humana (Anti-Ban): "digitando..." proporcional ao texto
  try {
    const inputPeer = resolvedEntity || (await client.getInputEntity(peer));
    await client.invoke(new Api.messages.SetTyping({
      peer: inputPeer,
      action: new Api.SendMessageTypingAction()
    }));
    const typingMs = Math.min(Math.max((text || '').length * 30, 1000), 4000) + Math.floor(Math.random() * 600);
    await new Promise(resolve => setTimeout(resolve, typingMs));
  } catch (typingErr) {}

  let sent;
  try {
    if (file && file.path) {
      sent = await client.sendFile(targetEntity, {
        file: file.path,
        caption: text || ''
      });
    } else {
      sent = await client.sendMessage(targetEntity, {
        message: text || ''
      });
    }
  } catch (err) {
    if (err.message && err.message.includes('FLOOD_WAIT')) {
      const seconds = err.seconds || 30;
      throw new Error(`Limite temporário do Telegram na Conta #${chosenSlot} (FloodWait): aguarde ${seconds} segundos.`);
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
    
    let pushName = (contactName || '').trim();
    if (!pushName) {
      try {
        const digits = cleanTarget.replace(/\D/g, '');
        if (digits) {
          const ct = await database.get(
            'SELECT name FROM contacts WHERE workspace_id = ? AND (phone LIKE ? OR phone LIKE ?) LIMIT 1',
            [workspaceId, `%${digits.slice(-8)}%`, `%${digits}%`]
          );
          if (ct && ct.name) pushName = ct.name;
        }
      } catch (e) {}
    }

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
        pushName || cleanTarget
      ]
    );
  } catch (dbErr) {
    console.warn('[TelegramUser] Falha ao registrar mensagem no histórico:', dbErr.message);
  }

  return {
    success: true,
    id: sent && sent.id ? sent.id.toString() : 'ok',
    usedSlot: chosenSlot,
    usedPhone: usedLabel
  };
}

/**
 * 7. Disparo em Massa Inteligente com Fila e Proteção Anti-Flood
 */
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
  const available = await getAvailableSlots(workspaceId);
  if (available.length === 0) {
    throw new Error('Nenhuma conta do Telegram está conectada');
  }

  if (massDispatches[workspaceId] && massDispatches[workspaceId].isRunning) {
    throw new Error('Já existe um disparo em massa em andamento neste Workspace.');
  }

  const database = await db.getDB();

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

  (async () => {
    state.logs.push(`🚀 Iniciando disparo em massa para ${contacts.length} contatos do Telegram (${available.length} conta(s) em rodízio)...`);
    
    for (let i = 0; i < contacts.length; i++) {
      if (state.stopped) {
        state.logs.push(`⏹️ Disparo cancelado pelo usuário.`);
        break;
      }

      const contact = contacts[i];
      state.currentContact = `${contact.name} (${contact.phone})`;

      const firstName = (contact.name || '').split(' ')[0] || 'amigo(a)';
      const personalizedMsg = message
        .replace(/\{nome\}/gi, contact.name || '')
        .replace(/\{primeiro_nome\}/gi, firstName)
        .replace(/\{telefone\}/gi, contact.phone || '');

      try {
        const res = await sendMessage(workspaceId, contact.phone, personalizedMsg);
        state.sent++;
        const tag = res && res.usedSlot ? `Conta #${res.usedSlot}` : 'Telegram';
        state.logs.push(`[${state.sent + state.failed}/${state.total}] ✅ [${tag}] Enviado para ${contact.name} (${contact.phone})`);
      } catch (sendErr) {
        state.failed++;
        state.logs.push(`[${state.sent + state.failed}/${state.total}] ❌ Falha para ${contact.name}: ${sendErr.message}`);

        if (sendErr.seconds || (sendErr.message && sendErr.message.includes('FloodWait'))) {
          const waitTime = (sendErr.seconds || 45) + 3;
          state.logs.push(`⏳ [Anti-Flood] Telegram solicitou pausa de ${waitTime} segundos. Aguardando com segurança...`);
          await new Promise(r => setTimeout(r, waitTime * 1000));
        }
      }

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

// Envio protegido pela política anti-ban com fila independente por Conta (Slot) e rodízio automático
async function sendMessage(workspaceId, to, text, file, contactName = '', preferredSlot = null) {
  const chosenSlot = preferredSlot ? normalizeSlot(preferredSlot) : ((await pickNextConnectedSlot(workspaceId)) || 1);
  const queueKey = `${workspaceId}_slot${chosenSlot}`;
  return require('./antiban').run('telegram_user', queueKey, () =>
    sendMessageRaw(workspaceId, to, text, file, contactName, chosenSlot)
  );
}

module.exports = {
  MAX_SLOTS,
  sendCode,
  signIn,
  syncContacts,
  getStatus,
  disconnectTelegramUser,
  sendMessage,
  startMassDispatch,
  getMassDispatchStatus,
  stopMassDispatch,
  getClient,
  connectAllSavedSlots,
  getConnectedSlots,
  getAvailableSlots,
  pickNextConnectedSlot
};
