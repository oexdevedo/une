const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const db = require('./db');
const { generateAgentResponseForEmail } = require('./ai_handler');

// Guarda referências dos timers de sincronização em segundo plano
let syncIntervalTimer = null;

/**
 * Cria cliente IMAP para uma conta
 */
function createImapClient(account) {
  const client = new ImapFlow({
    host: account.imap_host || 'imap.hostinger.com',
    port: parseInt(account.imap_port, 10) || 993,
    secure: account.imap_secure === 1 || account.imap_secure === true || account.imap_secure === '1',
    auth: {
      user: account.username || account.email_address,
      pass: account.password
    },
    logger: false,
    greetingTimeout: 30000,
    socketTimeout: 60000,
    tls: {
      rejectUnauthorized: false
    }
  });

  // Captura erros de socket/timeout para evitar crash do processo Node.js
  client.on('error', (err) => {
    console.warn(`[ImapFlow] Erro de socket/timeout capturado com segurança (${account.email_address}):`, err.message);
  });

  return client;
}

/**
 * Cria transportador SMTP para uma conta
 */
function createSmtpTransporter(account) {
  const isSecure = account.smtp_secure === 1 || account.smtp_secure === true || account.smtp_secure === '1';
  return nodemailer.createTransport({
    host: account.smtp_host || 'smtp.hostinger.com',
    port: parseInt(account.smtp_port, 10) || (isSecure ? 465 : 587),
    secure: isSecure,
    auth: {
      user: account.username || account.email_address,
      pass: account.password
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

/**
 * Testa as credenciais de IMAP e SMTP da Hostinger
 */
async function testEmailConnection(accountData) {
  const results = {
    imap: false,
    smtp: false,
    message: ''
  };

  // 1. Testa IMAP
  try {
    const imapClient = createImapClient(accountData);
    await imapClient.connect();
    results.imap = true;
    await imapClient.logout().catch(() => {});
  } catch (err) {
    results.imap = false;
    results.message += `Falha no IMAP (Hostinger): ${err.message}. `;
  }

  // 2. Testa SMTP
  try {
    const transporter = createSmtpTransporter(accountData);
    await transporter.verify();
    results.smtp = true;
  } catch (err) {
    results.smtp = false;
    results.message += `Falha no SMTP (Hostinger): ${err.message}. `;
  }

  if (results.imap && results.smtp) {
    results.success = true;
    results.message = 'Conexão IMAP e SMTP com a Hostinger realizada com sucesso!';
  } else {
    results.success = false;
  }

  return results;
}

/**
 * Sincroniza a caixa de entrada (INBOX) de uma conta
 */
async function syncAccountInbox(accountId) {
  const database = await db.getDB();
  const account = await database.get('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
  if (!account) throw new Error('Conta de e-mail não encontrada');

  const imapClient = createImapClient(account);
  let syncedCount = 0;
  let autoRepliedCount = 0;

  try {
    await imapClient.connect();
    const lock = await imapClient.getMailboxLock('INBOX');

    try {
      const mailbox = imapClient.mailbox;
      const totalMessages = mailbox.exists;

      if (totalMessages > 0) {
        // Busca as últimas 25 mensagens
        const fetchRange = totalMessages > 25 ? `${totalMessages - 24}:*` : '1:*';
        const messages = imapClient.fetch(fetchRange, { source: true, uid: true, envelope: true });

        for await (const msg of messages) {
          try {
            const parsed = await simpleParser(msg.source);
            const messageId = parsed.messageId || `${account.id}-${msg.uid}`;

            // Verifica se já existe no banco
            const existing = await database.get(
              'SELECT id FROM email_messages WHERE account_id = ? AND message_id = ?',
              [account.id, messageId]
            );

            if (!existing) {
              const sender = parsed.from && parsed.from.value && parsed.from.value[0]
                ? parsed.from.value[0].address
                : 'desconhecido';
              const senderName = parsed.from && parsed.from.value && parsed.from.value[0]
                ? parsed.from.value[0].name
                : sender;
              const recipient = parsed.to && parsed.to.value && parsed.to.value[0]
                ? parsed.to.value[0].address
                : account.email_address;
              const subject = parsed.subject || '(Sem assunto)';
              const bodyText = parsed.text || '';
              const bodyHtml = parsed.html || '';
              const snippet = (bodyText || parsed.subject || '').slice(0, 150).replace(/\s+/g, ' ').trim();
              const messageDate = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
              const inReplyTo = parsed.inReplyTo || '';

              // Salva a mensagem recebida
              const insertResult = await database.run(`
                INSERT INTO email_messages (
                  workspace_id, account_id, message_id, in_reply_to, folder,
                  sender, sender_name, recipient, subject, body_text, body_html, snippet,
                  date, is_read, is_replied, ai_replied
                ) VALUES (?, ?, ?, ?, 'INBOX', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
              `, [
                account.workspace_id, account.id, messageId, inReplyTo,
                sender, senderName, recipient, subject, bodyText, bodyHtml, snippet, messageDate
              ]);

              syncedCount++;

              // Auto-resposta pelo Agente de IA se configurado
              if (account.auto_reply_enabled === 1 && account.agent_id && sender !== account.email_address) {
                console.log(`🤖 Agente ${account.agent_id} gerando resposta automática para e-mail de ${sender}...`);
                try {
                  const replyContent = await generateAgentResponseForEmail({
                    workspaceId: account.workspace_id,
                    agentId: account.agent_id,
                    emailSubject: subject,
                    emailBody: bodyText,
                    senderName,
                    senderEmail: sender
                  });

                  if (replyContent) {
                    const replySubject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
                    await sendEmail({
                      accountId: account.id,
                      to: sender,
                      subject: replySubject,
                      text: replyContent,
                      inReplyTo: messageId
                    });

                    await database.run(`
                      UPDATE email_messages
                      SET is_replied = 1, ai_replied = 1, ai_draft = ?
                      WHERE id = ?
                    `, [replyContent, insertResult.lastID]);

                    autoRepliedCount++;
                    console.log(`✅ Resposta enviada com sucesso para ${sender}!`);
                  }
                } catch (aiErr) {
                  console.error('Erro ao auto-responder com IA:', aiErr);
                }
              }
            }
          } catch (itemErr) {
            console.error('Erro ao processar mensagem individual:', itemErr);
          }
        }
      }
    } finally {
      lock.release();
    }

    await imapClient.logout().catch(() => {});

    // Atualiza status da conta
    await database.run(`
      UPDATE email_accounts
      SET status = 'connected', status_message = 'Sincronizado com sucesso', last_sync_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [account.id]);

    return { success: true, syncedCount, autoRepliedCount };
  } catch (err) {
    console.error(`Erro ao sincronizar conta ${accountId}:`, err);
    await database.run(`
      UPDATE email_accounts
      SET status = 'error', status_message = ?
      WHERE id = ?
    `, [err.message, account.id]);
    throw err;
  }
}

/**
 * Envia um e-mail através do SMTP da conta
 */
async function sendEmail({ accountId, to, subject, text, html, inReplyTo }) {
  const database = await db.getDB();
  const account = await database.get('SELECT * FROM email_accounts WHERE id = ?', [accountId]);
  if (!account) throw new Error('Conta de e-mail não encontrada');

  const transporter = createSmtpTransporter(account);

  const fromName = account.display_name || account.name || 'Unico';
  const fromAddress = `"${fromName}" <${account.email_address}>`;

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    text,
    html: html || text.replace(/\n/g, '<br/>')
  };

  if (inReplyTo) {
    mailOptions.inReplyTo = inReplyTo;
    mailOptions.references = inReplyTo;
  }

  const info = await transporter.sendMail(mailOptions);
  const sentMessageId = info.messageId || `sent-${Date.now()}`;
  const snippet = (text || subject || '').slice(0, 150).replace(/\s+/g, ' ').trim();

  // Registra no banco na pasta SENT
  await database.run(`
    INSERT INTO email_messages (
      workspace_id, account_id, message_id, in_reply_to, folder,
      sender, sender_name, recipient, subject, body_text, body_html, snippet,
      date, is_read, is_replied, ai_replied
    ) VALUES (?, ?, ?, ?, 'SENT', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 0, 0)
  `, [
    account.workspace_id, account.id, sentMessageId, inReplyTo || '',
    account.email_address, fromName, to, subject, text, html || '', snippet
  ]);

  return { success: true, messageId: sentMessageId };
}

/**
 * Gera um rascunho de resposta com IA para um e-mail específico
 */
async function generateDraftReply(messageId, specificAgentId = null) {
  const database = await db.getDB();
  const message = await database.get('SELECT * FROM email_messages WHERE id = ?', [messageId]);
  if (!message) throw new Error('Mensagem não encontrada');

  const account = await database.get('SELECT * FROM email_accounts WHERE id = ?', [message.account_id]);
  const agentId = specificAgentId || (account ? account.agent_id : null);

  const draft = await generateAgentResponseForEmail({
    workspaceId: message.workspace_id,
    agentId,
    emailSubject: message.subject,
    emailBody: message.body_text || message.snippet,
    senderName: message.sender_name,
    senderEmail: message.sender
  });

  if (draft) {
    await database.run('UPDATE email_messages SET ai_draft = ? WHERE id = ?', [draft, messageId]);
  }

  return { success: true, draft };
}

/**
 * Inicia o serviço periódico de sincronização de e-mails
 */
function startPeriodicEmailSync() {
  if (syncIntervalTimer) clearInterval(syncIntervalTimer);

  const runSync = async () => {
    try {
      const database = await db.getDB();
      const accounts = await database.all(`
        SELECT id, name, email_address FROM email_accounts 
        WHERE status != 'error' OR status IS NULL
      `);

      for (const acc of accounts) {
        try {
          await syncAccountInbox(acc.id);
        } catch (e) {
          // Log silencioso para não poluir
        }
      }
    } catch (err) {
      console.error('Erro no ciclo de sincronização de e-mails:', err);
    }
  };

  // Executa uma vez após 10 segundos da inicialização e depois a cada 3 minutos
  setTimeout(runSync, 10000);
  syncIntervalTimer = setInterval(runSync, 3 * 60 * 1000);
  console.log('📬 [EmailService] Sincronização periódica de e-mails Hostinger iniciada (a cada 3 minutos).');
}

module.exports = {
  testEmailConnection,
  syncAccountInbox,
  sendEmail,
  generateDraftReply,
  startPeriodicEmailSync
};
