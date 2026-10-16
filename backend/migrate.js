const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    console.log('Conectado ao MySQL remoto. Lendo schema...');
    
    // Ler o schema
    const schemaPath = path.join(__dirname, '..', 'schema_multiusuario.sql');
    let sql = fs.readFileSync(schemaPath, 'utf8');
    
    // Fix: the schema uses `unico_crm` but the DB in screenshot is `unico`.
    // Let's replace usages of `unico_crm` with `unico` to prevent errors.
    sql = sql.replace(/unico_crm/g, 'unico');

    console.log('Executando queries...');
    await connection.query(sql);
    console.log('Migração concluída com sucesso! Tabelas criadas no banco de dados online.');
  } catch (error) {
    console.error('Erro na migração:', error.message);
  } finally {
    await connection.end();
  }
}

runMigration();
