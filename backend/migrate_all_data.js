const { getDB } = require('./db');

async function migrateAll() {
  const db = await getDB();
  console.log('Running comprehensive database migration for all system data...');

  // 1. Templates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ templates table verified');

  // Seed default templates if empty
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
    console.log('✓ Seeded default templates in database');
  }

  // 2. Automations: add nodes_json column if missing
  const autoCols = (await db.all('PRAGMA table_info(automations)')).map(c => c.name);
  if (!autoCols.includes('nodes_json')) {
    await db.exec('ALTER TABLE automations ADD COLUMN nodes_json TEXT;');
    console.log('✓ Added nodes_json column to automations');
  }

  // 3. Calendar events table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      type TEXT DEFAULT 'event-work',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✓ calendar_events table verified');

  // 4. Contacts & Lists seed if contacts is empty
  const contactCount = await db.get('SELECT count(*) as c FROM contacts');
  if (contactCount.c === 0) {
    // Ensure lists exist
    const listCount = await db.get('SELECT count(*) as c FROM lists');
    let list1Id = 1;
    let list2Id = 2;
    if (listCount.c === 0) {
      const res1 = await db.run('INSERT INTO lists (workspace_id, name) VALUES (?, ?)', [1, 'Leads VIP Outubro']);
      const res2 = await db.run('INSERT INTO lists (workspace_id, name) VALUES (?, ?)', [1, 'Clientes Inativos']);
      list1Id = res1.lastID;
      list2Id = res2.lastID;
    }

    await db.run('INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
      [1, list1Id, 'João Silva', '(11) 99999-9999', 'Novo']
    );
    await db.run('INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
      [1, list1Id, 'Maria Souza', '(11) 98888-8888', 'Em Atendimento']
    );
    await db.run('INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
      [1, list2Id, 'Carlos Pereira', '(21) 97777-7777', 'Convertido']
    );
    console.log('✓ Seeded default contacts in database');
  }

  console.log('Migration complete!');
}

migrateAll().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
