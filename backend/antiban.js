/**
 * Política Anti-Ban (inspirada na Evolution API)
 *
 * - Fila serial por canal/workspace (nunca envia duas mensagens em paralelo)
 * - Intervalo aleatório (jitter) entre envios consecutivos
 * - Limites de volume por minuto / hora / dia
 * - Cooldown automático quando a plataforma sinaliza rate limit (FloodWait / 429)
 *
 * Todos os valores podem ser ajustados via variáveis de ambiente, ex.:
 *   ANTIBAN_ENABLED=false
 *   ANTIBAN_WHATSAPP_MIN_DELAY_MS=3000
 *   ANTIBAN_WHATSAPP_MAX_DELAY_MS=8000
 *   ANTIBAN_WHATSAPP_PER_MINUTE=10
 *   ANTIBAN_WHATSAPP_PER_HOUR=120
 *   ANTIBAN_WHATSAPP_PER_DAY=800
 * (mesmo padrão para TELEGRAM_USER e TELEGRAM_BOT)
 */

const DEFAULTS = {
  whatsapp:      { minDelayMs: 3000, maxDelayMs: 8000, perMinute: 10, perHour: 120,  perDay: 800 },
  telegram_user: { minDelayMs: 1500, maxDelayMs: 4000, perMinute: 15, perHour: 300,  perDay: 1500 },
  telegram_bot:  { minDelayMs: 500,  maxDelayMs: 1500, perMinute: 30, perHour: 1000, perDay: 5000 }
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const states = {};

function envNumber(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function getConfig(channel) {
  const base = DEFAULTS[channel] || DEFAULTS.whatsapp;
  const p = `ANTIBAN_${channel.toUpperCase()}_`;
  return {
    minDelayMs: envNumber(`${p}MIN_DELAY_MS`, base.minDelayMs),
    maxDelayMs: envNumber(`${p}MAX_DELAY_MS`, base.maxDelayMs),
    perMinute: envNumber(`${p}PER_MINUTE`, base.perMinute),
    perHour: envNumber(`${p}PER_HOUR`, base.perHour),
    perDay: envNumber(`${p}PER_DAY`, base.perDay)
  };
}

function isEnabled() {
  return String(process.env.ANTIBAN_ENABLED || 'true').toLowerCase() !== 'false';
}

function getState(channel, workspaceId) {
  const key = `${channel}:${workspaceId}`;
  if (!states[key]) {
    states[key] = { chain: Promise.resolve(), lastSentAt: 0, sentAt: [], blockedUntil: 0 };
  }
  return states[key];
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomBetween = (min, max) => min + Math.floor(Math.random() * (Math.max(max, min) - min + 1));

// Detecta sinais de rate limit da plataforma e devolve o tempo de espera em ms (ou 0)
function rateLimitCooldownMs(err) {
  const msg = String(err?.message || err || '');
  const flood = msg.match(/FLOOD(?:_PREMIUM)?_WAIT_?(\d+)?/i);
  if (flood) {
    const secs = Number(err?.seconds) || Number(flood[1]) || 60;
    return secs * 1000;
  }
  if (err?.output?.statusCode === 429 || err?.data === 429 || /rate-overlimit|too many requests|429/i.test(msg)) {
    return 60 * 1000;
  }
  return 0;
}

/**
 * Executa `sendFn` respeitando a política anti-ban do canal.
 * @param {'whatsapp'|'telegram_user'|'telegram_bot'} channel
 * @param {number|string} workspaceId
 * @param {() => Promise<any>} sendFn
 */
async function run(channel, workspaceId, sendFn) {
  if (!isEnabled()) return sendFn();

  const cfg = getConfig(channel);
  const st = getState(channel, workspaceId);

  // Entra na fila serial
  const previous = st.chain;
  let release;
  st.chain = new Promise(resolve => { release = resolve; });
  await previous;

  try {
    const now = Date.now();

    // Cooldown ativo após rate limit da plataforma
    if (st.blockedUntil > now) {
      const secs = Math.ceil((st.blockedUntil - now) / 1000);
      throw new Error(`Anti-ban: envio pausado por ${secs}s devido a limite temporário da plataforma. Tente novamente mais tarde.`);
    }

    // Limpa histórico antigo
    st.sentAt = st.sentAt.filter(t => now - t < DAY);

    const inLast = (windowMs) => st.sentAt.filter(t => now - t < windowMs).length;

    if (cfg.perDay > 0 && inLast(DAY) >= cfg.perDay) {
      throw new Error(`Anti-ban: limite diário de ${cfg.perDay} mensagens atingido neste canal. Retome amanhã para proteger sua conta.`);
    }
    if (cfg.perHour > 0 && inLast(HOUR) >= cfg.perHour) {
      throw new Error(`Anti-ban: limite de ${cfg.perHour} mensagens por hora atingido neste canal. Aguarde um pouco para proteger sua conta.`);
    }

    // Limite por minuto: aguarda a janela liberar (com jitter)
    if (cfg.perMinute > 0) {
      const recent = st.sentAt.filter(t => now - t < MINUTE);
      if (recent.length >= cfg.perMinute) {
        const waitMs = MINUTE - (now - recent[0]) + randomBetween(500, 2000);
        console.log(`🛡️ [AntiBan:${channel}] Limite por minuto atingido, aguardando ${Math.ceil(waitMs / 1000)}s...`);
        await sleep(waitMs);
      }
    }

    // Intervalo aleatório desde o último envio
    const gap = randomBetween(cfg.minDelayMs, cfg.maxDelayMs);
    const elapsed = Date.now() - st.lastSentAt;
    if (st.lastSentAt && elapsed < gap) {
      await sleep(gap - elapsed);
    }

    st.sentAt.push(Date.now());
    st.lastSentAt = Date.now();

    try {
      return await sendFn();
    } catch (err) {
      const cooldown = rateLimitCooldownMs(err);
      if (cooldown > 0) {
        st.blockedUntil = Date.now() + cooldown;
        console.warn(`🛡️ [AntiBan:${channel}] Rate limit detectado, canal pausado por ${Math.ceil(cooldown / 1000)}s (workspace ${workspaceId}).`);
      }
      throw err;
    } finally {
      st.lastSentAt = Date.now();
    }
  } finally {
    release();
  }
}

// Estado atual (útil para diagnóstico/UI)
function getStats(channel, workspaceId) {
  const st = getState(channel, workspaceId);
  const now = Date.now();
  const count = (w) => st.sentAt.filter(t => now - t < w).length;
  return {
    config: getConfig(channel),
    sentLastMinute: count(MINUTE),
    sentLastHour: count(HOUR),
    sentLastDay: count(DAY),
    blockedForSeconds: Math.max(0, Math.ceil((st.blockedUntil - now) / 1000))
  };
}

module.exports = { run, getStats, getConfig };

