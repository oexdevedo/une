const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;
  
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite');
  
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Enable foreign keys
  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  
  return dbInstance;
}

module.exports = { getDB };
