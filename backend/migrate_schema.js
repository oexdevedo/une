// File: backend/migrate_schema.js
/**
 * Executa migrações pendentes usando a tabela `schema_version`.
 * As migrações são arquivos JavaScript dentro `backend/migrations/`
 * nomeados como "001_descr.js", "002_descr.js", etc.
 * Cada arquivo exporta uma função async `up(db)` que recebe a
 * instância sqlite do `../db`.
 */
const fs = require('fs');
const path = require('path');
const { getDB } = require('./db');

async function getMigrations() {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = await fs.promises.readdir(migrationsDir);
  return files
    .filter(f => f.endsWith('.js'))
    .sort((a, b) => {
      const numA = parseInt(a.split('_')[0], 10);
      const numB = parseInt(b.split('_')[0], 10);
      return numA - numB;
    })
    .map(f => ({
      id: parseInt(f.split('_')[0], 10),
      file: path.join(migrationsDir, f)
    }));
}

async function run() {
  const db = await getDB();
  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    );
  `);

  const row = await db.get('SELECT version FROM schema_version WHERE id = 1');
  const currentVersion = row ? row.version : 0;

  const migrations = await getMigrations();
  for (const mig of migrations) {
    if (mig.id > currentVersion) {
      console.log(`🚀 Aplicando migração ${mig.id}: ${path.basename(mig.file)}`);
      const { up } = require(mig.file);
      await up(db);
      await db.run('UPDATE schema_version SET version = ? WHERE id = 1', mig.id);
      console.log(`✅ Migração ${mig.id} concluída`);
    }
  }

  console.log('🔧 Todas as migrações aplicadas. Versão atual:', Math.max(currentVersion, ...migrations.map(m => m.id)));
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Erro ao executar migrações:', err);
  process.exit(1);
});
