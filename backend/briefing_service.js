const db = require('./db');
const { getUpcomingBookings, checkAndSend24hReminders } = require('./reminder_service');

const SHORT_DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Coleta todos os dados consolidados do sistema para o resumo executivo
 */
async function getBriefingData(workspaceId = 1) {
  const database = await db.getDB();
  const now = new Date();

  // Datas de Hoje e Amanhã no fuso de São Paulo
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  const dayOfWeek = SHORT_DAYS[now.getDay()];
  const formattedToday = `${dayOfWeek}, ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}`;

  // 1. E-mails (Hostinger / IMAP)
  let emailStats = { total: 0, unread: 0, recent: [] };
  try {
    const emailCounts = await database.get(
      `SELECT 
        COUNT(*) as total, 
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread 
       FROM email_messages WHERE workspace_id = ?`,
      [workspaceId]
    );
    const recentEmails = await database.all(
      `SELECT sender, sender_name, subject, date, is_read 
       FROM email_messages 
       WHERE workspace_id = ? 
       ORDER BY date DESC LIMIT 4`,
      [workspaceId]
    );
    emailStats = {
      total: emailCounts?.total || 0,
      unread: emailCounts?.unread || 0,
      recent: recentEmails || []
    };
  } catch (e) {
    console.warn('[BriefingService] Erro ao consultar emails:', e.message);
  }

  // 2. Agenda (Cal.com + banco local)
  let todayBookings = [];
  let tomorrowBookings = [];
  let unconfirmedTomorrow = [];

  try {
    const allBookings = await getUpcomingBookings(workspaceId);
    
    // Filtra reuniões de hoje e amanhã
    for (const b of allBookings) {
      const bDate = new Date(b.start);
      const bDateStr = bDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      
      const timeStr = bDate.toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        timeZone: 'America/Sao_Paulo' 
      });

      const bookingItem = {
        id: b.id,
        title: b.title || 'Reunião',
        attendeeName: b.attendeeName || 'Cliente',
        attendeePhone: b.attendeePhone || '',
        time: timeStr,
        start: b.start
      };

      if (bDateStr === todayStr) {
        todayBookings.push(bookingItem);
      } else if (bDateStr === tomorrowStr) {
        tomorrowBookings.push(bookingItem);

        // Verifica se já teve lembrete enviado
        const log = await database.get(
          'SELECT id FROM reminder_logs WHERE workspace_id = ? AND booking_id = ? AND status = "sent"',
          [workspaceId, b.id]
        );
        if (!log) {
          unconfirmedTomorrow.push(bookingItem);
        }
      }
    }
  } catch (e) {
    console.warn('[BriefingService] Erro ao consultar agenda:', e.message);
  }

  // 3. Métricas de Mensagens WhatsApp e Telegram (últimas 24h)
  let messageStats = { total: 0, sent: 0, received: 0, whatsapp: 0, telegram: 0 };
  const yesterdaySec = Math.floor((now.getTime() - 24 * 60 * 60 * 1000) / 1000);
  try {
    const msgData = await database.get(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) as received,
        SUM(CASE WHEN remote_jid LIKE '%@telegram' THEN 1 ELSE 0 END) as telegram,
        SUM(CASE WHEN remote_jid NOT LIKE '%@telegram' THEN 1 ELSE 0 END) as whatsapp
       FROM messages 
       WHERE workspace_id = ? AND timestamp >= ?`,
      [workspaceId, yesterdaySec]
    );
    if (msgData) {
      messageStats = {
        total: msgData.total || 0,
        sent: msgData.sent || 0,
        received: msgData.received || 0,
        whatsapp: msgData.whatsapp || 0,
        telegram: msgData.telegram || 0
      };
    }
  } catch (e) {
    console.warn('[BriefingService] Erro ao consultar mensagens:', e.message);
  }

  // 4. Novos Contatos no CRM (últimas 24h)
  let contactStats = { newContacts: 0, totalContacts: 0 };
  try {
    const newCount = await database.get(
      `SELECT COUNT(*) as count FROM contacts 
       WHERE workspace_id = ? AND created_at >= datetime('now', '-24 hours')`,
      [workspaceId]
    );
    const totalCount = await database.get(
      'SELECT COUNT(*) as count FROM contacts WHERE workspace_id = ?',
      [workspaceId]
    );
    contactStats = {
      newContacts: newCount?.count || 0,
      totalContacts: totalCount?.count || 0
    };
  } catch (e) {
    console.warn('[BriefingService] Erro ao consultar contatos:', e.message);
  }

  return {
    dateFormatted: formattedToday,
    emailStats,
    todayBookings,
    tomorrowBookings,
    unconfirmedTomorrow,
    messageStats,
    contactStats
  };
}

/**
 * Constrói o texto do relatório executivo perfeitamente formatado para WhatsApp/Telegram
 */
function buildBriefingText(data) {
  const {
    dateFormatted,
    emailStats,
    todayBookings,
    tomorrowBookings,
    unconfirmedTomorrow,
    messageStats,
    contactStats
  } = data;

  let text = `👔 *RESUMO EXECUTIVO DO SISTEMA*\n`;
  text += `🗓️ _${dateFormatted}_\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // 1. E-mails Recebidos
  text += `📬 *E-MAILS RECEBIDOS (Hostinger)*\n`;
  if (emailStats.unread > 0) {
    text += `• *${emailStats.unread} novo(s) e-mail(s) não lido(s)*\n`;
  } else {
    text += `• Caixa em dia (nenhum e-mail pendente)\n`;
  }
  if (emailStats.recent && emailStats.recent.length > 0) {
    emailStats.recent.forEach(em => {
      const sender = em.sender_name || em.sender || 'Remetente';
      const cleanSubj = (em.subject || 'Sem assunto').slice(0, 45);
      text += `  ▫️ *${sender}*: ${cleanSubj}\n`;
    });
  } else {
    text += `  _Nenhum e-mail recente registrado_\n`;
  }
  text += `\n`;

  // 2. Agenda de Hoje
  text += `📅 *AGENDA DE HOJE*\n`;
  if (todayBookings.length > 0) {
    todayBookings.forEach(b => {
      text += `• ⏰ *${b.time}* - ${b.attendeeName} (${b.title})\n`;
    });
  } else {
    text += `• _Nenhum agendamento marcado para hoje._\n`;
  }
  text += `\n`;

  // 3. Agenda do Dia Seguinte (Amanhã)
  text += `📆 *AGENDA DE AMANHÃ*\n`;
  if (tomorrowBookings.length > 0) {
    tomorrowBookings.forEach(b => {
      text += `• ⏰ *${b.time}* - ${b.attendeeName} (${b.title})\n`;
    });
  } else {
    text += `• _Nenhum compromisso marcado para amanhã._\n`;
  }
  text += `\n`;

  // 4. Pergunta de Confirmação de Reunião
  text += `❓ *CONFIRMAÇÃO DE REUNIÕES*\n`;
  if (unconfirmedTomorrow.length > 0) {
    text += `Temos *${unconfirmedTomorrow.length} reunião(ões)* para amanhã com confirmação pendente:\n`;
    unconfirmedTomorrow.forEach(b => {
      text += `▫️ ${b.attendeeName} às ${b.time}\n`;
    });
    text += `\n👉 *Posso disparar as confirmações de 24h para esses participantes agora?*\n`;
    text += `_(Responda *"SIM"* nesta conversa para eu enviar as confirmações automaticamente)_\n`;
  } else if (tomorrowBookings.length > 0) {
    text += `✅ Todos os compromissos de amanhã já receberam lembrete de confirmação.\n`;
  } else {
    text += `Não há reuniões pendentes de confirmação para amanhã.\n`;
  }
  text += `\n`;

  // 5. Resumo WhatsApp e Telegram
  text += `📊 *RESULTADOS WHATSAPP & TELEGRAM (Últimas 24h)*\n`;
  text += `• 📱 *WhatsApp*: ${messageStats.whatsapp} mensagens (${messageStats.sent} env / ${messageStats.received} rec)\n`;
  text += `• ✈️ *Telegram*: ${messageStats.telegram} mensagens trocadas\n`;
  text += `• 👥 *Novos Leads*: +${contactStats.newContacts} contatos no CRM (Total: ${contactStats.totalContacts})\n\n`;

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `_Gerado automaticamente pelo Agente Sofia no Unico CRM._`;

  return text;
}

/**
 * Envia o resumo executivo para o WhatsApp ou Telegram do gestor
 */
async function sendBriefingNow(workspaceId = 1, options = {}) {
  const database = await db.getDB();
  const ws = await database.get(
    `SELECT 
      briefing_enabled, briefing_channel, briefing_target_phone, 
      briefing_time, telegram_phone 
     FROM workspaces WHERE id = ?`,
    [workspaceId]
  );

  const channel = options.channel || ws?.briefing_channel || 'whatsapp';
  let targetPhone = options.targetPhone || ws?.briefing_target_phone || ws?.telegram_phone || '';

  if (!targetPhone) {
    throw new Error('Número de telefone do gestor não configurado. Por favor, informe o telefone de destino.');
  }

  // Gera dados e texto formatado
  const data = await getBriefingData(workspaceId);
  const text = buildBriefingText(data);

  console.log(`🚀 [BriefingService] Enviando resumo executivo para ${targetPhone} via ${channel.toUpperCase()} (Workspace ${workspaceId})...`);

  let sendResult;
  if (channel === 'telegram') {
    const telegramUser = require('./telegram_user');
    const userStatus = await telegramUser.getStatus(workspaceId);
    if (userStatus && userStatus.connected) {
      sendResult = await telegramUser.sendMessage(workspaceId, targetPhone, text);
    } else {
      const telegramApi = require('./telegram');
      sendResult = await telegramApi.sendMessage(workspaceId, targetPhone, text);
    }
  } else {
    // WhatsApp
    const whatsappApi = require('./whatsapp');
    sendResult = await whatsappApi.sendMessage(workspaceId, targetPhone, text);
  }

  // Salva registro da última emissão
  const nowSec = Math.floor(Date.now() / 1000);
  await database.run(
    'UPDATE workspaces SET briefing_last_sent = ?, briefing_last_text = ? WHERE id = ?',
    [nowSec, text, workspaceId]
  );

  return {
    success: true,
    channel,
    targetPhone,
    data,
    preview: text,
    sentAt: nowSec
  };
}

/**
 * Trata resposta do gestor quando ele responde "SIM" ou "CONFIRMAR" na conversa do briefing
 */
async function handleInboundConfirmation(workspaceId, fromPhone, messageText) {
  if (!messageText) return false;
  const cleanMsg = messageText.trim().toLowerCase();

  // Verifica se é uma intenção de confirmação
  const isConfirm = /^(sim|confirmar|pode confirmar|confirma|ok|pode enviar|dispara|disparar|confirme)$/i.test(cleanMsg) ||
    cleanMsg.includes('pode confirmar') || 
    cleanMsg.includes('confirmar reuniao') || 
    cleanMsg.includes('confirma');

  if (!isConfirm) return false;

  const database = await db.getDB();
  const ws = await database.get('SELECT briefing_target_phone, briefing_channel FROM workspaces WHERE id = ?', [workspaceId]);
  
  if (!ws || !ws.briefing_target_phone) return false;

  const cleanFrom = (fromPhone || '').replace(/\D/g, '');
  const cleanTarget = (ws.briefing_target_phone || '').replace(/\D/g, '');

  // Verifica se a mensagem veio do número do gestor cadastrado
  if (!cleanFrom.includes(cleanTarget) && !cleanTarget.includes(cleanFrom)) {
    return false;
  }

  console.log(`🎯 [BriefingService] Gestor autorizou confirmação de reuniões via mensagem: "${messageText}"!`);

  // Dispara as confirmações de 24h
  const triggerRes = await checkAndSend24hReminders(workspaceId);

  const replyText = `✅ *Comando Executado com Sucesso!*\n\nDisparei as confirmações de presença para a agenda:\n• Agendamentos verificados: ${triggerRes.checked}\n• Confirmações enviadas: ${triggerRes.sent}\n\nQualquer resposta dos clientes será atualizada no seu CRM.`;

  // Responde no canal correspondente
  try {
    if (ws.briefing_channel === 'telegram') {
      const telegramUser = require('./telegram_user');
      await telegramUser.sendMessage(workspaceId, ws.briefing_target_phone, replyText);
    } else {
      const whatsappApi = require('./whatsapp');
      await whatsappApi.sendMessage(workspaceId, ws.briefing_target_phone, replyText);
    }
  } catch (err) {
    console.error('[BriefingService] Erro ao responder confirmação do gestor:', err);
  }

  return true;
}

/**
 * Agendador em segundo plano: verifica periodicamente se é hora de enviar o resumo diário
 */
let briefingInterval = null;

function startBriefingScheduler() {
  if (briefingInterval) clearInterval(briefingInterval);

  console.log('⏰ [BriefingService] Agendador do Resumo Diário Sofia iniciado (verificação a cada 60s)...');

  briefingInterval = setInterval(async () => {
    try {
      const database = await db.getDB();
      const workspaces = await database.all(
        'SELECT id, briefing_enabled, briefing_time, briefing_last_sent, briefing_target_phone FROM workspaces WHERE briefing_enabled = 1'
      );

      if (!workspaces || workspaces.length === 0) return;

      const now = new Date();
      // Formata hora atual no fuso de Brasília: ex "08:30"
      const currentHm = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
      });

      // Início do dia de hoje (00:00:00) em segundos
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;

      for (const ws of workspaces) {
        if (!ws.briefing_target_phone) continue;

        const targetTime = (ws.briefing_time || '08:00').trim();
        const lastSent = ws.briefing_last_sent || 0;

        // Se o horário bate e ainda não foi enviado hoje
        if (currentHm === targetTime && lastSent < startOfToday) {
          console.log(`⏰ [BriefingService] Hora do resumo executivo (${targetTime}) atingida para Workspace ${ws.id}! Disparando...`);
          try {
            await sendBriefingNow(ws.id);
          } catch (sendErr) {
            console.error(`[BriefingService] Erro ao disparar briefing programado para Workspace ${ws.id}:`, sendErr.message);
          }
        }
      }
    } catch (loopErr) {
      console.warn('[BriefingService] Erro no ciclo do agendador:', loopErr.message);
    }
  }, 60 * 1000);
}

module.exports = {
  getBriefingData,
  buildBriefingText,
  sendBriefingNow,
  handleInboundConfirmation,
  startBriefingScheduler
};

