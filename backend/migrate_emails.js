const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();

  // Tabela de Contas de E-mail (Hostinger, IMAP/SMTP)
  await db.exec(`
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
  `);

  // Tabela de Mensagens de E-mail
  await db.exec(`
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
  `);

  console.log('✅ Tabelas email_accounts e email_messages criadas com sucesso!');
}

migrate().catch(err => {
  console.error('Erro na migração de emails:', err);
  process.exit(1);
});
