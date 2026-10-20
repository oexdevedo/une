// File: backend/initialize_db.js
/**
 * Inicializador Oficial e Idempotente do Banco de Dados SQLite do Unne CRM.
 * - Cria todas as 22 tabelas necessárias com schemas atualizados.
 * - Adiciona colunas faltantes em bancos já existentes sem perda de dados.
 * - Popula dados padrão (Workspace, Admin, Agentes Lucas & Mariana, Modelos de Contratos, etc.).
 * - Seguro para rodar em produção (Hostinger / VPS) ou em desenvolvimento local.
 */
const { getDB } = require('./db');
const fs = require('fs');
const path = require('path');

async function ensureColumn(db, tableName, columnName, columnDefinition) {
  try {
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    const hasCol = columns.some(c => c.name.toLowerCase() === columnName.toLowerCase());
    if (!hasCol) {
      await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
      console.log(`✓ Coluna '${columnName}' adicionada na tabela '${tableName}'.`);
    }
  } catch (err) {
    console.warn(`Aviso ao verificar coluna ${columnName} em ${tableName}:`, err.message);
  }
}

async function init() {
  console.log('🔄 Iniciando verificação e configuração do Banco SQLite...');
  const db = await getDB();

  // Integridade e performance
  await db.exec(`PRAGMA foreign_keys = ON;`);
  await db.exec(`PRAGMA journal_mode = WAL;`);

  // 1. Criação de Tabelas Estruturais
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      allow_stories INTEGER DEFAULT 1,
      allow_ephemeral INTEGER DEFAULT 1,
      allow_groups INTEGER DEFAULT 1,
      ai_provider TEXT DEFAULT 'openai',
      ai_api_key TEXT DEFAULT '',
      ai_base_url TEXT DEFAULT '',
      ai_model TEXT DEFAULT '',
      auto_respond_all INTEGER DEFAULT 0,
      auto_respond_type TEXT DEFAULT 'agent',
      auto_respond_target_id TEXT DEFAULT 'none',
      cal_api_key TEXT,
      cal_link TEXT,
      telegram_token TEXT,
      confirmation_agent_id TEXT DEFAULT '3',
      confirmation_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      username TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'agent',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '🤖',
      prompt TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color_hex TEXT NOT NULL,
      bg_hex TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      list_id INTEGER,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT DEFAULT 'Novo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (contact_id, tag_id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_assignments (
      workspace_id INTEGER NOT NULL,
      remote_jid TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      PRIMARY KEY (workspace_id, remote_jid)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      remote_jid TEXT NOT NULL,
      from_me BOOLEAN NOT NULL,
      text TEXT,
      type TEXT,
      file_url TEXT,
      timestamp INTEGER NOT NULL,
      push_name TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      mode TEXT DEFAULT 'orchestra',
      porteiro_prompt TEXT,
      agents_json TEXT,
      nodes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      type TEXT DEFAULT 'event-work',
      attendee_name TEXT,
      attendee_phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reminder_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      booking_id TEXT NOT NULL,
      client_name TEXT,
      client_phone TEXT,
      remote_jid TEXT,
      appointment_title TEXT,
      appointment_date TEXT,
      appointment_time TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'sent',
      notes TEXT,
      UNIQUE(workspace_id, booking_id)
    );

    CREATE TABLE IF NOT EXISTS booking_contact_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      booking_id TEXT NOT NULL UNIQUE,
      attendee_name TEXT,
      phone TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contract_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      variables TEXT NOT NULL,
      agent_id TEXT DEFAULT '3',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      template_id INTEGER REFERENCES contract_templates(id),
      client_name TEXT NOT NULL,
      client_phone TEXT,
      remote_jid TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      pdf_filename TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contract_collection_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      remote_jid TEXT NOT NULL,
      contract_id INTEGER NOT NULL REFERENCES contracts(id),
      template_id INTEGER NOT NULL REFERENCES contract_templates(id),
      current_variable_key TEXT,
      status TEXT DEFAULT 'active',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, remote_jid)
    );

    CREATE TABLE IF NOT EXISTS email_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email_address TEXT NOT NULL,
      display_name TEXT,
      imap_host TEXT DEFAULT 'imap.hostinger.com',
      imap_port INTEGER DEFAULT 993,
      imap_secure INTEGER DEFAULT 1,
      smtp_host TEXT DEFAULT 'smtp.hostinger.com',
      smtp_port INTEGER DEFAULT 465,
      smtp_secure INTEGER DEFAULT 1,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      agent_id INTEGER,
      auto_reply_enabled INTEGER DEFAULT 0,
      sync_interval_minutes INTEGER DEFAULT 5,
      last_sync_at DATETIME,
      status TEXT DEFAULT 'disconnected',
      status_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS email_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      message_id TEXT,
      in_reply_to TEXT,
      folder TEXT DEFAULT 'INBOX',
      sender TEXT NOT NULL,
      sender_name TEXT,
      recipient TEXT NOT NULL,
      subject TEXT,
      body_text TEXT,
      body_html TEXT,
      snippet TEXT,
      date DATETIME,
      is_read INTEGER DEFAULT 0,
      is_replied INTEGER DEFAULT 0,
      ai_replied INTEGER DEFAULT 0,
      ai_draft TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'yellow',
      category TEXT DEFAULT 'Geral',
      items TEXT NOT NULL DEFAULT '[]',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kanban_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      tag TEXT DEFAULT 'Geral',
      assignee_name TEXT,
      assignee_avatar TEXT,
      checklist_total INTEGER NOT NULL DEFAULT 0,
      checklist_done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Garantir colunas essenciais caso o banco seja herdado de versão legada
  await ensureColumn(db, 'workspaces', 'allow_stories', 'INTEGER DEFAULT 1');
  await ensureColumn(db, 'workspaces', 'allow_ephemeral', 'INTEGER DEFAULT 1');
  await ensureColumn(db, 'workspaces', 'allow_groups', 'INTEGER DEFAULT 1');
  await ensureColumn(db, 'workspaces', 'ai_provider', "TEXT DEFAULT 'openai'");
  await ensureColumn(db, 'workspaces', 'ai_api_key', "TEXT DEFAULT ''");
  await ensureColumn(db, 'workspaces', 'ai_base_url', "TEXT DEFAULT ''");
  await ensureColumn(db, 'workspaces', 'ai_model', "TEXT DEFAULT ''");
  await ensureColumn(db, 'workspaces', 'auto_respond_all', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'workspaces', 'auto_respond_type', "TEXT DEFAULT 'agent'");
  await ensureColumn(db, 'workspaces', 'auto_respond_target_id', "TEXT DEFAULT 'none'");
  await ensureColumn(db, 'workspaces', 'cal_api_key', 'TEXT');
  await ensureColumn(db, 'workspaces', 'cal_link', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_token', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_session', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_phone', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_user_id', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_first_name', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_username', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_api_id', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_api_hash', 'TEXT');
  await ensureColumn(db, 'workspaces', 'telegram_connected_at', 'INTEGER');
  await ensureColumn(db, 'workspaces', 'confirmation_agent_id', "TEXT DEFAULT '3'");
  await ensureColumn(db, 'workspaces', 'confirmation_enabled', 'INTEGER DEFAULT 1');
  await ensureColumn(db, 'workspaces', 'briefing_enabled', 'INTEGER DEFAULT 1');
  await ensureColumn(db, 'workspaces', 'briefing_channel', "TEXT DEFAULT 'whatsapp'");
  await ensureColumn(db, 'workspaces', 'briefing_target_phone', 'TEXT');
  await ensureColumn(db, 'workspaces', 'briefing_time', "TEXT DEFAULT '08:00'");
  await ensureColumn(db, 'workspaces', 'briefing_last_sent', 'INTEGER');
  await ensureColumn(db, 'workspaces', 'briefing_last_text', 'TEXT');

  await ensureColumn(db, 'users', 'username', 'TEXT');
  try {
    await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(LOWER(username)) WHERE username IS NOT NULL;");
  } catch (idxErr) {}

  await ensureColumn(db, 'agents', 'prompt', 'TEXT');
  await ensureColumn(db, 'agents', 'role', 'TEXT');
  await ensureColumn(db, 'automations', 'nodes_json', 'TEXT');
  await ensureColumn(db, 'calendar_events', 'attendee_name', 'TEXT');
  await ensureColumn(db, 'calendar_events', 'attendee_phone', 'TEXT');

  // 3. Versão do Schema
  const existingVersion = await db.get('SELECT version FROM schema_version WHERE id = 1');
  if (!existingVersion) {
    await db.run('INSERT INTO schema_version (id, version) VALUES (1, 2);');
  }

  // 4. Seed de Workspace e Usuário Admin
  let ws = await db.get('SELECT id FROM workspaces WHERE id = 1');
  if (!ws) {
    await db.run(`INSERT INTO workspaces (id, name) VALUES (1, 'Meu Escritório');`);
    console.log('✓ Workspace padrão criado (id: 1)');
  }

  const admin = await db.get('SELECT id FROM users WHERE email = ?', ['admin@unico.com']);
  if (!admin) {
    await db.run(
      `INSERT INTO users (workspace_id, name, username, email, password_hash, role)
       VALUES (1, 'Administrador', 'admin', 'admin@unico.com', '123456', 'admin');`
    );
    console.log('✓ Usuário admin padrão criado (@admin / admin@unico.com / 123456)');
  }

  const yuri = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', ['yuri', 'yuri@exdevedor.com.br']);
  if (!yuri) {
    await db.run(
      `INSERT INTO users (workspace_id, name, username, email, password_hash, role)
       VALUES (1, 'Yuri Assis', 'yuri', 'yuri@exdevedor.com.br', 'Gr@nd34rtun@', 'admin');`
    );
    console.log('✓ Usuário Yuri Assis (@yuri) cadastrado como Administrador!');
  }

  // 4.1. Garantir Isolamento Estrito Multi-tenant: cada usuário possui seu Workspace exclusivo
  try {
    const allUsers = await db.all('SELECT id, workspace_id, name, username, email FROM users ORDER BY id ASC');
    const { seedWorkspaceDefaults } = require('./workspace_seeder');
    for (const u of allUsers) {
      // Usuário Yuri Assis é o titular oficial do Workspace 1
      if (u.username === 'yuri' || (u.id === 1 && !allUsers.some(x => x.username === 'yuri' && x.id !== 1))) {
        continue;
      }
      // Qualquer outra conta cadastrada que esteja erroneamente no Workspace 1 ganha seu workspace próprio
      if (u.workspace_id === 1) {
        const wsName = `Espaço de ${u.name || u.username}`;
        const wsRes = await db.run(
          `INSERT INTO workspaces (name, allow_stories, allow_ephemeral, allow_groups, auto_respond_all, confirmation_enabled)
           VALUES (?, 0, 0, 0, 1, 1)`,
          [wsName]
        );
        const newWsId = wsRes.lastID;
        await db.run('UPDATE users SET workspace_id = ?, role = "owner" WHERE id = ?', [newWsId, u.id]);
        console.log(`🔒 [Isolamento] Usuário '${u.name}' (@${u.username}) isolado com sucesso no Workspace ${newWsId}!`);
        await seedWorkspaceDefaults(db, newWsId, wsName);
      }
    }
  } catch (isoErr) {
    console.error('Erro na verificação de isolamento de workspaces:', isoErr.message);
  }

  // 5. Seed de Agentes Oficiais (Lucas Vendas e Mariana Confirmação)
  const agentLucas = await db.get('SELECT id FROM agents WHERE id = 2 OR name LIKE ?', ['%Lucas%']);
  if (!agentLucas) {
    const lucasPrompt = `Você é o Lucas, funcionário virtual especialista em atendimento comercial e agendamentos.

[FLUXO OBRIGATÓRIO DE AGENDAMENTO E CALENDÁRIO]:
1. APRESENTAÇÃO DE HORÁRIOS DISPONÍVEIS:
   - Quando o cliente demonstrar interesse em agendar, falar sobre disponibilidade ou perguntar que dias/horários você tem:
     Apresente os horários informados pelo sistema SEMPRE em forma de lista numerada.
   - Pergunte qual desses horários fica bom para ele.

2. DADOS OBRIGATÓRIOS ANTES DE CONFIRMAR A VAGA:
   - Para oficializar e reservar a vaga na agenda, você DEVE OBRIGATORIAMENTE pedir:
     a) Nome completo do cliente
     b) Motivo do agendamento (qual assunto ou objetivo deseja tratar)
   - NUNCA confirme a reserva sem ter o Nome do cliente e o Motivo do agendamento.

3. EFETIVAÇÃO E RESERVA OFICIAL NO CAL.COM:
   - Assim que você tiver os 3 dados (Horário escolhido, Nome completo e Motivo):
     Confirme a reserva com entusiasmo, citando a data, horário, nome e o motivo!
     E inclua OBRIGATORIAMENTE no final da mensagem a tag de sistema:
     [RESERVAR_CALENDARIO: {"horario": "<horário escolhido>", "nome": "<nome do cliente>", "motivo": "<motivo do agendamento>"}]
   - A tag será lida pelo sistema para efetivar a reserva no Cal.com e será ocultada antes de chegar ao cliente.

4. REGRA ESTRITA DE LINKS:
   - NUNCA envie ou mostre links externos nem o link do cal.com. Jamais envie links. O agendamento é feito 100% diretamente com você por aqui.

- Tom de voz: Acolhedor, prestativo, educado e ágil.
- Responda de forma natural e humana no chat (máximo 2 a 3 frases curtas por balão).`;

    await db.run(
      `INSERT INTO agents (id, workspace_id, name, icon, prompt, role)
       VALUES (2, 1, 'Lucas Vendas', '/avatar/1.png', ?, 'Consultor Comercial e Agendamentos')`,
      [lucasPrompt]
    );
    console.log('✓ Agente Lucas Vendas configurado com sucesso');
  }

  const agentMariana = await db.get('SELECT id FROM agents WHERE id = 3 OR name LIKE ?', ['%Mariana%']);
  if (!agentMariana) {
    const marianaPrompt = `Você é a Mariana, funcionária virtual especialista em confirmação de agendamentos e lembretes de reuniões e mentorias.

[MISSÃO E OBJETIVO PRINCIPAL]:
Seu papel é confirmar a presença do cliente agendado com 24h de antecedência, acolhê-lo com simpatia, tirar dúvidas rápidas sobre o encontro ou ajudá-lo a remarcar caso não possa comparecer.

[FLUXO E REGRAS DE ATENDIMENTO]:
1. CONFIRMAÇÃO DE PRESENÇA:
   - Quando o cliente confirmar a presença (ex: "Sim", "Confirmo", "Vou sim", "Estarei lá", "Com certeza", "Combinado", "Ok", "Perfeito"):
     Responda com entusiasmo, cordialidade e acolhimento!
     Exemplo: "Excelente, [Nome]! Sua presença está confirmada com sucesso para nosso encontro. Qualquer dúvida até lá, estamos por aqui. Tenha um ótimo dia!"

2. IMPOSSIBILIDADE DE COMPARECER OU PEDIDO DE REMARCAÇÃO:
   - Quando o cliente disser que não poderá comparecer ou pedir para remarcar:
     Demonstre empatia e compreensão imediata.
     Apresente os horários disponíveis informados pelo sistema na lista numerada.
     Assim que o cliente escolher o novo horário, confirme a remarcação e inclua OBRIGATORIAMENTE a tag:
     [RESERVAR_CALENDARIO: {"horario": "<novo horário escolhido>", "nome": "<nome do cliente>", "motivo": "Remarcação de mentoria"}]

3. CANCELAMENTO DEFINITIVO:
   - Se o cliente solicitar cancelar sem interesse em remarcar, agradeça e confirme o cancelamento cordialmente.

4. REGRA ESTRITA DE LINKS:
   - NUNCA envie ou mostre links externos nem o link do cal.com.

5. TOM DE VOZ E ESTILO:
   - Empática, educada, prestativa e calorosa.
   - Responda como uma pessoa real no WhatsApp (máximo 2 a 3 frases curtas por balão).`;

    await db.run(
      `INSERT INTO agents (id, workspace_id, name, icon, prompt, role)
       VALUES (3, 1, 'Mariana Confirmação', '/avatar/2.png', ?, 'Confirmação de Agendamentos e Lembretes (24h)')`,
      [marianaPrompt]
    );
    console.log('✓ Agente Mariana Confirmação configurada com sucesso');
  }

  const agentSofia = await db.get('SELECT id FROM agents WHERE name LIKE ?', ['%Sofia%']);
  if (!agentSofia) {
    const sofiaPrompt = `Você é a Sofia, Assistente Executiva e Agente de Inteligência do Unico CRM.
Sua missão é gerar relatórios e briefings executivos diários completos, claros e elegantes sobre o ecossistema do sistema e enviar diretamente para o gestor.

O seu briefing diário consolida:
1. 📬 RESUMO DE E-MAILS RECEBIDOS (principais mensagens recentes e remetentes).
2. 📅 AGENDA DO DIA (compromissos de hoje com horários e participantes).
3. 📆 AGENDA DE AMANHÃ (compromissos do dia seguinte).
4. ❓ PERGUNTA DE CONFIRMAÇÃO (identificação de reuniões de amanhã e pergunta se pode disparar as confirmações automáticas).
5. 📊 RESULTADOS WHATSAPP & TELEGRAM (métricas de mensagens trocadas, novos contatos cadastrados e status).

Tom de voz: Executivo, conciso, organizado, prestativo e cordial.`;

    await db.run(
      `INSERT INTO agents (workspace_id, name, icon, prompt, role)
       VALUES (1, 'Sofia - Resumo Executivo', '/avatar/3.png', ?, 'Briefing Diário do Sistema & Assistente Executiva')`,
      [sofiaPrompt]
    );
    console.log('✓ Agente Sofia - Resumo Executivo configurada com sucesso');
  }

  // 6. Seed de Templates de Mensagens
  const tmplCount = await db.get('SELECT count(*) as c FROM templates');
  if (tmplCount.c === 0) {
    await db.run(
      'INSERT INTO templates (workspace_id, title, content) VALUES (?, ?, ?)',
      [1, 'Boas-vindas', '# Olá!\n\nSeja bem-vindo(a) ao nosso atendimento.\nComo posso ajudar hoje?']
    );
    await db.run(
      'INSERT INTO templates (workspace_id, title, content) VALUES (?, ?, ?)',
      [1, 'Agendamento Confirmado', 'Olá {primeiro_nome}! Sua reunião foi confirmada com sucesso em nossa agenda. Até breve!']
    );
    console.log('✓ Mensagens templates padrão criadas');
  }

  // 7. Seed de Contrato Modelo
  const contractCount = await db.get('SELECT count(*) as c FROM contract_templates');
  if (contractCount.c === 0) {
    const contractTitle = 'Contrato de Mentoria Financeira - Ex Devedor';
    const contractDesc = 'Modelo oficial de mentoria financeira individual da Ex Devedor Tecnologia Educacional Ltda.';
    const contractVars = JSON.stringify([
      { key: "nome_cliente", label: "Nome Completo do Contratante", prompt: "Para começarmos a confecção do seu contrato de mentoria, qual é o seu *nome completo*?", type: "text", required: true },
      { key: "cpf", label: "CPF do Contratante", prompt: "Perfeito! Qual é o seu número de *CPF*?", type: "text", required: true },
      { key: "rg", label: "RG do Contratante", prompt: "Poderia me informar o seu *RG* (número e órgão expedidor)?", type: "text", required: true },
      { key: "endereco", label: "Endereço Completo com CEP", prompt: "Qual é o seu *endereço completo* (com rua/quadra, número, complemento, bairro, cidade e CEP)?", type: "text", required: true },
      { key: "email", label: "E-mail de Contato", prompt: "Qual o seu melhor *e-mail* para envio do contrato e comunicações?", type: "text", required: true },
      { key: "valor_total", label: "Valor Total da Mentoria", prompt: "Qual é o *valor total* acordado da sua mentoria (ex: R$ 2.200,00)?", type: "text", required: true },
      { key: "parcelas_info", label: "Forma de Parcelamento", prompt: "Como será o parcelamento das parcelas (ex: 10 parcelas mensais de R$ 220,00 ou à vista)?", type: "text", required: true },
      { key: "dia_vencimento", label: "Dia do Vencimento Mensal", prompt: "Qual o melhor *dia de vencimento* mensal (ex: dia 10, dia 20 ou dia 28)?", type: "text", required: true },
      { key: "primeiro_vencimento", label: "Data da Primeira Parcela", prompt: "Qual a data de vencimento da *primeira parcela* (ex: 28/10/2026)?", type: "text", required: true },
      { key: "data_inicio", label: "Data de Início da Mentoria", prompt: "A partir de qual data iniciaremos as consultorias (ex: 17/10/2026)?", type: "text", required: true },
      { key: "data_termino", label: "Data de Término da Mentoria", prompt: "Qual a data de término prevista do contrato (ex: 17/08/2027)?", type: "text", required: true }
    ]);
    const contractContent = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

Este documento visa clarificar e regular a nossa relação de Mentoria financeira, a favor da transparência, libertando-nos para aquilo que de fato importa.  
Seguem-se algumas informações importantes sobre o serviço a ser prestado. Por favor, leia e responda por e-mail assinado digitalmente.

CONTRATANTE: {{nome_cliente}}, CPF {{cpf}}, RG {{rg}}, residente e domiciliado em {{endereco}}. E-mail: {{email}}

CONTRATADA: Ex Devedor Tecnologia Educacional Ltda, CNPJ: 29.238.426.0001-60.
As partes têm entre si justo e contratado a prestação de serviços com suas cláusulas e condições a seguir:

CLÁUSULA 1ª - DO OBJETO
Por meio deste contrato, a CONTRATADA se compromete a prestar ao CONTRATANTE serviços de mentoria financeira individual via chamada de vídeo e suporte contínuo via WhatsApp.

CLÁUSULA 2ª - DA RETRIBUIÇÃO
Como contraprestação pelos serviços prestados, a CONTRATADA receberá a quantia total de {{valor_total}}, a ser paga pelo CONTRATANTE à CONTRATADA em {{parcelas_info}}, com vencimento todo dia {{dia_vencimento}} de cada mês, a partir de {{primeiro_vencimento}}.

CLÁUSULA 3ª - PRAZO E VIGÊNCIA
Início em {{data_inicio}} e término previsto para {{data_termino}}.`;

    await db.run(
      `INSERT INTO contract_templates (workspace_id, title, description, content, variables, agent_id, active)
       VALUES (1, ?, ?, ?, ?, '3', 1)`,
      [contractTitle, contractDesc, contractContent, contractVars]
    );
    console.log('✓ Modelo de contrato padrão cadastrado');
  }

  // 8. Seed de Tags e Listas
  const tagCount = await db.get('SELECT count(*) as c FROM tags');
  if (tagCount.c === 0) {
    await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (1, 'Quente', '#EF4444', '#FEE2E2');");
    await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (1, 'VIP', '#F59E0B', '#FEF3C7');");
    await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (1, 'Frio', '#3B82F6', '#DBEAFE');");
    console.log('✓ Tags padrão criadas');
  }

  // 9. Importação de dados completos do seed_data.json (se existirem e tabelas estiverem vazias)
  await importSeedData(db);

  console.log('🎉 Banco SQLite configurado com sucesso e 100% pronto para uso!');
}

async function importSeedData(db) {
  const seedFile = path.resolve(__dirname, 'seed_data.json');
  if (!fs.existsSync(seedFile)) return;

  try {
    const raw = fs.readFileSync(seedFile, 'utf8');
    const data = JSON.parse(raw);

    // 0. Sincronizar Workspace 1 (Cal.com, IA, Telegram, Auto-respond) se estiverem vazios
    if (data.workspaces && Array.isArray(data.workspaces) && data.workspaces[0]) {
      const ws = data.workspaces[0];
      await db.run(
        `UPDATE workspaces 
         SET cal_api_key = COALESCE(cal_api_key, ?),
             cal_link = COALESCE(cal_link, ?),
             telegram_token = COALESCE(telegram_token, ?),
             ai_provider = COALESCE(ai_provider, ?),
             ai_api_key = COALESCE(ai_api_key, ?),
             ai_base_url = COALESCE(ai_base_url, ?),
             ai_model = COALESCE(ai_model, ?),
             auto_respond_all = COALESCE(auto_respond_all, 1),
             auto_respond_type = COALESCE(auto_respond_type, 'agent'),
             auto_respond_target_id = COALESCE(auto_respond_target_id, '2')
         WHERE id = 1`,
        [
          ws.cal_api_key,
          ws.cal_link,
          ws.telegram_token,
          ws.ai_provider || 'anythingllm',
          ws.ai_api_key || 'SDD1V84-F1EMHXV-H0B7XHQ-3ZT4HS5',
          ws.ai_base_url || 'https://area-51-anything-llm.mypaeg.easypanel.host/api/v1',
          ws.ai_model || 'meu-workspace'
        ]
      );
    }

    // 1. Sempre garantir o usuário Yuri Assis (@yuri) e Administrador
    if (data.users && Array.isArray(data.users)) {
      for (const u of data.users) {
        const existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', [u.email, u.username]);
        if (!existing) {
          await db.run(
            `INSERT INTO users (workspace_id, name, username, email, password_hash, role)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [u.workspace_id || 1, u.name, u.username, u.email, u.password_hash, u.role || 'admin']
          );
        }
      }
    }

    // 1.5 Se a tabela lists estiver vazia, importar listas de contatos
    const listCount = await db.get('SELECT COUNT(*) as c FROM lists');
    if (listCount.c === 0 && data.lists && Array.isArray(data.lists)) {
      for (const l of data.lists) {
        await db.run(
          `INSERT INTO lists (id, workspace_id, name, created_at)
           VALUES (?, ?, ?, ?)`,
          [l.id, l.workspace_id || 1, l.name, l.created_at || new Date().toISOString()]
        );
      }
      console.log(`✓ ${data.lists.length} listas de contatos importadas do seed.`);
    }

    // 1.8 Se tags estiver vazia, importar tags
    const tagCount = await db.get('SELECT COUNT(*) as c FROM tags');
    if (tagCount.c === 0 && data.tags && Array.isArray(data.tags)) {
      for (const t of data.tags) {
        const existingTag = await db.get('SELECT id FROM tags WHERE id = ? OR name = ?', [t.id, t.name]);
        if (!existingTag) {
          await db.run(
            `INSERT INTO tags (id, workspace_id, name, color_hex, bg_hex)
             VALUES (?, ?, ?, ?, ?)`,
            [t.id, t.workspace_id || 1, t.name, t.color_hex, t.bg_hex]
          );
        }
      }
    }

    // 2. Se a tabela contacts estiver vazia, importar contatos do seed
    const contactCount = await db.get('SELECT COUNT(*) as c FROM contacts');
    if (contactCount.c === 0 && data.contacts && Array.isArray(data.contacts)) {
      for (const c of data.contacts) {
        await db.run(
          `INSERT INTO contacts (id, workspace_id, list_id, name, phone, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.workspace_id || 1, c.list_id, c.name, c.phone, c.status, c.created_at]
        );
      }
      console.log(`✓ ${data.contacts.length} contatos importados do seed.`);
    }

    // 2.5 Garante que a lista de sistema "Agendados" existe e contatos de agenda pertençam a ela
    let agendadosList = await db.get('SELECT id FROM lists WHERE workspace_id = ? AND name = ?', [1, 'Agendados']);
    if (!agendadosList) {
      const res = await db.run('INSERT INTO lists (workspace_id, name) VALUES (?, ?)', [1, 'Agendados']);
      agendadosList = { id: res.lastID };
      console.log(`✓ Lista "Agendados" inicializada com sucesso.`);
    }
    await db.run(
      'UPDATE contacts SET list_id = ? WHERE workspace_id = ? AND status = ? AND (list_id IS NULL OR list_id != ?)',
      [agendadosList.id, 1, 'Agendado', agendadosList.id]
    );

    // 3. Se a tabela agents tiver menos de 3, importar agentes do seed
    if (data.agents && Array.isArray(data.agents)) {
      for (const a of data.agents) {
        const existing = await db.get('SELECT id FROM agents WHERE name = ?', [a.name]);
        if (!existing) {
          await db.run(
            `INSERT INTO agents (workspace_id, name, icon, prompt, role, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [a.workspace_id || 1, a.name, a.icon, a.prompt, a.role, a.created_at]
          );
        }
      }
    }

    // 4. Se kanban_projects estiver vazia, importar tarefas
    const kanbanCount = await db.get('SELECT COUNT(*) as c FROM kanban_projects');
    if (kanbanCount.c === 0 && data.kanban_projects && Array.isArray(data.kanban_projects)) {
      for (const k of data.kanban_projects) {
        await db.run(
          `INSERT INTO kanban_projects (workspace_id, title, description, status, priority, due_date, tag, assignee_name, position, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [k.workspace_id || 1, k.title, k.description, k.status, k.priority, k.due_date, k.tag, k.assignee_name, k.position, k.created_at]
        );
      }
    }

    // 5. Se task_notes estiver vazia, importar post-its
    const notesCount = await db.get('SELECT COUNT(*) as c FROM task_notes');
    if (notesCount.c === 0 && data.task_notes && Array.isArray(data.task_notes)) {
      for (const n of data.task_notes) {
        await db.run(
          `INSERT INTO task_notes (workspace_id, title, color, category, items, is_pinned, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [n.workspace_id || 1, n.title, n.color, n.category, n.items, n.is_pinned, n.created_at]
        );
      }
    }

    // 6. Se contracts estiver vazia, importar contratos
    const contractCount = await db.get('SELECT COUNT(*) as c FROM contracts');
    if (contractCount.c === 0 && data.contracts && Array.isArray(data.contracts)) {
      for (const ct of data.contracts) {
        await db.run(
          `INSERT INTO contracts (workspace_id, template_id, client_name, client_phone, remote_jid, data, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [ct.workspace_id || 1, ct.template_id, ct.client_name, ct.client_phone, ct.remote_jid, ct.data, ct.status, ct.created_at]
        );
      }
    }

    // 7. Se calendar_events estiver vazia, importar eventos da agenda
    const calCount = await db.get('SELECT COUNT(*) as c FROM calendar_events');
    if (calCount.c === 0 && data.calendar_events && Array.isArray(data.calendar_events)) {
      for (const ev of data.calendar_events) {
        await db.run(
          `INSERT INTO calendar_events (workspace_id, title, date, time, type, attendee_name, attendee_phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [ev.workspace_id || 1, ev.title, ev.date, ev.time, ev.type, ev.attendee_name, ev.attendee_phone, ev.created_at]
        );
      }
    }

    // 8. Se email_accounts estiver vazia, importar contas de e-mail
    const emailAccCount = await db.get('SELECT COUNT(*) as c FROM email_accounts');
    if (emailAccCount.c === 0 && data.email_accounts && Array.isArray(data.email_accounts)) {
      for (const ea of data.email_accounts) {
        await db.run(
          `INSERT INTO email_accounts (workspace_id, name, email_address, display_name, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password, auto_reply_enabled, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ea.workspace_id || 1, ea.name, ea.email_address, ea.display_name, ea.imap_host, ea.imap_port, ea.imap_secure, ea.smtp_host, ea.smtp_port, ea.smtp_secure, ea.username, ea.password, ea.auto_reply_enabled, ea.status]
        );
      }
    }
  } catch (err) {
    console.warn('Aviso ao importar seed_data.json:', err.message);
  }
}

if (require.main === module) {
  init().catch(err => {
    console.error('❌ Erro crítico ao inicializar banco de dados:', err);
    process.exit(1);
  });
}

module.exports = { init };
