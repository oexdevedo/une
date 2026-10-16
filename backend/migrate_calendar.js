const { getDB } = require('./db');

async function migrate() {
  const db = await getDB();
  try {
    const tableInfo = await db.all("PRAGMA table_info(workspaces)");
    const cols = tableInfo.map(c => c.name);

    if (!cols.includes('cal_api_key')) {
      await db.exec('ALTER TABLE workspaces ADD COLUMN cal_api_key TEXT;');
      console.log('Added cal_api_key column to workspaces.');
    }
    if (!cols.includes('cal_link')) {
      await db.exec('ALTER TABLE workspaces ADD COLUMN cal_link TEXT;');
      console.log('Added cal_link column to workspaces.');
    }

    console.log('Migration migrate_calendar completed.');
  } catch (e) {
    console.error('Error during calendar migration:', e);
  }
}

migrate();
