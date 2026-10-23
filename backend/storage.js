const path = require('path');
const fs = require('fs');

// DATA_DIR: caminho absoluto para a pasta de dados persistentes.
// No container Docker / Easypanel: /app/backend/data
// Em desenvolvimento local: backend/data
const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR) 
  : path.resolve(__dirname, 'data');

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 1. Caminho do Banco de Dados SQLite
const DB_PATH = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH) 
  : path.join(DATA_DIR, 'database.sqlite');

// Migração automática se database.sqlite estiver na pasta antiga (backend/) e não em DATA_DIR
const legacyDbPath = path.resolve(__dirname, 'database.sqlite');
if (path.resolve(DB_PATH) !== legacyDbPath && !fs.existsSync(DB_PATH) && fs.existsSync(legacyDbPath)) {
  console.log(`📦 [Storage] Migrando database.sqlite local para volume persistente (${DB_PATH})...`);
  try {
    fs.copyFileSync(legacyDbPath, DB_PATH);
    if (fs.existsSync(legacyDbPath + '-wal')) fs.copyFileSync(legacyDbPath + '-wal', DB_PATH + '-wal');
    if (fs.existsSync(legacyDbPath + '-shm')) fs.copyFileSync(legacyDbPath + '-shm', DB_PATH + '-shm');
    console.log(`✅ [Storage] Banco migrado com sucesso para volume persistente.`);
  } catch (err) {
    console.error(`❌ [Storage] Falha ao migrar database.sqlite:`, err);
  }
}

// 2. Diretório de Sessão do WhatsApp (Baileys)
function getWhatsAppAuthDir(workspaceId = 1) {
  const dirName = `auth_info_baileys_${workspaceId}`;
  const targetDir = path.join(DATA_DIR, dirName);
  const legacyDir = path.join(__dirname, dirName);

  if (!fs.existsSync(targetDir)) {
    if (fs.existsSync(legacyDir)) {
      console.log(`📦 [Storage] Migrando sessão WhatsApp (${legacyDir}) para volume persistente (${targetDir})...`);
      try {
        fs.cpSync(legacyDir, targetDir, { recursive: true });
        // Remove a pasta legada para não restaurar sessões expiradas caso a pasta persistente seja limpa
        fs.rmSync(legacyDir, { recursive: true, force: true });
        console.log(`✅ [Storage] Sessão WhatsApp migrada e pasta legada removida com sucesso.`);
      } catch (e) {
        console.error(`❌ [Storage] Falha ao migrar sessão WhatsApp:`, e.message);
      }
    } else {
      fs.mkdirSync(targetDir, { recursive: true });
    }
  }
  return targetDir;
}

function clearWhatsAppAuthDir(workspaceId = 1) {
  const dirName = `auth_info_baileys_${workspaceId}`;
  const targetDir = path.join(DATA_DIR, dirName);
  const legacyDir = path.join(__dirname, dirName);
  try {
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
    if (fs.existsSync(legacyDir)) fs.rmSync(legacyDir, { recursive: true, force: true });
    console.log(`🧹 [Storage] Pastas de autenticação do WhatsApp limpas para Workspace ${workspaceId}`);
  } catch (err) {
    console.error(`❌ [Storage] Erro ao limpar pastas de autenticação do WhatsApp:`, err.message);
  }
}

// 3. Diretório de Uploads
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  const legacyUploads = path.join(__dirname, 'uploads');
  if (fs.existsSync(legacyUploads)) {
    try {
      fs.cpSync(legacyUploads, UPLOADS_DIR, { recursive: true });
    } catch (e) {}
  } else {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

module.exports = {
  DATA_DIR,
  DB_PATH,
  UPLOADS_DIR,
  getWhatsAppAuthDir,
  clearWhatsAppAuthDir
};
