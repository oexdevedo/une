// File: backend/backup_db.js
/**
 * Copia database.sqlite para a pasta backup/ com timestamp.
 * Utiliza fs.promises para operação assíncrona.
 */
const path = require('path');
const fs = require('fs').promises;

async function backup() {
  try {
    const src = path.resolve(__dirname, 'database.sqlite');
    const backupDir = path.resolve(__dirname, '..', 'backup');
    await fs.mkdir(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `database_${timestamp}.sqlite`);
    await fs.copyFile(src, dest);
    console.log('✅ Backup concluído:', dest);
  } catch (e) {
    console.error('❌ Falha ao fazer backup:', e);
    process.exit(1);
  }
}

backup();
