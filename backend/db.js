const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const path = require('path');

let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: path.resolve(__dirname, 'database.sqlite'),
    driver: sqlite3.Database
  });
  
  // Enable foreign keys
  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  
  return dbInstance;
}

module.exports = { getDB };
