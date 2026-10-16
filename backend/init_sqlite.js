const { getDB } = require('./db');

async function initDB() {
  try {
    const db = await getDB();
    
    console.log('Criando tabelas...');

    await db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'agent',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color_hex TEXT NOT NULL,
        bg_hex TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        list_id INTEGER,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        status TEXT DEFAULT 'Novo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS contact_tags (
        contact_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (contact_id, tag_id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
    `);

    // Inserir dados mock para teste (Workspace Inicial)
    console.log('Inserindo dados mock iniciais...');
    
    // Verifica se já existe o workspace
    const ws = await db.get('SELECT id FROM workspaces WHERE id = 1');
    if (!ws) {
      await db.run("INSERT INTO workspaces (name) VALUES ('Meu Escritório')");
      await db.run("INSERT INTO users (workspace_id, name, email, password_hash, role) VALUES (1, 'Rafael Costa', 'rafael@unico.com', '123456', 'admin')");
      
      // Inserir listas
      await db.run("INSERT INTO lists (workspace_id, name) VALUES (1, 'Leads VIP Outubro')");
      await db.run("INSERT INTO lists (workspace_id, name) VALUES (1, 'Inscritos Webinar')");
      
      // Inserir tags
      await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (1, 'Quente', '#EF4444', '#FEE2E2')");
      await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (1, 'VIP', '#F59E0B', '#FEF3C7')");
    }

    console.log('Banco de dados SQLite inicializado com sucesso em database.sqlite');
  } catch (error) {
    console.error('Erro ao inicializar o banco:', error);
  }
}

initDB();
