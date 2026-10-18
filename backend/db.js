const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const { DB_PATH } = require('./storage');

let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;
  
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  // Enable foreign keys and WAL mode for high concurrency
  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  await dbInstance.exec('PRAGMA journal_mode = WAL;');
  
  return dbInstance;
}

module.exports = { getDB };
