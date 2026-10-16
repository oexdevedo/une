const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();
  try {
    const tableInfo = await db.all("PRAGMA table_info(workspaces)");
    const cols = tableInfo.map(c => c.name);

    if (!cols.includes('auto_respond_all')) {
      await db.exec('ALTER TABLE workspaces ADD COLUMN auto_respond_all INTEGER DEFAULT 0;');
      console.log('Added auto_respond_all column to workspaces.');
    }
    if (!cols.includes('auto_respond_type')) {
      await db.exec("ALTER TABLE workspaces ADD COLUMN auto_respond_type TEXT DEFAULT 'agent';");
      console.log('Added auto_respond_type column to workspaces.');
    }
    if (!cols.includes('auto_respond_target_id')) {
      await db.exec("ALTER TABLE workspaces ADD COLUMN auto_respond_target_id TEXT DEFAULT 'none';");
      console.log('Added auto_respond_target_id column to workspaces.');
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        mode TEXT DEFAULT 'orchestra',
        porteiro_prompt TEXT,
        agents_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Automations table ensured.');

    const existingAuto = await db.get('SELECT id FROM automations WHERE workspace_id = 1');
    if (!existingAuto) {
      await db.run(
        `INSERT INTO automations (workspace_id, name, mode, porteiro_prompt) 
         VALUES (?, ?, ?, ?)`,
        [1, 'Orquestra de Agentes (Porteiro)', 'orchestra', 'Você é o recepcionista inteligente do Unico CRM. Atenda o cliente com cordialidade, rapidez e eficiência.']
      );
      console.log('Inserted default automation.');
    }

    console.log('Migration auto_respond completed successfully.');
  } catch (e) {
    console.error('Error during auto_respond migration:', e);
  }
}

migrate();
