const { getDB } = require('./db');

async function migrateUsername() {
  console.log('🔄 Iniciando migração para login por @ (username)...');
  const db = await getDB();

  // Verifica se a coluna username já existe
  const columns = await db.all("PRAGMA table_info(users)");
  const hasUsername = columns.some(c => c.name.toLowerCase() === 'username');

  if (!hasUsername) {
    await db.exec("ALTER TABLE users ADD COLUMN username TEXT;");
    console.log("✓ Coluna 'username' adicionada com sucesso na tabela 'users'.");
  } else {
    console.log("✓ Coluna 'username' já existe na tabela 'users'.");
  }

  // Cria índice único para o username (insensível a maiúsculas/minúsculas)
  try {
    await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(LOWER(username)) WHERE username IS NOT NULL;");
    console.log("✓ Índice UNIQUE criado para 'username'.");
  } catch (idxErr) {
    console.warn("Aviso ao criar índice único de username:", idxErr.message);
  }

  // Atualiza usuários existentes que estejam com username nulo
  const users = await db.all("SELECT id, name, email, username FROM users");
  for (const user of users) {
    if (!user.username) {
      let defaultHandle = '';
      if (user.id === 1) {
        defaultHandle = 'rafael';
      } else if (user.email && user.email.includes('@')) {
        defaultHandle = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '');
      } else {
        defaultHandle = `user${user.id}`;
      }

      await db.run("UPDATE users SET username = ? WHERE id = ?", [defaultHandle, user.id]);
      console.log(`✓ Usuário id ${user.id} (${user.name}) atualizado com @${defaultHandle}`);
    }
  }

  console.log('🎉 Migração concluída com sucesso!');
}

migrateUsername().catch(err => {
  console.error('❌ Falha na migração:', err);
  process.exit(1);
});
