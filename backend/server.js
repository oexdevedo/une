const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./db');
const { connectToWhatsApp, getMessages, sendMessage, getProfilePicUrl } = require('./whatsapp');
const { connectToTelegram } = require('./telegram');
const aiHandler = require('./ai_handler');
const { DB_PATH, UPLOADS_DIR } = require('./storage');

const app = express();
const upload = multer({ dest: UPLOADS_DIR });
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Rota de Teste (Healthcheck)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API rodando perfeitamente!' });
});

// Endpoint de Workspace Settings
app.get('/api/workspaces/:id/settings', async (req, res) => {
  try {
    const database = await db.getDB();
    let row = await database.get('SELECT allow_stories, allow_ephemeral, allow_groups, ai_provider, ai_api_key, ai_base_url, ai_model FROM workspaces WHERE id = ?', [req.params.id]);
    
    if (row && row.ai_api_key) {
      row.ai_api_key = '•••••••••••••';
    }

    res.json(row || { allow_stories: 1, allow_ephemeral: 1, allow_groups: 1, ai_provider: 'openai', ai_api_key: '', ai_base_url: '', ai_model: '' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

app.post('/api/workspaces/:id/settings', async (req, res) => {
  try {
    const { allow_stories, allow_ephemeral, allow_groups, ai_provider, ai_api_key, ai_base_url, ai_model } = req.body;
    const database = await db.getDB();

    let updateQuery = 'UPDATE workspaces SET allow_stories = ?, allow_ephemeral = ?, allow_groups = ?, ai_provider = ?, ai_base_url = ?, ai_model = ?';
    let queryParams = [
      allow_stories ? 1 : 0, allow_ephemeral ? 1 : 0, allow_groups ? 1 : 0,
      ai_provider || 'openai', ai_base_url || '', ai_model || ''
    ];

    if (ai_api_key && ai_api_key !== '•••••••••••••') {
      updateQuery += ', ai_api_key = ?';
      queryParams.push(ai_api_key);
    }

    updateQuery += ' WHERE id = ?';
    queryParams.push(req.params.id);

    await database.run(updateQuery, queryParams);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

app.post('/api/workspaces/:id/ai/test', async (req, res) => {
  try {
    const { ai_provider, ai_api_key, ai_base_url, ai_model } = req.body;
    const result = await aiHandler.testAiConnection({
      workspaceId: req.params.id,
      provider: ai_provider,
      apiKey: ai_api_key,
      baseUrl: ai_base_url,
      model: ai_model
    });
    res.json(result);
  } catch (error) {
    console.error('Erro ao testar IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para atribuição de Agentes a Chats
app.get('/api/workspaces/:id/chat_assignments', async (req, res) => {
  try {
    const database = await db.getDB();
    const rows = await database.all('SELECT remote_jid, agent_id FROM chat_assignments WHERE workspace_id = ?', [req.params.id]);
    const assignments = {};
    rows.forEach(r => assignments[r.remote_jid] = r.agent_id);
    res.json(assignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar atribuições' });
  }
});

app.post('/api/workspaces/:id/chat_assignments', async (req, res) => {
  try {
    const { remote_jid, agent_id } = req.body;
    const database = await db.getDB();
    if (!agent_id || agent_id === 'none') {
      await database.run('DELETE FROM chat_assignments WHERE workspace_id = ? AND remote_jid = ?', [req.params.id, remote_jid]);
    } else {
      await database.run(
        'INSERT OR REPLACE INTO chat_assignments (workspace_id, remote_jid, agent_id) VALUES (?, ?, ?)',
        [req.params.id, remote_jid, agent_id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar atribuição' });
  }
});

// APIs para configuração Global de Auto-Resposta (Responder todos os chats ou não)
app.get('/api/workspaces/:id/auto_respond', async (req, res) => {
  try {
    const database = await db.getDB();
    const row = await database.get('SELECT auto_respond_all, auto_respond_type, auto_respond_target_id FROM workspaces WHERE id = ?', [req.params.id]);
    res.json(row || { auto_respond_all: 0, auto_respond_type: 'agent', auto_respond_target_id: 'none' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações de auto-resposta' });
  }
});

app.post('/api/workspaces/:id/auto_respond', async (req, res) => {
  try {
    const { auto_respond_all, auto_respond_type, auto_respond_target_id } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE workspaces SET auto_respond_all = ?, auto_respond_type = ?, auto_respond_target_id = ? WHERE id = ?',
      [auto_respond_all ? 1 : 0, auto_respond_type || 'agent', auto_respond_target_id || 'none', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configuração de auto-resposta' });
  }
});

// APIs para Automações
app.get('/api/automations', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM automations WHERE workspace_id = ? ORDER BY id ASC', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar automações' });
  }
});

app.post('/api/automations', async (req, res) => {
  try {
    const { workspace_id, name, mode, porteiro_prompt, agents_json, nodes_json } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO automations (workspace_id, name, mode, porteiro_prompt, agents_json, nodes_json) VALUES (?, ?, ?, ?, ?, ?)',
      [workspaceId, name || 'Nova Automação', mode || 'orchestra', porteiro_prompt || '', agents_json || '[]', nodes_json || '[]']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar automação' });
  }
});

app.put('/api/automations/:id', async (req, res) => {
  try {
    const { name, mode, porteiro_prompt, agents_json, nodes_json } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE automations SET name = ?, mode = ?, porteiro_prompt = ?, agents_json = ?, nodes_json = ? WHERE id = ?',
      [name, mode || 'orchestra', porteiro_prompt || '', agents_json || '[]', nodes_json || '[]', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar automação' });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM automations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar automação' });
  }
});

// APIs para Templates de Mensagens
app.get('/api/templates', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM templates WHERE workspace_id = ? ORDER BY id DESC', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const { workspace_id, title, content } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO templates (workspace_id, title, content) VALUES (?, ?, ?)',
      [workspaceId, title || 'Novo Template', content || '']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const { title, content } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE templates SET title = ?, content = ? WHERE id = ?',
      [title, content || '', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar template' });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar template' });
  }
});

// APIs para Eventos Manuais da Agenda
app.get('/api/calendar/events', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY id DESC', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar eventos do calendário' });
  }
});

app.post('/api/calendar/events', async (req, res) => {
  try {
    const { workspace_id, title, date, time, type } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO calendar_events (workspace_id, title, date, time, type) VALUES (?, ?, ?, ?, ?)',
      [workspaceId, title, date, time || '', type || 'event-work']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar evento do calendário' });
  }
});

app.delete('/api/calendar/events/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM calendar_events WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar evento' });
  }
});

// APIs de Confirmação 24h e Lembretes da Agenda
app.get('/api/workspaces/:id/reminders', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const database = await db.getDB();
    const logs = await database.all(
      'SELECT * FROM reminder_logs WHERE workspace_id = ? ORDER BY id DESC LIMIT 50',
      [workspaceId]
    );
    const reminderService = require('./reminder_service');
    const upcoming = await reminderService.getUpcomingBookings(workspaceId);
    const ws = await database.get('SELECT confirmation_enabled, confirmation_agent_id FROM workspaces WHERE id = ?', [workspaceId]);
    res.json({ logs, upcoming, settings: ws });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar lembretes de agendamento' });
  }
});

app.post('/api/workspaces/:id/reminders/trigger', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { withinHours, forceSendBookingId } = req.body || {};
    const reminderService = require('./reminder_service');
    const result = await reminderService.checkAndSend24hReminders(workspaceId, { withinHours, forceSendBookingId });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao executar verificação de confirmações' });
  }
});

app.post('/api/workspaces/:id/reminders/settings', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { confirmation_enabled, confirmation_agent_id } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE workspaces SET confirmation_enabled = ?, confirmation_agent_id = ? WHERE id = ?',
      [confirmation_enabled ? 1 : 0, confirmation_agent_id || '3', workspaceId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configurações de confirmação' });
  }
});

app.post('/api/workspaces/:id/reminders/booking-phone', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { bookingId, attendeeName, phone } = req.body;
    const reminderService = require('./reminder_service');
    const result = await reminderService.saveBookingPhone(workspaceId, { bookingId, attendeeName, phone });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao salvar telefone do agendamento' });
  }
});

app.post('/api/workspaces/:id/reminders/mark-confirmed', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { bookingId, clientName, clientPhone, title, date, time } = req.body;
    const reminderService = require('./reminder_service');
    const result = await reminderService.markBookingConfirmed(workspaceId, { bookingId, clientName, clientPhone, title, date, time });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao marcar confirmação' });
  }
});

// ==========================================
// APIs de Confecção e Gestão de Contratos
// ==========================================

// 1. Listar Modelos de Contrato
app.get('/api/contracts/templates', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all(
      'SELECT * FROM contract_templates WHERE workspace_id = ? ORDER BY id DESC',
      [workspaceId]
    );
    res.json(rows.map(r => ({
      ...r,
      variables: typeof r.variables === 'string' ? JSON.parse(r.variables || '[]') : r.variables
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar modelos de contrato' });
  }
});

// 2. Criar Modelo de Contrato
app.post('/api/contracts/templates', async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 1;
    const { title, description, content, variables, agent_id } = req.body;
    const database = await db.getDB();
    const result = await database.run(
      `INSERT INTO contract_templates (workspace_id, title, description, content, variables, agent_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workspaceId,
        title || 'Novo Modelo de Contrato',
        description || '',
        content || '',
        typeof variables === 'string' ? variables : JSON.stringify(variables || []),
        agent_id || '3'
      ]
    );
    res.json({ id: result.lastID, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar modelo de contrato' });
  }
});

// 3. Atualizar Modelo de Contrato
app.put('/api/contracts/templates/:id', async (req, res) => {
  try {
    const { title, description, content, variables, agent_id } = req.body;
    const database = await db.getDB();
    await database.run(
      `UPDATE contract_templates 
       SET title = ?, description = ?, content = ?, variables = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title,
        description,
        content,
        typeof variables === 'string' ? variables : JSON.stringify(variables || []),
        agent_id || '3',
        req.params.id
      ]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar modelo de contrato' });
  }
});

// 4. Deletar Modelo de Contrato
app.delete('/api/contracts/templates/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM contract_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir modelo de contrato' });
  }
});

// 5. Listar Contratos Confeccionados
app.get('/api/contracts', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all(`
      SELECT c.*, t.title as template_title 
      FROM contracts c
      LEFT JOIN contract_templates t ON t.id = c.template_id
      WHERE c.workspace_id = ?
      ORDER BY c.id DESC
    `, [workspaceId]);

    res.json(rows.map(r => ({
      ...r,
      data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data,
      pdf_url: r.pdf_filename ? `/uploads/${r.pdf_filename}` : null
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar contratos' });
  }
});

// 6. Confeccionar Contrato Manualmente / Gerar PDF
app.post('/api/contracts/generate', async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 1;
    const { templateId, clientName, clientPhone, data } = req.body;
    const database = await db.getDB();
    const template = await database.get('SELECT * FROM contract_templates WHERE id = ?', [templateId]);
    if (!template) return res.status(404).json({ error: 'Modelo de contrato não encontrado' });

    const contractService = require('./contract_service');
    const uploadsDir = UPLOADS_DIR;
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    // Cria registro de contrato
    const result = await database.run(
      `INSERT INTO contracts (workspace_id, template_id, client_name, client_phone, data, status)
       VALUES (?, ?, ?, ?, ?, 'completed')`,
      [workspaceId, templateId, clientName || 'Cliente', clientPhone || '', JSON.stringify(data || {})]
    );
    const contractId = result.lastID;

    const safeClient = (clientName || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFileName = `contrato_${contractId}_${safeClient}.pdf`;
    const outputPath = path.join(uploadsDir, pdfFileName);

    await contractService.generateContractPdf({
      title: template.title,
      content: template.content,
      data: data || {},
      clientName: clientName || 'Cliente',
      outputPath
    });

    await database.run(
      'UPDATE contracts SET pdf_filename = ? WHERE id = ?',
      [pdfFileName, contractId]
    );

    res.json({
      success: true,
      contractId,
      pdfFileName,
      pdfUrl: `/uploads/${pdfFileName}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao gerar contrato' });
  }
});

// 7. Iniciar Coleta com Agente de IA via WhatsApp
app.post('/api/contracts/start-collection', async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 1;
    const { templateId, clientName, clientPhone, remoteJid } = req.body;
    
    let targetJid = remoteJid;
    if (!targetJid && clientPhone) {
      const reminderService = require('./reminder_service');
      targetJid = reminderService.resolveRemoteJidForPhone(workspaceId, clientPhone);
    }

    if (!targetJid) {
      return res.status(400).json({ error: 'Número de WhatsApp ou JID do cliente é obrigatório para iniciar a coleta' });
    }

    const contractService = require('./contract_service');
    const result = await contractService.startContractCollection(workspaceId, {
      templateId,
      clientName,
      clientPhone,
      remoteJid: targetJid
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao iniciar coleta de contrato com a IA' });
  }
});

// 8. Enviar PDF no WhatsApp
app.post('/api/contracts/:id/send-whatsapp', async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 1;
    const contractService = require('./contract_service');
    const result = await contractService.sendContractViaWhatsapp(workspaceId, req.params.id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao enviar contrato no WhatsApp' });
  }
});

// ==================== APIs de E-mails (Hostinger IMAP/SMTP e Agente de IA) ====================
app.get('/api/emails/accounts', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all(`
      SELECT ea.*, a.name as agent_name, a.icon as agent_icon,
        (SELECT COUNT(*) FROM email_messages em WHERE em.account_id = ea.id AND em.folder = 'INBOX' AND em.is_read = 0) as unread_count,
        (SELECT COUNT(*) FROM email_messages em WHERE em.account_id = ea.id) as total_messages
      FROM email_accounts ea
      LEFT JOIN agents a ON a.id = ea.agent_id
      WHERE ea.workspace_id = ?
      ORDER BY ea.id ASC
    `, [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar contas de e-mail' });
  }
});

app.post('/api/emails/accounts', async (req, res) => {
  try {
    const {
      name, email_address, display_name,
      imap_host, imap_port, imap_secure,
      smtp_host, smtp_port, smtp_secure,
      username, password,
      agent_id, auto_reply_enabled,
      workspace_id
    } = req.body;

    const workspaceId = workspace_id || 1;
    const database = await db.getDB();

    const result = await database.run(`
      INSERT INTO email_accounts (
        workspace_id, name, email_address, display_name,
        imap_host, imap_port, imap_secure,
        smtp_host, smtp_port, smtp_secure,
        username, password,
        agent_id, auto_reply_enabled, status, status_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', 'Aguardando sincronização')
    `, [
      workspaceId,
      name || 'Hostinger E-mail',
      email_address,
      display_name || name || '',
      imap_host || 'imap.hostinger.com',
      imap_port ? parseInt(imap_port, 10) : 993,
      imap_secure !== undefined ? (imap_secure ? 1 : 0) : 1,
      smtp_host || 'smtp.hostinger.com',
      smtp_port ? parseInt(smtp_port, 10) : 465,
      smtp_secure !== undefined ? (smtp_secure ? 1 : 0) : 1,
      username || email_address,
      password,
      agent_id ? parseInt(agent_id, 10) : null,
      auto_reply_enabled ? 1 : 0
    ]);

    // Tenta sincronizar imediatamente em segundo plano
    const emailService = require('./email_service');
    emailService.syncAccountInbox(result.lastID).catch(err => console.log('Sync inicial:', err.message));

    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao cadastrar conta de e-mail' });
  }
});

app.put('/api/emails/accounts/:id', async (req, res) => {
  try {
    const {
      name, email_address, display_name,
      imap_host, imap_port, imap_secure,
      smtp_host, smtp_port, smtp_secure,
      username, password,
      agent_id, auto_reply_enabled
    } = req.body;

    const database = await db.getDB();
    const existing = await database.get('SELECT * FROM email_accounts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

    await database.run(`
      UPDATE email_accounts SET
        name = ?, email_address = ?, display_name = ?,
        imap_host = ?, imap_port = ?, imap_secure = ?,
        smtp_host = ?, smtp_port = ?, smtp_secure = ?,
        username = ?, password = ?,
        agent_id = ?, auto_reply_enabled = ?
      WHERE id = ?
    `, [
      name || existing.name,
      email_address || existing.email_address,
      display_name !== undefined ? display_name : existing.display_name,
      imap_host || existing.imap_host,
      imap_port ? parseInt(imap_port, 10) : existing.imap_port,
      imap_secure !== undefined ? (imap_secure ? 1 : 0) : existing.imap_secure,
      smtp_host || existing.smtp_host,
      smtp_port ? parseInt(smtp_port, 10) : existing.smtp_port,
      smtp_secure !== undefined ? (smtp_secure ? 1 : 0) : existing.smtp_secure,
      username || existing.username,
      password ? password : existing.password,
      agent_id !== undefined ? (agent_id ? parseInt(agent_id, 10) : null) : existing.agent_id,
      auto_reply_enabled !== undefined ? (auto_reply_enabled ? 1 : 0) : existing.auto_reply_enabled,
      req.params.id
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar conta de e-mail' });
  }
});

app.delete('/api/emails/accounts/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM email_messages WHERE account_id = ?', [req.params.id]);
    await database.run('DELETE FROM email_accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar conta de e-mail' });
  }
});

app.post('/api/emails/accounts/test', async (req, res) => {
  try {
    const emailService = require('./email_service');
    const result = await emailService.testEmailConnection(req.body);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao testar conexão' });
  }
});

app.post('/api/emails/accounts/:id/sync', async (req, res) => {
  try {
    const emailService = require('./email_service');
    const result = await emailService.syncAccountInbox(req.params.id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao sincronizar mensagens' });
  }
});

app.get('/api/emails/messages', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const accountId = req.query.account_id;
    const folder = req.query.folder || 'INBOX';
    const search = req.query.search || '';

    const database = await db.getDB();

    let query = `
      SELECT em.*, ea.name as account_name, ea.email_address as account_email
      FROM email_messages em
      JOIN email_accounts ea ON ea.id = em.account_id
      WHERE em.workspace_id = ?
    `;
    const params = [workspaceId];

    if (accountId) {
      query += ` AND em.account_id = ?`;
      params.push(accountId);
    }
    if (folder) {
      query += ` AND em.folder = ?`;
      params.push(folder);
    }
    if (search) {
      query += ` AND (em.subject LIKE ? OR em.sender LIKE ? OR em.recipient LIKE ? OR em.snippet LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY em.date DESC, em.id DESC LIMIT 100`;

    const rows = await database.all(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar e-mails' });
  }
});

app.get('/api/emails/messages/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    const row = await database.get(`
      SELECT em.*, ea.name as account_name, ea.email_address as account_email, ea.agent_id
      FROM email_messages em
      JOIN email_accounts ea ON ea.id = em.account_id
      WHERE em.id = ?
    `, [req.params.id]);

    if (!row) return res.status(404).json({ error: 'Mensagem não encontrada' });

    // Marca como lida
    if (row.is_read === 0) {
      await database.run('UPDATE email_messages SET is_read = 1 WHERE id = ?', [req.params.id]);
      row.is_read = 1;
    }

    res.json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar mensagem' });
  }
});

app.post('/api/emails/send', async (req, res) => {
  try {
    const { account_id, to, subject, text, html, in_reply_to } = req.body;
    if (!account_id || !to || !subject) {
      return res.status(400).json({ error: 'Conta, destinatário e assunto são obrigatórios' });
    }

    const emailService = require('./email_service');
    const result = await emailService.sendEmail({
      accountId: account_id,
      to,
      subject,
      text: text || '',
      html: html || '',
      inReplyTo: in_reply_to
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao enviar e-mail' });
  }
});

app.post('/api/emails/messages/:id/generate-reply', async (req, res) => {
  try {
    const { agent_id } = req.body;
    const emailService = require('./email_service');
    const result = await emailService.generateDraftReply(req.params.id, agent_id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao gerar resposta com IA' });
  }
});

app.patch('/api/emails/messages/:id/read', async (req, res) => {
  try {
    const { is_read } = req.body;
    const database = await db.getDB();
    await database.run('UPDATE email_messages SET is_read = ? WHERE id = ?', [is_read ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar status de leitura' });
  }
});

app.delete('/api/emails/messages/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM email_messages WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar e-mail' });
  }
});

// APIs para Listas e Contatos
app.get('/api/lists', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();

    // Sincroniza e garante a existência da lista automática "Agendados"
    try {
      const reminderService = require('./reminder_service');
      await reminderService.syncAgendaToAgendadosList(workspaceId);
    } catch (syncErr) {
      console.warn('Aviso ao sincronizar lista Agendados:', syncErr.message);
    }

    const rows = await database.all(`
      SELECT l.*, COUNT(c.id) as count,
        CASE WHEN l.name = 'Agendados' THEN 1 ELSE 0 END as is_system
      FROM lists l 
      LEFT JOIN contacts c ON c.list_id = l.id 
      WHERE l.workspace_id = ? 
      GROUP BY l.id
      ORDER BY is_system DESC, l.created_at DESC
    `, [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar listas' });
  }
});

app.post('/api/lists/sync-agenda', async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 1;
    const reminderService = require('./reminder_service');
    const listId = await reminderService.syncAgendaToAgendadosList(workspaceId);
    const database = await db.getDB();
    const countRow = await database.get('SELECT COUNT(id) as count FROM contacts WHERE workspace_id = ? AND list_id = ?', [workspaceId, listId]);
    res.json({ success: true, listId, count: countRow?.count || 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao sincronizar lista de agendados' });
  }
});

app.post('/api/lists', async (req, res) => {
  try {
    const { workspace_id, name } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const result = await database.run('INSERT INTO lists (workspace_id, name) VALUES (?, ?)', [workspaceId, name]);
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
});

app.delete('/api/lists/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    const list = await database.get('SELECT name FROM lists WHERE id = ?', [req.params.id]);
    if (list && list.name === 'Agendados') {
      return res.status(400).json({ error: 'A lista "Agendados" é uma lista automática de sistema e não pode ser excluída.' });
    }
    await database.run('DELETE FROM contacts WHERE list_id = ?', [req.params.id]);
    await database.run('DELETE FROM lists WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar lista' });
  }
});

app.post('/api/lists/:id/import-channel-contacts', async (req, res) => {
  try {
    const listId = req.params.id;
    const { workspace_id, channel } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const reminderService = require('./reminder_service');

    let query = '';
    let params = [workspaceId];
    if (channel === 'telegram') {
      query = `SELECT DISTINCT remote_jid, push_name FROM messages WHERE workspace_id = ? AND remote_jid LIKE '%@telegram'`;
    } else {
      query = `SELECT DISTINCT remote_jid, push_name FROM messages 
               WHERE workspace_id = ? 
                 AND remote_jid NOT LIKE '%@telegram'
                 AND remote_jid NOT LIKE '%@newsletter'
                 AND remote_jid NOT LIKE '%@broadcast'`;
    }

    const rows = await database.all(query, params);
    let count = 0;
    for (const row of rows) {
      let phone = '';
      if (channel === 'telegram') {
        phone = row.remote_jid.replace('@telegram', '');
      } else {
        // Usa resolução de LID reversa caso seja um remote_jid @lid
        const resolvedPhone = reminderService.getPhoneNumberFromJid(row.remote_jid, workspaceId);
        phone = (resolvedPhone || row.remote_jid.replace(/@.*$/, '')).replace(/\D/g, '');
        if (phone.length >= 10 && phone.startsWith('55')) {
          const ddd = phone.slice(2, 4);
          const rest = phone.slice(4);
          phone = `(${ddd}) ${rest.length === 9 ? rest.slice(0, 5) + '-' + rest.slice(5) : rest.slice(0, 4) + '-' + rest.slice(4)}`;
        }
      }
      if (!phone) continue;

      const name = row.push_name || (channel === 'telegram' ? `Telegram ${phone}` : `Lead ${phone}`);

      const exists = await database.get(
        'SELECT id FROM contacts WHERE workspace_id = ? AND list_id = ? AND (phone = ? OR name = ?)',
        [workspaceId, listId, phone, name]
      );
      if (!exists) {
        await database.run(
          'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
          [workspaceId, listId, name, phone, 'Novo']
        );
        count++;
      }
    }
    res.json({ success: true, count });
  } catch (err) {
    console.error('Erro ao importar contatos do canal:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const listId = req.query.list_id;
    const database = await db.getDB();
    let query = 'SELECT * FROM contacts WHERE workspace_id = ?';
    const params = [workspaceId];
    if (listId) {
      query += ' AND list_id = ?';
      params.push(listId);
    }
    const rows = await database.all(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const { workspace_id, list_id, name, phone, status } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
      [workspaceId, list_id || null, name, phone || '', status || 'Novo']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar contato' });
  }
});

app.post('/api/contacts/bulk', async (req, res) => {
  try {
    const { workspace_id, list_id, contacts } = req.body;
    const workspaceId = workspace_id || 1;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Lista de contatos vazia ou inválida' });
    }
    const database = await db.getDB();
    let inserted = 0;
    for (const c of contacts) {
      if (!c.phone && !c.name) continue;
      await database.run(
        'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
        [workspaceId, list_id || null, c.name || 'Sem nome', c.phone || '', c.status || 'Novo']
      );
      inserted++;
    }
    res.json({ success: true, count: inserted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao importar contatos em lote' });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar contato' });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const { name, phone, status } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE contacts SET name = ?, phone = ?, status = ? WHERE id = ?',
      [name, phone || '', status || 'Novo', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// ==========================================
// AUTENTICAÇÃO E PERFIL COM SUPORTE A @USERNAME
// ==========================================

function validateAndCleanUsername(handle) {
  if (!handle) return { valid: false, error: 'O @ de usuário é obrigatório.' };
  const clean = handle.trim().replace(/^@+/, '').toLowerCase();
  if (clean.length < 2 || clean.length > 30) {
    return { valid: false, error: 'O @ deve conter entre 2 e 30 caracteres.' };
  }
  // Letras, números, sublinhado (_) e ponto (.)
  const regex = /^[a-z0-9_][a-z0-9_.]{0,28}[a-z0-9_]?$/;
  if (!regex.test(clean)) {
    return { valid: false, error: 'O @ deve conter apenas letras, números, underline (_) e ponto (.).' };
  }
  return { valid: true, clean };
}

// Rota de Login (aceita @usuario, usuario ou e-mail)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Informe seu @usuário ou e-mail e a senha.' });
    }

    const cleanInput = identifier.trim().toLowerCase();
    const cleanHandle = cleanInput.replace(/^@+/, '');

    const database = await db.getDB();
    const user = await database.get(
      `SELECT id, workspace_id, name, username, email, password_hash, role, created_at 
       FROM users 
       WHERE LOWER(email) = ? OR LOWER(username) = ?`,
      [cleanInput, cleanHandle]
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuário ou e-mail não encontrado.' });
    }

    // Valida senha (compatível com plain text ou hash)
    if (user.password_hash !== password && user.password_hash !== `plain:${password}`) {
      return res.status(401).json({ success: false, error: 'Senha incorreta. Tente novamente.' });
    }

    const displayUsername = user.username ? `@${user.username.replace(/^@+/, '')}` : '';

    res.json({
      success: true,
      user: {
        id: user.id,
        workspace_id: user.workspace_id,
        name: user.name,
        username: displayUsername,
        email: user.email,
        role: user.role
      }
    });

    // Recupera chaves salvas no banco e conecta WhatsApp, Telegram, Cal.com e Email sempre que logar
    reconnectAllConnections(user.workspace_id || 1).catch(connErr => {
      console.error('⚠️ [Login AutoConnect] Erro ao reconectar contas em segundo plano:', connErr.message);
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao realizar login.' });
  }
});

// Rota de Cadastro de Nova Conta com @ exclusivo
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'O Nome Completo é obrigatório.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'O E-mail é obrigatório.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'A senha deve conter no mínimo 6 caracteres.' });
    }

    const handleCheck = validateAndCleanUsername(username);
    if (!handleCheck.valid) {
      return res.status(400).json({ success: false, error: handleCheck.error });
    }

    const cleanName = name.trim();
    const cleanHandle = handleCheck.clean;
    const cleanEmail = email.trim().toLowerCase();

    const database = await db.getDB();

    // Verifica se @username já existe
    const existingHandle = await database.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanHandle]);
    if (existingHandle) {
      return res.status(400).json({ success: false, error: `O nome de usuário @${cleanHandle} já está em uso. Por favor, escolha outro.` });
    }

    // Verifica se e-mail já existe
    const existingEmail = await database.get('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existingEmail) {
      return res.status(400).json({ success: false, error: 'Este e-mail já está cadastrado no sistema.' });
    }

    // 1. Cria um Workspace exclusivo para esta conta
    const wsName = `Espaço de ${cleanName}`;
    const wsResult = await database.run(
      `INSERT INTO workspaces (name, allow_stories, allow_ephemeral, allow_groups, auto_respond_all, confirmation_enabled)
       VALUES (?, 0, 0, 0, 1, 1)`,
      [wsName]
    );
    const newWorkspaceId = wsResult.lastID;

    // 2. Semeia padrões isolados (Agentes, Templates, Contratos, Lista Agendados) para o novo workspace
    const { seedWorkspaceDefaults } = require('./workspace_seeder');
    await seedWorkspaceDefaults(database, newWorkspaceId, wsName);

    // 3. Cadastra o usuário como proprietário (owner) do seu próprio workspace
    const result = await database.run(
      `INSERT INTO users (workspace_id, name, username, email, password_hash, role)
       VALUES (?, ?, ?, ?, ?, 'owner')`,
      [newWorkspaceId, cleanName, cleanHandle, cleanEmail, password]
    );

    res.json({
      success: true,
      user: {
        id: result.lastID,
        workspace_id: newWorkspaceId,
        name: cleanName,
        username: `@${cleanHandle}`,
        email: cleanEmail,
        role: 'owner'
      }
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao cadastrar conta.' });
  }
});

// Verificação de disponibilidade de @username em tempo real
app.get('/api/users/check-username/:username', async (req, res) => {
  try {
    const handleCheck = validateAndCleanUsername(req.params.username);
    if (!handleCheck.valid) {
      return res.json({ available: false, error: handleCheck.error });
    }

    const database = await db.getDB();
    const existing = await database.get('SELECT id FROM users WHERE LOWER(username) = ?', [handleCheck.clean]);
    if (existing) {
      return res.json({ available: false, error: `O @${handleCheck.clean} já está em uso.` });
    }

    res.json({ available: true, clean: handleCheck.clean, formatted: `@${handleCheck.clean}` });
  } catch (error) {
    console.error('Erro ao verificar username:', error);
    res.status(500).json({ available: false, error: 'Erro ao verificar disponibilidade.' });
  }
});

// API de Resumo Completo do Dashboard (Visão Geral do Sistema)
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const workspaceId = Number(req.query.workspace_id || 1);
    const database = await db.getDB();

    // 1. Mensagens e Conversas
    const msgStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END), 0) as sent,
        COALESCE(SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END), 0) as received,
        COUNT(DISTINCT remote_jid) as active_chats
      FROM messages
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentMessages = await database.all(`
      SELECT remote_jid, push_name, text, timestamp, from_me, type
      FROM messages
      WHERE workspace_id = ?
      ORDER BY timestamp DESC
      LIMIT 5
    `, [workspaceId]);

    // 2. Contatos
    const contactStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'Novo' THEN 1 ELSE 0 END), 0) as new_contacts,
        COALESCE(SUM(CASE WHEN status = 'Qualificado' THEN 1 ELSE 0 END), 0) as qualified_contacts
      FROM contacts
      WHERE workspace_id = ?
    `, [workspaceId]);

    const listsCount = await database.get('SELECT COUNT(*) as total FROM lists WHERE workspace_id = ?', [workspaceId]);

    // 3. Agentes de IA
    const agents = await database.all(`
      SELECT id, name, icon, role, created_at
      FROM agents
      WHERE workspace_id = ?
      ORDER BY id ASC
    `, [workspaceId]);

    // 4. Tarefas e Kanban
    const kanbanStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END), 0) as todo,
        COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) as in_progress,
        COALESCE(SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END), 0) as review,
        COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) as done
      FROM kanban_projects
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentKanban = await database.all(`
      SELECT id, title, status, priority, due_date, tag, assignee_name
      FROM kanban_projects
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT 4
    `, [workspaceId]);

    const notesCount = await database.get('SELECT COUNT(*) as total FROM task_notes WHERE workspace_id = ?', [workspaceId]);

    // 5. Contratos
    const contractStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) as draft,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
      FROM contracts
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentContracts = await database.all(`
      SELECT c.id, c.client_name, c.client_phone, c.status, c.created_at, ct.title as template_title
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      WHERE c.workspace_id = ?
      ORDER BY c.created_at DESC
      LIMIT 4
    `, [workspaceId]);

    // 6. E-mails
    const emailStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) as unread,
        COALESCE(SUM(CASE WHEN ai_replied = 1 THEN 1 ELSE 0 END), 0) as ai_replied
      FROM email_messages
      WHERE workspace_id = ?
    `, [workspaceId]);

    const emailAccounts = await database.all(`
      SELECT id, name, email_address, status
      FROM email_accounts
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentEmails = await database.all(`
      SELECT id, sender, sender_name, subject, date, is_read, ai_replied
      FROM email_messages
      WHERE workspace_id = ?
      ORDER BY date DESC
      LIMIT 4
    `, [workspaceId]);

    // 7. Agenda & Calendário
    const calendarStats = await database.get(`
      SELECT COUNT(*) as total
      FROM calendar_events
      WHERE workspace_id = ?
    `, [workspaceId]);

    const upcomingEvents = await database.all(`
      SELECT id, title, date, time, attendee_name
      FROM calendar_events
      WHERE workspace_id = ?
      ORDER BY date ASC, time ASC
      LIMIT 4
    `, [workspaceId]);

    // 8. Conexões Status
    let waStatus = { status: 'disconnected' };
    try {
      const whatsappApi = require('./whatsapp');
      waStatus = whatsappApi.getStatus(workspaceId);
    } catch (e) {}

    const ws = await database.get(`
      SELECT ai_provider, ai_model, telegram_token, cal_link
      FROM workspaces
      WHERE id = ?
    `, [workspaceId]);

    res.json({
      success: true,
      workspace_id: workspaceId,
      messages: {
        total: msgStats?.total || 0,
        sent: msgStats?.sent || 0,
        received: msgStats?.received || 0,
        active_chats: msgStats?.active_chats || 0,
        recent: recentMessages || []
      },
      contacts: {
        total: contactStats?.total || 0,
        new: contactStats?.new_contacts || 0,
        qualified: contactStats?.qualified_contacts || 0,
        lists_total: listsCount?.total || 0
      },
      agents: {
        total: agents?.length || 0,
        list: agents || []
      },
      tasks: {
        total: kanbanStats?.total || 0,
        todo: kanbanStats?.todo || 0,
        in_progress: kanbanStats?.in_progress || 0,
        review: kanbanStats?.review || 0,
        done: kanbanStats?.done || 0,
        notes_total: notesCount?.total || 0,
        recent: recentKanban || []
      },
      contracts: {
        total: contractStats?.total || 0,
        draft: contractStats?.draft || 0,
        active: contractStats?.active || 0,
        completed: contractStats?.completed || 0,
        recent: recentContracts || []
      },
      emails: {
        total: emailStats?.total || 0,
        unread: emailStats?.unread || 0,
        ai_replied: emailStats?.ai_replied || 0,
        accounts: emailAccounts || [],
        recent: recentEmails || []
      },
      calendar: {
        total: calendarStats?.total || 0,
        upcoming: upcomingEvents || []
      },
      connections: {
        whatsapp: waStatus?.status || 'disconnected',
        telegram: ws?.telegram_token ? 'connected' : 'disconnected',
        email: emailAccounts?.some(a => a.status === 'connected') ? 'connected' : 'disconnected',
        ai_provider: ws?.ai_provider || 'openai',
        ai_model: ws?.ai_model || ''
      }
    });
  } catch (error) {
    console.error('Erro ao buscar resumo do dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar dados do dashboard' });
  }
});

// APIs para Usuário / Perfil
app.get('/api/users/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.user_id || req.query.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const database = await db.getDB();
    const user = await database.get(
      'SELECT id, workspace_id, name, username, email, role, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    user.username = user.username ? `@${user.username.replace(/^@+/, '')}` : '';
    res.json(user);
  } catch (error) {
    console.error('Erro ao buscar dados do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

app.put('/api/users/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || req.body.user_id || req.body.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const { name, username, email, password } = req.body;
    const database = await db.getDB();

    const currentUser = await database.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    let cleanHandle = null;
    if (username) {
      const handleCheck = validateAndCleanUsername(username);
      if (!handleCheck.valid) {
        return res.status(400).json({ success: false, error: handleCheck.error });
      }
      cleanHandle = handleCheck.clean;

      // Verifica se outro usuário já usa esse username
      const existing = await database.get(
        'SELECT id FROM users WHERE LOWER(username) = ? AND id != ?',
        [cleanHandle, userId]
      );
      if (existing) {
        return res.status(400).json({ success: false, error: `O @${cleanHandle} já pertence a outra conta.` });
      }
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = await database.get(
        'SELECT id FROM users WHERE LOWER(email) = ? AND id != ?',
        [cleanEmail, userId]
      );
      if (existingEmail) {
        return res.status(400).json({ success: false, error: 'Este e-mail já pertence a outra conta.' });
      }
    }

    if (password && password.trim()) {
      await database.run(
        'UPDATE users SET name = ?, username = ?, email = ?, password_hash = ? WHERE id = ?',
        [name, cleanHandle, email, password, userId]
      );
    } else {
      await database.run(
        'UPDATE users SET name = ?, username = ?, email = ? WHERE id = ?',
        [name, cleanHandle, email, userId]
      );
    }

    res.json({
      success: true,
      user: {
        id: Number(userId),
        name,
        username: cleanHandle ? `@${cleanHandle}` : '',
        email
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar dados do usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar dados do usuário' });
  }
});

// APIs para Backup e Restauração de Banco de Dados (.sqlite)
app.get('/api/admin/database/download', (req, res) => {
  const dbPath = DB_PATH;
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'Arquivo de banco de dados não encontrado.' });
  }
  res.download(dbPath, 'database.sqlite');
});

app.post('/api/admin/database/upload', upload.single('database'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    }

    const uploadedPath = req.file.path;
    const dbPath = DB_PATH;

    // Valida se o arquivo é um SQLite válido checando o header 'SQLite format 3'
    const headerBuffer = Buffer.alloc(16);
    const fd = fs.openSync(uploadedPath, 'r');
    fs.readSync(fd, headerBuffer, 0, 16, 0);
    fs.closeSync(fd);
    const headerStr = headerBuffer.toString('utf8');

    if (!headerStr.startsWith('SQLite format 3')) {
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({ success: false, error: 'O arquivo enviado não é um banco de dados SQLite válido.' });
    }

    // Faz backup de segurança do arquivo atual se existir
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.bak_${Date.now()}`;
      fs.copyFileSync(dbPath, backupPath);
    }

    // Substitui o banco pelo arquivo enviado
    fs.copyFileSync(uploadedPath, dbPath);
    fs.unlinkSync(uploadedPath);

    // Re-executa verificação de tabelas
    const initDbModule = require('./initialize_db');
    await initDbModule.init();

    res.json({ success: true, message: 'Banco de dados restaurado e sincronizado com sucesso!' });
  } catch (error) {
    console.error('Erro ao importar banco de dados:', error);
    res.status(500).json({ success: false, error: 'Erro ao processar importação do banco de dados.' });
  }
});


// APIs para Configuração e Padrão de Calendário
app.get('/api/calendar/settings', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const row = await database.get('SELECT cal_api_key, cal_link FROM workspaces WHERE id = ?', [workspaceId]);
    res.json(row || { cal_api_key: '', cal_link: '' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações do calendário' });
  }
});

app.post('/api/calendar/settings', async (req, res) => {
  try {
    const { workspace_id, cal_api_key, cal_link } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    await database.run(
      'UPDATE workspaces SET cal_api_key = ?, cal_link = ? WHERE id = ?',
      [cal_api_key || '', cal_link || '', workspaceId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configurações do calendário' });
  }
});

// Endpoint para buscar tags (Simulando Workspace 1 por enquanto)
app.get('/api/tags', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM tags WHERE workspace_id = ?', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar tags' });
  }
});

// APIs de Agentes de IA
app.get('/api/agents', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM agents WHERE workspace_id = ?', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, icon, prompt, role, workspace_id } = req.body;
    const workspaceId = workspace_id || 1;
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO agents (workspace_id, name, icon, prompt, role) VALUES (?, ?, ?, ?, ?)',
      [workspaceId, name, icon || '🤖', prompt || '', role || '']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar agente' });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const { name, icon, prompt, role } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE agents SET name = ?, icon = ?, prompt = ?, role = ? WHERE id = ?',
      [name, icon, prompt || '', role || '', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar agente' });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM agents WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar agente' });
  }
});

// APIs de Conexão WhatsApp
app.get('/api/connections/whatsapp', (req, res) => {
  const workspaceId = req.query.workspace_id || 1;
  const whatsappApi = require('./whatsapp');
  res.json(whatsappApi.getStatus(workspaceId));
});

app.post('/api/connections/whatsapp/start', (req, res) => {
  const workspaceId = req.body.workspace_id || 1;
  const whatsappApi = require('./whatsapp');
  whatsappApi.connectToWhatsApp(workspaceId);
  res.json({ success: true });
});

// APIs de Mensagens do WhatsApp
app.get('/api/messages', async (req, res) => {
  const workspaceId = req.query.workspace_id || 1;
  const messages = await getMessages(workspaceId);
  res.json(messages);
});

app.get('/api/contacts/:jid/avatar', async (req, res) => {
  const workspaceId = req.query.workspace_id || 1;
  const jid = req.params.jid;
  const url = await getProfilePicUrl(workspaceId, jid);
  if (url) {
    res.redirect(url);
  } else {
    res.status(404).send('Avatar not found');
  }
});

app.post('/api/messages/send', upload.single('file'), async (req, res) => {
  console.log('--- POST /api/messages/send ---');
  console.log('req.body:', req.body);
  console.log('req.file:', req.file);
  
  const { workspace_id, to, text, contact_name } = req.body;
  const workspaceId = workspace_id || 1;
  const file = req.file;

  try {
    let result;
    if (to && to.endsWith('@telegram')) {
      const telegramApi = require('./telegram');
      result = await telegramApi.sendMessage(workspaceId, to, text, file, contact_name);
    } else {
      const whatsappApi = require('./whatsapp');
      result = await whatsappApi.sendMessage(workspaceId, to, text, file);
    }
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/messages/:jid', async (req, res) => {
  const workspaceId = req.query.workspace_id || 1;
  const jid = req.params.jid;
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM messages WHERE workspace_id = ? AND remote_jid = ?', [workspaceId, jid]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar conversa' });
  }
});

app.post('/api/ai/trigger', async (req, res) => {
  const { workspace_id, remote_jid, text, agent_id } = req.body;
  const workspaceId = workspace_id || 1;
  const aiHandler = require('./ai_handler');
  const msgObj = {
    id: 'trig_' + Date.now(),
    from: remote_jid,
    fromMe: false,
    text: text || 'Olá',
    type: 'text',
    fileUrl: null,
    timestamp: Math.floor(Date.now() / 1000),
    pushName: 'Cliente'
  };
  try {
    await aiHandler.processMessage(workspaceId, msgObj, agent_id || '2');
    res.json({ success: true, message: 'IA processada com sucesso' });
  } catch (err) {
    console.error('Erro ao acionar IA manualmente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// APIs de Conexão Telegram
app.get('/api/connections/telegram', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const telegramApi = require('./telegram');
    const statusData = await telegramApi.getStatus(workspaceId);
    res.json(statusData);
  } catch (err) {
    console.error('Erro ao consultar status do Telegram:', err);
    res.status(500).json({ status: 'disconnected', error: err.message });
  }
});

app.post('/api/connections/telegram/start', async (req, res) => {
  try {
    const { token, workspace_id } = req.body;
    const workspaceId = workspace_id || 1;
    const telegramApi = require('./telegram');
    const result = await telegramApi.connectToTelegram(workspaceId, token);
    res.json(result);
  } catch (err) {
    console.error('Erro ao conectar no Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram/disconnect', async (req, res) => {
  try {
    const { workspace_id, clear_token } = req.body;
    const workspaceId = workspace_id || 1;
    const telegramApi = require('./telegram');
    const result = await telegramApi.disconnectTelegram(workspaceId, Boolean(clear_token));
    res.json(result);
  } catch (err) {
    console.error('Erro ao desconectar Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram/save', async (req, res) => {
  try {
    const { workspace_id, token } = req.body;
    const workspaceId = workspace_id || 1;
    const telegramApi = require('./telegram');
    const result = await telegramApi.saveToken(workspaceId, token);
    res.json(result);
  } catch (err) {
    console.error('Erro ao salvar token do Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/reconnect-all', async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 1;
    const status = await reconnectAllConnections(workspaceId);
    res.json({ success: true, status });
  } catch (err) {
    console.error('Erro ao reconectar todas as contas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS DE TAREFAS: POST-ITS & KANBAN
// ==========================================

// --- POST-ITS (CHECKLIST NOTES) ---
app.get('/api/tasks/notes', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all(
      'SELECT * FROM task_notes WHERE workspace_id = ? ORDER BY is_pinned DESC, id DESC',
      [workspaceId]
    );

    const notes = rows.map(r => ({
      ...r,
      items: r.items ? (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) : []
    }));

    res.json(notes);
  } catch (error) {
    console.error('Erro ao listar notas:', error);
    res.status(500).json({ error: 'Erro ao listar notas' });
  }
});

app.post('/api/tasks/notes', async (req, res) => {
  try {
    const { title, color = 'yellow', category = 'Geral', items = [], is_pinned = 0, workspace_id } = req.body;
    const workspaceId = workspace_id || req.query.workspace_id || 1;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    const database = await db.getDB();
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    
    const result = await database.run(
      `INSERT INTO task_notes (workspace_id, title, color, category, items, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workspaceId, title, color, category, itemsJson, is_pinned ? 1 : 0]
    );

    const created = await database.get('SELECT * FROM task_notes WHERE id = ?', [result.lastID]);
    created.items = JSON.parse(created.items);
    res.json({ success: true, note: created });
  } catch (error) {
    console.error('Erro ao criar nota:', error);
    res.status(500).json({ error: 'Erro ao criar nota' });
  }
});

app.put('/api/tasks/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, color, category, items, is_pinned } = req.body;
    const database = await db.getDB();

    const existing = await database.get('SELECT * FROM task_notes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Nota não encontrada' });

    const newTitle = title !== undefined ? title : existing.title;
    const newColor = color !== undefined ? color : existing.color;
    const newCategory = category !== undefined ? category : existing.category;
    const newPinned = is_pinned !== undefined ? (is_pinned ? 1 : 0) : existing.is_pinned;
    const newItems = items !== undefined 
      ? (typeof items === 'string' ? items : JSON.stringify(items)) 
      : existing.items;

    await database.run(
      `UPDATE task_notes 
       SET title = ?, color = ?, category = ?, is_pinned = ?, items = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newTitle, newColor, newCategory, newPinned, newItems, id]
    );

    const updated = await database.get('SELECT * FROM task_notes WHERE id = ?', [id]);
    updated.items = JSON.parse(updated.items);
    res.json({ success: true, note: updated });
  } catch (error) {
    console.error('Erro ao atualizar nota:', error);
    res.status(500).json({ error: 'Erro ao atualizar nota' });
  }
});

app.patch('/api/tasks/notes/:id/toggle-item', async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;
    const database = await db.getDB();

    const note = await database.get('SELECT * FROM task_notes WHERE id = ?', [id]);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });

    let items = [];
    try {
      items = JSON.parse(note.items);
    } catch(e) {
      items = [];
    }

    items = items.map(item => {
      if (String(item.id) === String(itemId)) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });

    await database.run(
      'UPDATE task_notes SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(items), id]
    );

    res.json({ success: true, items });
  } catch (error) {
    console.error('Erro ao alternar item:', error);
    res.status(500).json({ error: 'Erro ao alternar item' });
  }
});

app.delete('/api/tasks/notes/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM task_notes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir nota:', error);
    res.status(500).json({ error: 'Erro ao excluir nota' });
  }
});

// --- KANBAN PROJECTS ---
app.get('/api/tasks/kanban', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 1;
    const database = await db.getDB();
    const rows = await database.all(
      'SELECT * FROM kanban_projects WHERE workspace_id = ? ORDER BY position ASC, id DESC',
      [workspaceId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar cards kanban:', error);
    res.status(500).json({ error: 'Erro ao listar projetos' });
  }
});

app.post('/api/tasks/kanban', async (req, res) => {
  try {
    const {
      title,
      description = '',
      status = 'todo',
      priority = 'medium',
      due_date = null,
      tag = 'Geral',
      assignee_name = 'Equipe',
      assignee_avatar = 'EQ',
      checklist_total = 0,
      checklist_done = 0,
      workspace_id
    } = req.body;
    const workspaceId = workspace_id || req.query.workspace_id || 1;

    if (!title) return res.status(400).json({ error: 'Título do projeto é obrigatório' });

    const database = await db.getDB();
    const maxPosRow = await database.get(
      'SELECT MAX(position) as max_pos FROM kanban_projects WHERE workspace_id = ? AND status = ?',
      [workspaceId, status]
    );
    const position = (maxPosRow?.max_pos || 0) + 1;

    const result = await database.run(
      `INSERT INTO kanban_projects 
       (workspace_id, title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [workspaceId, title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, position]
    );

    const created = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [result.lastID]);
    res.json({ success: true, card: created });
  } catch (error) {
    console.error('Erro ao criar card kanban:', error);
    res.status(500).json({ error: 'Erro ao criar card kanban' });
  }
});

app.put('/api/tasks/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await db.getDB();
    const existing = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });

    const {
      title = existing.title,
      description = existing.description,
      status = existing.status,
      priority = existing.priority,
      due_date = existing.due_date,
      tag = existing.tag,
      assignee_name = existing.assignee_name,
      assignee_avatar = existing.assignee_avatar,
      checklist_total = existing.checklist_total,
      checklist_done = existing.checklist_done
    } = req.body;

    await database.run(
      `UPDATE kanban_projects 
       SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, tag = ?,
           assignee_name = ?, assignee_avatar = ?, checklist_total = ?, checklist_done = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, id]
    );

    const updated = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [id]);
    res.json({ success: true, card: updated });
  } catch (error) {
    console.error('Erro ao atualizar card kanban:', error);
    res.status(500).json({ error: 'Erro ao atualizar card' });
  }
});

app.patch('/api/tasks/kanban/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, position } = req.body;
    if (!status) return res.status(400).json({ error: 'Novo status é obrigatório' });

    const database = await db.getDB();
    await database.run(
      'UPDATE kanban_projects SET status = ?, position = COALESCE(?, position), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, position !== undefined ? position : null, id]
    );

    const updated = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [id]);
    res.json({ success: true, card: updated });
  } catch (error) {
    console.error('Erro ao mover card kanban:', error);
    res.status(500).json({ error: 'Erro ao mover card' });
  }
});

app.delete('/api/tasks/kanban/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM kanban_projects WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir card kanban:', error);
    res.status(500).json({ error: 'Erro ao excluir card' });
  }
});

app.delete('/api/tasks/kanban/column/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const workspaceId = req.query.workspace_id || req.body.workspace_id || 1;
    const database = await db.getDB();
    await database.run('DELETE FROM kanban_projects WHERE workspace_id = ? AND status = ?', [workspaceId, status]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao limpar coluna kanban:', error);
    res.status(500).json({ error: 'Erro ao limpar coluna' });
  }
});

// --- DATABASE CONNECTION & ENVIRONMENT VARIABLES ---
app.get('/api/connections/database', (req, res) => {
  try {
    const envPath = path.resolve(__dirname, '.env');
    let envFileContent = '';
    if (fs.existsSync(envPath)) {
      envFileContent = fs.readFileSync(envPath, 'utf8');
    }

    const parsed = {};
    envFileContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        parsed[match[1]] = val;
      }
    });

    res.json({
      db_type: parsed.DB_TYPE || process.env.DB_TYPE || 'mysql',
      db_host: parsed.DB_HOST || process.env.DB_HOST || '',
      db_port: parsed.DB_PORT || process.env.DB_PORT || '3306',
      db_user: parsed.DB_USER || process.env.DB_USER || '',
      db_password: parsed.DB_PASSWORD || process.env.DB_PASSWORD || '',
      db_name: parsed.DB_NAME || process.env.DB_NAME || '',
      db_ssl: (parsed.DB_SSL || process.env.DB_SSL) === 'true',
      database_url: parsed.DATABASE_URL || process.env.DATABASE_URL || '',
      active_driver: 'sqlite3',
      sqlite_file: 'database.sqlite'
    });
  } catch (error) {
    console.error('Erro ao ler configurações do banco:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações do banco' });
  }
});

app.post('/api/connections/database/test', async (req, res) => {
  try {
    const {
      db_type = 'mysql',
      db_host,
      db_port = '3306',
      db_user,
      db_password,
      db_name,
      db_ssl = false
    } = req.body;

    if (db_type === 'sqlite') {
      const dbPath = path.resolve(__dirname, 'database.sqlite');
      const exists = fs.existsSync(dbPath);
      return res.json({
        success: true,
        message: exists ? 'Banco SQLite local ativo e acessível!' : 'Arquivo SQLite será inicializado localmente.'
      });
    }

    if (!db_host) {
      return res.status(400).json({ success: false, message: 'Host do banco de dados (DB_HOST) é obrigatório.' });
    }

    if (db_type === 'mysql' || db_type === 'mariadb') {
      const mysql = require('mysql2/promise');
      const config = {
        host: db_host,
        port: parseInt(db_port, 10) || 3306,
        user: db_user || '',
        password: db_password || '',
        database: db_name || undefined,
        connectTimeout: 5000
      };

      if (db_ssl) {
        config.ssl = { rejectUnauthorized: false };
      }

      const connection = await mysql.createConnection(config);
      await connection.query('SELECT 1 + 1 AS solution');
      await connection.end();

      return res.json({
        success: true,
        message: `Conexão com MySQL em ${db_host}:${db_port} realizada com sucesso!`
      });
    } else {
      const net = require('net');
      const port = parseInt(db_port, 10) || 5432;

      await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(4000);
        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Timeout de conexão (porta inacessível ou firewall bloqueando)'));
        });
        socket.on('error', (err) => {
          reject(err);
        });
        socket.connect(port, db_host);
      });

      return res.json({
        success: true,
        message: `Servidor em ${db_host}:${port} acessível via rede!`
      });
    }
  } catch (error) {
    console.error('Erro ao testar conexão:', error.message);
    return res.json({
      success: false,
      message: error.message || 'Falha ao conectar no banco de dados',
      code: error.code
    });
  }
});

app.post('/api/connections/database/save', async (req, res) => {
  try {
    const {
      db_type = 'mysql',
      db_host = '',
      db_port = '3306',
      db_user = '',
      db_password = '',
      db_name = '',
      db_ssl = false,
      database_url = ''
    } = req.body;

    const envPath = path.resolve(__dirname, '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const computedUrl = database_url || (db_host ? `${db_type}://${encodeURIComponent(db_user)}:${encodeURIComponent(db_password)}@${db_host}:${db_port}/${db_name}` : '');

    const updates = {
      DB_TYPE: db_type,
      DB_HOST: db_host,
      DB_PORT: db_port,
      DB_USER: db_user,
      DB_PASSWORD: db_password,
      DB_NAME: db_name,
      DB_SSL: db_ssl ? 'true' : 'false',
      DATABASE_URL: computedUrl
    };

    const lines = content.split('\n');
    const keysUpdated = new Set();

    const newLines = lines.map(line => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
      if (match) {
        const key = match[1];
        if (key in updates) {
          keysUpdated.add(key);
          process.env[key] = String(updates[key]);
          return `${key}=${updates[key]}`;
        }
      }
      return line;
    });

    for (const [key, val] of Object.entries(updates)) {
      if (!keysUpdated.has(key)) {
        newLines.push(`${key}=${val}`);
        process.env[key] = String(val);
      }
    }

    fs.writeFileSync(envPath, newLines.join('\n').trim() + '\n', 'utf8');

    res.json({
      success: true,
      message: 'Variáveis de ambiente do banco de dados salvas no arquivo .env com sucesso!',
      env: updates
    });
  } catch (error) {
    console.error('Erro ao salvar .env do banco:', error);
    res.status(500).json({ error: 'Erro ao salvar variáveis de ambiente' });
  }
});

// Servir build do frontend caso exista na pasta ../dist (ideal para produção / Hostinger)
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
  console.log('📦 Servindo frontend estático de ../dist');
}

// ==========================================
// CENTRAL DE RECONEXÃO AUTOMÁTICA DE CONTAS
// ==========================================
/**
 * Recupera as credenciais/tokens salvos no banco SQLite e conecta/sincroniza:
 * 1. WhatsApp (Baileys)
 * 2. Telegram (Bot Telegraf)
 * 3. Cal.com / Agenda (API Key)
 * 4. E-mail Hostinger (IMAP & SMTP)
 */
async function reconnectAllConnections(workspaceId = 1) {
  console.log(`\n======================================================`);
  console.log(`🔄 [AutoConnect] Verificando e conectando canais do Workspace ${workspaceId}...`);
  const results = {
    whatsapp: 'disconnected',
    telegram: 'disconnected',
    calendar: 'disconnected',
    email: 'disconnected'
  };

  try {
    const database = await db.getDB();
    const ws = await database.get('SELECT telegram_token, cal_api_key, cal_link FROM workspaces WHERE id = ?', [workspaceId]);

    // 1. WhatsApp (Baileys)
    try {
      const whatsappApi = require('./whatsapp');
      const waStatus = whatsappApi.getStatus(workspaceId);
      if (waStatus && waStatus.status === 'connected') {
        results.whatsapp = 'connected';
        console.log(`📱 [AutoConnect] WhatsApp já está conectado para Workspace ${workspaceId}.`);
      } else if (whatsappApi.hasSavedCredentials(workspaceId)) {
        console.log(`📱 [AutoConnect] Sessão salva detectada. Conectando WhatsApp para Workspace ${workspaceId}...`);
        await whatsappApi.connectToWhatsApp(workspaceId);
        results.whatsapp = 'connecting';
      } else {
        console.log(`ℹ️ [AutoConnect] Nenhuma credencial salva de WhatsApp para Workspace ${workspaceId}.`);
        results.whatsapp = 'disconnected';
      }
    } catch (waErr) {
      console.error('❌ [AutoConnect] Erro ao reconectar WhatsApp:', waErr.message);
      results.whatsapp = 'error';
    }

    // 2. Telegram (Telegraf)
    try {
      const telegramApi = require('./telegram');
      const token = (ws && ws.telegram_token && ws.telegram_token.trim()) || null;
      if (token) {
        console.log(`✈️ [AutoConnect] Conectando Telegram com token recuperado do banco...`);
        const tgRes = await telegramApi.connectToTelegram(workspaceId, token);
        if (tgRes.success) {
          results.telegram = 'connected';
          console.log(`✅ [AutoConnect] Telegram conectado com sucesso: @${tgRes.botInfo ? tgRes.botInfo.username : 'bot'}`);
        } else {
          results.telegram = 'error';
          console.warn('⚠️ [AutoConnect] Erro ao conectar bot Telegram:', tgRes.error);
        }
      } else {
        console.log('ℹ️ [AutoConnect] Nenhum token de Telegram configurado no banco.');
      }
    } catch (tgErr) {
      console.error('❌ [AutoConnect] Erro ao reconectar Telegram:', tgErr.message);
      results.telegram = 'error';
    }

    // 3. Cal.com / Agenda
    try {
      if (ws && ws.cal_api_key && ws.cal_api_key.trim()) {
        results.calendar = 'connected';
        console.log('📅 [AutoConnect] Cal.com ativo e chave validada no banco.');
      } else {
        console.log('ℹ️ [AutoConnect] Nenhuma API Key do Cal.com configurada.');
      }
    } catch (calErr) {
      console.error('❌ [AutoConnect] Erro ao verificar Cal.com:', calErr.message);
      results.calendar = 'error';
    }

    // 4. E-mail Hostinger (IMAP & SMTP)
    try {
      const emailService = require('./email_service');
      const accounts = await database.all('SELECT id, email_address FROM email_accounts WHERE workspace_id = ?', [workspaceId]);
      if (accounts && accounts.length > 0) {
        for (const acc of accounts) {
          try {
            console.log(`📬 [AutoConnect] Sincronizando caixa de entrada Hostinger: ${acc.email_address}...`);
            await emailService.syncAccountInbox(acc.id);
            results.email = 'connected';
          } catch (mailSyncErr) {
            console.warn(`⚠️ [AutoConnect] Falha ao sincronizar e-mail ${acc.email_address}:`, mailSyncErr.message);
            results.email = 'error';
          }
        }
      } else {
        console.log('ℹ️ [AutoConnect] Nenhuma conta de e-mail Hostinger configurada.');
      }
    } catch (emailErr) {
      console.error('❌ [AutoConnect] Erro ao inicializar e-mails Hostinger:', emailErr.message);
      results.email = 'error';
    }

  } catch (dbErr) {
    console.error('❌ [AutoConnect] Erro ao ler banco para reconexão:', dbErr);
  }

  console.log(`🏁 [AutoConnect] Status de conexões:`, results);
  console.log(`======================================================\n`);
  return results;
}

// Inicia o Servidor
app.listen(PORT, async () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  
  // 1. Inicializa o banco de dados SQLite e garante todas as 22 tabelas
  try {
    const { init: initDB } = require('./initialize_db');
    await initDB();
  } catch (initErr) {
    console.error('❌ Erro na auto-inicialização do banco SQLite:', initErr);
  }

  // Reconecta automaticamente todas as conexões salvas em todos os workspaces
  try {
    const database = await db.getDB();
    const workspaces = await database.all('SELECT id FROM workspaces');
    for (const ws of workspaces) {
      await reconnectAllConnections(ws.id);
    }
  } catch (autoErr) {
    console.error('Erro na auto-reconexão inicial de canais:', autoErr);
  }

  // Inicia o serviço de confirmação e lembretes 24h antes
  try {
    const reminderService = require('./reminder_service');
    reminderService.startReminderService(15);
  } catch (remErr) {
    console.error('Erro ao iniciar ReminderService:', remErr);
  }

  // Inicia o serviço de sincronização periódica de e-mails Hostinger
  try {
    const emailService = require('./email_service');
    emailService.startPeriodicEmailSync();
  } catch (emailErr) {
    console.error('Erro ao iniciar EmailService:', emailErr);
  }
});
