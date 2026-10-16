const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();
  try {
    await db.exec(`
      ALTER TABLE workspaces ADD COLUMN ai_provider TEXT DEFAULT 'openai';
      ALTER TABLE workspaces ADD COLUMN ai_api_key TEXT DEFAULT '';
      ALTER TABLE workspaces ADD COLUMN ai_base_url TEXT DEFAULT '';
      ALTER TABLE workspaces ADD COLUMN ai_model TEXT DEFAULT '';
    `);
    console.log("AI settings columns added.");
  } catch (e) {
    console.log("Migration might have already run or failed:", e.message);
  }
}
migrate();
