const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();
  try {
    await db.exec(`
      ALTER TABLE workspaces ADD COLUMN allow_stories INTEGER DEFAULT 1;
      ALTER TABLE workspaces ADD COLUMN allow_ephemeral INTEGER DEFAULT 1;
      ALTER TABLE workspaces ADD COLUMN allow_groups INTEGER DEFAULT 1;
    `);
    console.log("Settings columns added.");
  } catch (e) {
    console.log("Migration might have already run or failed:", e.message);
  }
}
migrate();
