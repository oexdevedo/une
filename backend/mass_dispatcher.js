const fs = require('fs');
const path = require('path');
const db = require('./db');
const { DATA_DIR } = require('./storage');

const STATE_FILE = path.join(DATA_DIR, 'mass_campaigns.json');

// Estado em memória: { ["ws_list"]: CampaignState }
const campaigns = {};
// Controle de execução em memória (timers e flags de interrupção): { ["ws_list"]: RuntimeControl }
const runtimes = {};

function parseListIds(listId) {
  if (Array.isArray(listId)) {
    return Array.from(new Set(listId.map(x => String(x).trim()).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
  }
  return Array.from(
    new Set(String(listId || '').split(',').map(x => x.trim()).filter(Boolean))
  ).sort((a, b) => Number(a) - Number(b));
}

function normalizeListKey(listId) {
  return parseListIds(listId).join(',');
}

function getKey(workspaceId, listId) {
  return `${workspaceId}_${normalizeListKey(listId)}`;
}

async function loadContactsForLists(database, workspaceId, listId) {
  const listIds = parseListIds(listId);
  if (listIds.length === 0) return [];
  const placeholders = listIds.map(() => '?').join(',');
  const rows = await database.all(
    `SELECT * FROM contacts WHERE workspace_id = ? AND list_id IN (${placeholders}) ORDER BY id DESC`,
    [workspaceId, ...listIds]
  );
  if (listIds.length <= 1 || !Array.isArray(rows)) {
    return rows || [];
  }
  // Remove duplicados por telefone/JID quando mais de uma lista é selecionada
  const seen = new Set();
  const unique = [];
  for (const r of rows) {
    const rawKey = String(r.phone || r.remote_jid || '').trim().toLowerCase();
    const dedupKey = rawKey
      ? (rawKey.startsWith('@') || rawKey.includes('@') ? rawKey : rawKey.replace(/\D/g, '') || rawKey)
      : `id_${r.id}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    unique.push(r);
  }
  return unique;
}

function loadPersistedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, val] of Object.entries(parsed)) {
          // Se o servidor reiniciou enquanto estava 'running', converte para 'paused' para permitir retomada
          if (val && val.status === 'running') {
            val.status = 'paused';
            val.logs = Array.isArray(val.logs) ? val.logs : [];
            val.logs.push({
              id: Date.now() + Math.random(),
              time: new Date().toLocaleTimeString('pt-BR'),
              type: 'warning',
              text: '⏸️ Servidor reiniciado durante o envio. Clique em "Continuar de onde parou" para retomar.'
            });
          }
          campaigns[k] = val;
        }
      }
    }
  } catch (err) {
    console.warn('[MassDispatcher] Aviso ao carregar estado persistido:', err.message);
  }
}

function savePersistedState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(campaigns, null, 2), 'utf8');
  } catch (err) {
    console.warn('[MassDispatcher] Aviso ao salvar estado persistido:', err.message);
  }
}

loadPersistedState();

function addCampaignLog(state, type, text) {
  const time = new Date().toLocaleTimeString('pt-BR');
  if (!Array.isArray(state.logs)) state.logs = [];
  state.logs.push({
    id: Date.now() + Math.random(),
    time,
    type,
    text
  });
  // Mantém os últimos 300 logs para não inflar memória/JSON
  if (state.logs.length > 300) {
    state.logs = state.logs.slice(-300);
  }
  state.updatedAt = Date.now();
}

function resolveSpintax(text) {
  if (!text) return '';
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  let iterations = 0;
  while (spintaxRegex.test(result) && iterations < 10) {
    result = result.replace(spintaxRegex, (match, contents) => {
      if (!contents.includes('|')) return match;
      const options = contents.split('|');
      const randomOption = options[Math.floor(Math.random() * options.length)];
      return randomOption;
    });
    iterations++;
  }
  return result;
}

function formatMessageForContact(template, contact, config = {}) {
  if (!template) return '';
  let parsed = resolveSpintax(template);
  const rawName = (contact?.name || '').trim();
  const firstName = rawName ? rawName.split(/\s+/)[0] : 'Cliente';
  const fullName = rawName || 'Cliente';

  const hour = new Date().getHours();
  const saudacao = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';

  parsed = parsed.replace(/\{(?:primeiro[_\s]?nome|first[_\s]?name)\}/gi, firstName);
  parsed = parsed.replace(/\{(?:nome|name)\}/gi, fullName);
  parsed = parsed.replace(/\{(?:saudacao|saudação|greeting)\}/gi, saudacao);
  parsed = parsed.replace(/\{(?:telefone|phone|celular)\}/gi, contact?.phone || '');
  parsed = parsed.replace(/\{(?:email)\}/gi, contact?.email || '');
  parsed = parsed.replace(/\{(?:profissao|profissão|cargo)\}/gi, contact?.profession || contact?.cargo || '');
  parsed = parsed.replace(/\{(?:regiao|região|cidade)\}/gi, contact?.region || contact?.cidade || '');

  // Rodapé amigável de Opt-Out (Anti-Spam / Redução de Denúncias à Meta)
  if (config.enableOptOutFooter) {
    const defaultOptOut = "Caso não queira mais receber mensagens, responda 'SAIR'.";
    const customText = (config.optOutFooterText || defaultOptOut).trim();
    if (customText) {
      parsed += `\n\n_${customText}_`;
    }
  }

  // Micro-variação invisível Anti-Hash (Zero-Width Unicode)
  if (config.enableAntiHash !== false) {
    try {
      const { applyAntiHashJitter } = require('./antiban');
      parsed = applyAntiHashJitter(parsed);
    } catch (e) {}
  }

  return parsed;
}

function getContactUniqueKey(contact, idx) {
  if (!contact) return `idx_${idx}`;
  return String(contact.id || contact.phone || contact.remote_jid || `idx_${idx}`);
}

function buildTargetDest(channel, contact, defaultDdi = '66') {
  if (channel === 'telegram') {
    const raw = String(contact.phone || contact.remote_jid || '').trim();
    if (!raw) return { error: `Contato ${contact.name} não possui número ou Chat ID cadastrado.` };
    if (raw.endsWith('@telegram')) return { targetDest: raw };
    const clean = raw.replace('@telegram', '').trim();
    return { targetDest: `${clean}@telegram` };
  }

  const rawPhone = String(contact.phone || contact.remote_jid || '').trim();
  if (!rawPhone || rawPhone === '@s.whatsapp.net' || rawPhone === '@lid') {
    return { error: `Contato ${contact.name} não possui número de telefone cadastrado.` };
  }
  if (rawPhone.endsWith('@s.whatsapp.net') || rawPhone.endsWith('@lid')) {
    return { targetDest: rawPhone };
  }

  const hasPlus = rawPhone.startsWith('+') || rawPhone.startsWith('00');
  const digits = rawPhone.replace(/^00/, '').replace(/\D/g, '');
  if (!digits) {
    return { error: `Número de telefone inválido para ${contact.name}.` };
  }

  let targetDest = '';
  if (hasPlus) {
    if (digits.startsWith('66')) {
      let rest = digits.slice(2);
      if (rest.startsWith('0')) rest = rest.slice(1);
      targetDest = `66${rest}@s.whatsapp.net`;
    } else {
      targetDest = `${digits}@s.whatsapp.net`;
    }
  } else if (digits.startsWith('66') && digits.length >= 10 && digits.length <= 12) {
    let rest = digits.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    targetDest = `66${rest}@s.whatsapp.net`;
  } else if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    targetDest = `${digits}@s.whatsapp.net`;
  } else if (digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
    targetDest = `66${digits.slice(1)}@s.whatsapp.net`;
  } else if (digits.length === 9 && ['8', '9', '6'].includes(digits[0]) && defaultDdi === '66') {
    targetDest = `66${digits}@s.whatsapp.net`;
  } else if (digits.length >= 12) {
    targetDest = `${digits}@s.whatsapp.net`;
  } else if (digits.length === 11 && digits.startsWith('1') && !['11','12','13','14','15','16','17','18','19'].includes(digits.slice(0, 2))) {
    targetDest = `${digits}@s.whatsapp.net`;
  } else if (digits.length === 11 && (digits.startsWith('34') || digits.startsWith('33') || digits.startsWith('56'))) {
    targetDest = `${digits}@s.whatsapp.net`;
  } else if (defaultDdi === '55' && (digits.length === 10 || (digits.length === 11 && digits[2] === '9'))) {
    targetDest = `55${digits}@s.whatsapp.net`;
  } else if (defaultDdi && digits.length <= 10) {
    let rest = digits;
    if (defaultDdi === '66' && rest.startsWith('0')) rest = rest.slice(1);
    targetDest = `${defaultDdi}${rest}@s.whatsapp.net`;
  } else {
    targetDest = `${digits}@s.whatsapp.net`;
  }

  return { targetDest };
}

function interruptibleSleep(runtime, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      runtime.wakeUp = null;
      resolve();
    }, ms);
    runtime.wakeUp = () => {
      clearTimeout(timer);
      runtime.wakeUp = null;
      resolve();
    };
  });
}

async function sendSingleMessage(workspaceId, targetDest, text, file, contactName, simulateTyping, options = {}) {
  if (targetDest && targetDest.endsWith('@telegram')) {
    const telegramUserApi = require('./telegram_user');
    const userStatus = await telegramUserApi.getStatus(workspaceId);
    if (userStatus && userStatus.connected) {
      return await telegramUserApi.sendMessage(workspaceId, targetDest, text, file, contactName);
    }
    const telegramApi = require('./telegram');
    return await telegramApi.sendMessage(workspaceId, targetDest, text, file, contactName);
  } else {
    const whatsappApi = require('./whatsapp');
    return await whatsappApi.sendMessage(workspaceId, targetDest, text, file, contactName, {
      simulateTyping: simulateTyping !== false,
      enableAntiHash: options.enableAntiHash !== false
    });
  }
}

async function runCampaignLoop(workspaceId, listId) {
  const key = getKey(workspaceId, listId);
  const state = campaigns[key];
  const runtime = runtimes[key];
  if (!state || !runtime) return;

  const database = await db.getDB();
  const contacts = await loadContactsForLists(database, workspaceId, listId);

  state.total = contacts.length;
  const channel = state.channel || 'whatsapp';
  const channelName = channel === 'telegram' ? 'Telegram' : 'WhatsApp';
  const cfg = state.config || {};
  const minDelay = Math.max(1, Number(cfg.minDelay) || 25);
  const maxDelay = Math.max(minDelay, Number(cfg.maxDelay) || 50);
  const batchSize = Math.max(1, Number(cfg.batchSize) || 12);
  const batchPause = Math.max(5, Number(cfg.batchPause) || 120);
  const simulateTyping = cfg.simulateTyping !== false;
  const enableDailyLimit = cfg.enableDailyLimit !== false;
  const dailySafeLimit = Math.max(5, Number(cfg.dailySafeLimit) || 35);
  const defaultDdi = cfg.defaultDdi || '66';

  const sentSet = new Set(Array.isArray(state.processedKeys) ? state.processedKeys : []);
  let sentCount = Number(state.sent) || 0;
  let failCount = Number(state.failed) || 0;
  let sessionSentCount = 0;
  let pausedAtIndex = null;
  const startIdx = Math.max(0, Number(state.resumeIndex) || 0);

  for (let i = startIdx; i < contacts.length; i++) {
    if (runtime.stopRequested) {
      addCampaignLog(state, 'warning', '⏹️ Disparo encerrado e fila zerada pelo usuário.');
      break;
    }

    if (runtime.pauseRequested) {
      pausedAtIndex = i;
      addCampaignLog(state, 'warning', `⏸️ Disparo pausado no contato #${i + 1} de ${contacts.length}. Você pode retomar de onde parou quando desejar.`);
      break;
    }

    const contact = contacts[i];
    const contactKey = getContactUniqueKey(contact, i);

    if (sentSet.has(contactKey)) {
      continue;
    }

    // Janela de Horário Seguro Anti-Ban (08:00 às 20:00)
    if (cfg.safeHoursOnly) {
      const { isWithinSafeHours } = require('./antiban');
      if (!isWithinSafeHours(8, 20)) {
        pausedAtIndex = i;
        addCampaignLog(
          state,
          'warning',
          `🌙 [ANTI-BAN] Janela de Horário Seguro ativa (08:00 às 20:00). Disparo pausado no contato #${i + 1} durante a noite para evitar denúncias de spam por incômodo aos contatos. Retome a partir das 08:00!`
        );
        break;
      }
    }

    // Opt-out check
    if (channel === 'whatsapp' && contact.status === 'Opt-out') {
      addCampaignLog(state, 'warning', `⏭️ [WHATSAPP] Ignorado: Contato ${contact.name} solicitou Opt-out previamente.`);
      sentSet.add(contactKey);
      state.resumeIndex = i + 1;
      state.processedKeys = Array.from(sentSet);
      savePersistedState();
      continue;
    }

    // Trava Diária Anti-Ban por etapa (multiplica pela quantidade de linhas/contas conectadas em rodízio)
    const activeChannelSlots = channel === 'whatsapp'
      ? require('./whatsapp').getConnectedSlots(workspaceId)
      : require('./telegram_user').getConnectedSlots(workspaceId);
    const activeLinesCount = Math.max(1, activeChannelSlots.length);
    const effectiveDailyLimit = dailySafeLimit * activeLinesCount;
    const effectiveBatchSize = batchSize * activeLinesCount;

    if ((channel === 'whatsapp' || channel === 'telegram') && enableDailyLimit && sessionSentCount >= effectiveDailyLimit) {
      pausedAtIndex = i;
      addCampaignLog(
        state,
        'warning',
        `🛡️ [ANTI-BAN] Trava de segurança atingida (${effectiveDailyLimit} envios nesta etapa em ${activeLinesCount} conta(s)). Disparo pausado no contato #${i + 1} — você pode retomar de onde parou depois.`
      );
      break;
    }

    // Pausa em lote Anti-Ban
    if (sessionSentCount > 0 && sessionSentCount % effectiveBatchSize === 0) {
      addCampaignLog(state, 'warning', `⏸️ Pausa anti-ban automática: aguardando ${batchPause} segundos após ${effectiveBatchSize} envios...`);
      savePersistedState();
      for (let p = 0; p < batchPause; p++) {
        if (runtime.stopRequested || runtime.pauseRequested) break;
        await interruptibleSleep(runtime, 1000);
      }
      if (runtime.stopRequested) {
        addCampaignLog(state, 'warning', '⏹️ Disparo encerrado pelo usuário.');
        break;
      }
      if (runtime.pauseRequested) {
        pausedAtIndex = i;
        addCampaignLog(state, 'warning', `⏸️ Disparo pausado no contato #${i + 1} de ${contacts.length}. Você pode retomar de onde parou quando desejar.`);
        break;
      }
      addCampaignLog(state, 'info', `▶️ Retomando envios via ${channelName}...`);
    }

    const destResult = buildTargetDest(channel, contact, defaultDdi);
    if (destResult.error) {
      failCount++;
      sentSet.add(contactKey);
      state.sent = sentCount;
      state.failed = failCount;
      state.resumeIndex = i + 1;
      state.processedKeys = Array.from(sentSet);
      addCampaignLog(state, 'error', `✗ [${channelName.toUpperCase()}] Ignorado: ${destResult.error}`);
      savePersistedState();
      continue;
    }

    const targetDest = destResult.targetDest;
    const displayDest = targetDest.replace('@s.whatsapp.net', '').replace('@telegram', '').replace('@lid', '');

    // Prepara lista de mensagens/templates da campanha (suporta rodízio entre templates ou envio sequencial)
    const rawTemplates = Array.isArray(state.messageTemplates)
      ? state.messageTemplates
          .map((t, idx) => (typeof t === 'string' ? { title: `Mensagem #${idx + 1}`, content: t } : t))
          .filter(t => t && String(t.content || '').trim())
      : [];
    const activeTemplates = rawTemplates.length > 0
      ? rawTemplates
      : [{ title: 'Mensagem Principal', content: state.messageText || '' }];
    const multiMode = state.multiMessageMode === 'sequence' ? 'sequence' : 'rotate';

    const messagesToSend = multiMode === 'sequence' && activeTemplates.length > 1
      ? activeTemplates
      : [activeTemplates[i % activeTemplates.length]];

    if (channel === 'whatsapp' && simulateTyping) {
      addCampaignLog(state, 'info', `✍️ [${channelName.toUpperCase()}] Simulando presença "Digitando..." para ${contact.name}...`);
    }
    const tplHeader = activeTemplates.length > 1
      ? (multiMode === 'sequence'
          ? ` (${messagesToSend.length} mensagens em sequência)`
          : ` [Template: ${messagesToSend[0].title || `#${(i % activeTemplates.length) + 1}`}]`)
      : '';
    addCampaignLog(state, 'info', `[${i + 1}/${contacts.length}] [${channelName.toUpperCase()}] Enviando para ${contact.name} (${displayDest})${tplHeader}...`);
    savePersistedState();

    let channelDisconnected = false;
    try {
      let lastSentRes = null;
      for (let mIdx = 0; mIdx < messagesToSend.length; mIdx++) {
        const tplItem = messagesToSend[mIdx];
        const contactMsg = formatMessageForContact(tplItem.content, contact, cfg);
        const fileForThisMsg = mIdx === 0 ? state.file : null;
        lastSentRes = await sendSingleMessage(workspaceId, targetDest, contactMsg, fileForThisMsg, contact.name || '', simulateTyping, {
          enableAntiHash: cfg.enableAntiHash !== false
        });
        if (mIdx < messagesToSend.length - 1) {
          await interruptibleSleep(runtime, 2000 + Math.floor(Math.random() * 1500));
        }
      }
      sentCount++;
      sessionSentCount++;
      sentSet.add(contactKey);
      const slotTag = lastSentRes && lastSentRes.usedSlot
        ? `${channelName.toUpperCase()} Linha #${lastSentRes.usedSlot}${lastSentRes.usedPhone ? ' • ' + lastSentRes.usedPhone : ''}`
        : channelName.toUpperCase();
      addCampaignLog(state, 'success', `✓ [${slotTag}] Enviado com sucesso para ${contact.name} (${displayDest})${tplHeader}`);
    } catch (err) {
      const errDetail = err?.message || 'Erro no envio';
      if (errDetail.toLowerCase().includes('não possui conta ativa no whatsapp')) {
        failCount++;
        sentSet.add(contactKey);
        addCampaignLog(state, 'warning', `⏭️ [${channelName.toUpperCase()}] Ignorado: ${contact.name} (${displayDest}) não tem WhatsApp ativo (proteção anti-ban).`);
      } else if (errDetail.toLowerCase().includes('desconectado') || errDetail.toLowerCase().includes('não está conectado')) {
        // Verifica se ainda existem outras linhas ativas conectadas no rodízio
        const remainingSlots = channel === 'whatsapp'
          ? require('./whatsapp').getConnectedSlots(workspaceId)
          : require('./telegram_user').getConnectedSlots(workspaceId);

        if (remainingSlots.length > 0) {
          addCampaignLog(
            state,
            'warning',
            `⚠️ [${channelName.toUpperCase()}] Uma das linhas desconectou. O sistema continuará automaticamente através das ${remainingSlots.length} linha(s) restante(s)...`
          );
          // Marca o contato atual como pendente para tentar na próxima linha ou continua
          i--; // Tenta reenviar este mesmo contato na próxima linha ativa
          await interruptibleSleep(runtime, 3000);
          continue;
        } else {
          pausedAtIndex = i;
          channelDisconnected = true;
          addCampaignLog(
            state,
            'error',
            `🛑 [${channelName.toUpperCase()}] Disparo pausado no contato #${i + 1}: todas as linhas foram desconectadas. Reconecte e clique em "Continuar de onde parou".`
          );
        }
      } else {
        failCount++;
        sentSet.add(contactKey);
        addCampaignLog(state, 'error', `✗ [${channelName.toUpperCase()}] Falha ao enviar para ${contact.name}: ${errDetail}`);
      }
    }

    state.sent = sentCount;
    state.failed = failCount;

    if (channelDisconnected) {
      break;
    }

    const nextIdx = i + 1;
    if (nextIdx < contacts.length) {
      state.resumeIndex = nextIdx;
      state.processedKeys = Array.from(sentSet);
      savePersistedState();
    }

    if (runtime.pauseRequested) {
      pausedAtIndex = nextIdx;
      if (pausedAtIndex < contacts.length) {
        addCampaignLog(state, 'warning', `⏸️ Disparo pausado após o contato #${i + 1}. Próximo da fila: #${pausedAtIndex + 1} (${contacts[pausedAtIndex]?.name || 'Contato'}).`);
      }
      break;
    }

    if (i < contacts.length - 1 && !runtime.stopRequested) {
      const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      addCampaignLog(state, 'info', `⏳ Intervalo de segurança: aguardando ${delaySec}s...`);
      savePersistedState();
      for (let s = 0; s < delaySec; s++) {
        if (runtime.stopRequested || runtime.pauseRequested) break;
        await interruptibleSleep(runtime, 1000);
      }
      if (runtime.pauseRequested) {
        pausedAtIndex = i + 1;
        addCampaignLog(state, 'warning', `⏸️ Disparo pausado no intervalo. Próximo contato ao retomar: #${pausedAtIndex + 1} (${contacts[pausedAtIndex]?.name || 'Contato'}).`);
        break;
      }
    }
  }

  if (runtime.stopRequested) {
    state.status = 'idle';
    state.resumeIndex = 0;
    state.processedKeys = [];
  } else if (pausedAtIndex !== null && pausedAtIndex < contacts.length) {
    state.status = 'paused';
    state.resumeIndex = pausedAtIndex;
    state.processedKeys = Array.from(sentSet);
  } else {
    state.status = 'completed';
    state.resumeIndex = 0;
    state.processedKeys = [];
    addCampaignLog(state, 'success', `🎉 Disparo via ${channelName} finalizado! Total: ${contacts.length} | Enviados: ${sentCount} | Falhas: ${failCount}`);
  }

  delete runtimes[key];
  savePersistedState();
}

async function startCampaign(workspaceId, params) {
  const listId = normalizeListKey(params.listId || '');
  if (!listId) throw new Error('Selecione ao menos uma lista de contatos.');

  const key = getKey(workspaceId, listId);
  if (runtimes[key] && campaigns[key]?.status === 'running') {
    return campaigns[key];
  }

  const database = await db.getDB();
  const contacts = await loadContactsForLists(database, workspaceId, listId);
  if (!contacts || contacts.length === 0) {
    throw new Error('As listas selecionadas não possuem contatos cadastrados para envio.');
  }

  const existing = campaigns[key];
  const isResuming = Boolean(
    params.resume &&
    existing &&
    existing.resumeIndex > 0 &&
    existing.resumeIndex < contacts.length
  );

  const channel = params.channel || existing?.channel || 'whatsapp';
  const channelName = channel === 'telegram' ? 'Telegram' : 'WhatsApp';

  const state = isResuming
    ? {
        ...existing,
        status: 'running',
        total: contacts.length,
        channel,
        messageText: params.messageText || existing.messageText || '',
        messageTemplates: Array.isArray(params.messageTemplates) && params.messageTemplates.length > 0
          ? params.messageTemplates
          : (existing.messageTemplates || []),
        multiMessageMode: params.multiMessageMode || existing.multiMessageMode || 'rotate',
        file: params.file || existing.file || null,
        config: { ...(existing.config || {}), ...(params.config || {}) },
        updatedAt: Date.now()
      }
    : {
        workspaceId: Number(workspaceId),
        listId,
        status: 'running',
        channel,
        messageText: params.messageText || '',
        messageTemplates: Array.isArray(params.messageTemplates) ? params.messageTemplates : [],
        multiMessageMode: params.multiMessageMode || 'rotate',
        file: params.file || null,
        config: params.config || {},
        total: contacts.length,
        sent: 0,
        failed: 0,
        resumeIndex: 0,
        processedKeys: [],
        logs: [
          {
            id: Date.now(),
            time: new Date().toLocaleTimeString('pt-BR'),
            type: 'info',
            text: 'Sistema pronto. Iniciando campanha em segundo plano...'
          }
        ],
        updatedAt: Date.now()
      };

  if (isResuming) {
    const remaining = contacts.length - state.resumeIndex;
    addCampaignLog(
      state,
      'info',
      `▶️ Retomando campanha em segundo plano via ${channelName} a partir do contato #${state.resumeIndex + 1} (${remaining} restantes de ${contacts.length}).`
    );
  } else {
    addCampaignLog(
      state,
      'info',
      `🚀 Campanha iniciada em segundo plano via ${channelName} para ${contacts.length} contatos (continua ativa mesmo se você sair da aba).`
    );
  }

  campaigns[key] = state;
  runtimes[key] = {
    stopRequested: false,
    pauseRequested: false,
    wakeUp: null
  };
  savePersistedState();

  // Dispara loop em background sem bloquear a requisição HTTP
  runCampaignLoop(workspaceId, listId).catch((err) => {
    console.error('[MassDispatcher] Erro fatal no loop de campanha:', err);
    if (campaigns[key]) {
      campaigns[key].status = 'paused';
      addCampaignLog(campaigns[key], 'error', `Erro inesperado no motor de disparo: ${err.message}`);
      savePersistedState();
    }
    delete runtimes[key];
  });

  return state;
}

function pauseCampaign(workspaceId, listId) {
  const key = getKey(workspaceId, listId);
  const runtime = runtimes[key];
  const state = campaigns[key];
  if (runtime) {
    runtime.pauseRequested = true;
    if (runtime.wakeUp) runtime.wakeUp();
  }
  if (state) {
    addCampaignLog(state, 'warning', '⏸️ Solicitação de pausa recebida. Salvando posição atual da fila...');
    savePersistedState();
  }
  return state || null;
}

function stopCampaign(workspaceId, listId) {
  const key = getKey(workspaceId, listId);
  const runtime = runtimes[key];
  const state = campaigns[key];
  if (runtime) {
    runtime.stopRequested = true;
    runtime.pauseRequested = false;
    if (runtime.wakeUp) runtime.wakeUp();
  }
  if (state) {
    state.status = 'idle';
    state.resumeIndex = 0;
    state.processedKeys = [];
    addCampaignLog(state, 'warning', '⏹️ Solicitação de encerramento recebida. Parando envio e zerando fila...');
    savePersistedState();
  }
  return state || null;
}

function resetCampaign(workspaceId, listId) {
  const key = getKey(workspaceId, listId);
  const runtime = runtimes[key];
  if (runtime) {
    runtime.stopRequested = true;
    if (runtime.wakeUp) runtime.wakeUp();
    delete runtimes[key];
  }
  const state = campaigns[key];
  if (state) {
    state.status = 'idle';
    state.resumeIndex = 0;
    state.sent = 0;
    state.failed = 0;
    state.processedKeys = [];
    addCampaignLog(state, 'info', '🔄 Progresso reiniciado. O próximo disparo começará do primeiro contato da lista.');
    savePersistedState();
  }
  return state || null;
}

function getCampaignStatus(workspaceId, listId) {
  const wsPrefix = `${workspaceId}_`;
  let activeInWorkspace = null;

  for (const [k, val] of Object.entries(campaigns)) {
    if (k.startsWith(wsPrefix) && val) {
      if (val.status === 'running') {
        activeInWorkspace = val;
        break;
      }
      if (val.status === 'paused' && !activeInWorkspace) {
        activeInWorkspace = val;
      }
    }
  }

  const requested = listId ? campaigns[getKey(workspaceId, listId)] || null : null;
  return {
    campaign: requested,
    activeInWorkspace
  };
}

module.exports = {
  startCampaign,
  pauseCampaign,
  stopCampaign,
  resetCampaign,
  getCampaignStatus
};

