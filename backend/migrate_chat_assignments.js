const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS chat_assignments (
        workspace_id INTEGER NOT NULL,
        remote_jid TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        PRIMARY KEY (workspace_id, remote_jid)
      );
    `);
    console.log("chat_assignments table created.");
  } catch (e) {
    console.log("Error:", e.message);
  }
}
migrate();
