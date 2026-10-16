const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();
  try {
    const tableInfo = await db.all("PRAGMA table_info(agents)");
    const cols = tableInfo.map(c => c.name);

    if (!cols.includes('prompt')) {
      await db.exec('ALTER TABLE agents ADD COLUMN prompt TEXT;');
      console.log('Added prompt column to agents table.');
    }

    if (!cols.includes('role')) {
      await db.exec('ALTER TABLE agents ADD COLUMN role TEXT;');
      console.log('Added role column to agents table.');
    }

    // Atualizar agentes existentes que não possuem prompt
    await db.run(`
      UPDATE agents 
      SET prompt = 'Você é o assistente virtual de atendimento. Responda de forma humanizada, concisa e atenciosa aos clientes. Tire dúvidas com clareza e simule uma conversa natural.'
      WHERE prompt IS NULL OR prompt = ''
    `);
    console.log('Default prompts updated for existing agents.');

    console.log('Migration migrate_agent_prompt completed successfully.');
  } catch (e) {
    console.error('Error during agents prompt migration:', e);
  }
}

migrate();
