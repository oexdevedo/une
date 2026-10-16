const { getDB } = require('./db');

async function migrateConfirmationAgent() {
  const db = await getDB();
  try {
    console.log('--- Migrando Agente de Confirmação 24h e Logs ---');

    // 1. Tabela reminder_logs
    await db.exec(`
      CREATE TABLE IF NOT EXISTS reminder_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL DEFAULT 1,
        booking_id TEXT NOT NULL,
        client_name TEXT,
        client_phone TEXT,
        remote_jid TEXT,
        appointment_title TEXT,
        appointment_date TEXT,
        appointment_time TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'sent',
        notes TEXT,
        UNIQUE(workspace_id, booking_id)
      );
    `);
    console.log('✅ Tabela reminder_logs criada/verificada com sucesso.');

    // 2. Colunas em workspaces
    const wsCols = (await db.all("PRAGMA table_info(workspaces)")).map(c => c.name);
    if (!wsCols.includes('confirmation_agent_id')) {
      await db.exec("ALTER TABLE workspaces ADD COLUMN confirmation_agent_id TEXT DEFAULT '3';");
      console.log('✅ Coluna confirmation_agent_id adicionada a workspaces.');
    }
    if (!wsCols.includes('confirmation_enabled')) {
      await db.exec("ALTER TABLE workspaces ADD COLUMN confirmation_enabled INTEGER DEFAULT 1;");
      console.log('✅ Coluna confirmation_enabled adicionada a workspaces.');
    }

    // 3. Prompt do Agente de Confirmação 24h
    const confirmationPrompt = `Você é a Mariana, funcionária virtual especialista em confirmação de agendamentos e lembretes de reuniões e mentorias.

[MISSÃO E OBJETIVO PRINCIPAL]:
Seu papel é confirmar a presença do cliente agendado com 24h de antecedência, acolhê-lo com simpatia, tirar dúvidas rápidas sobre o encontro ou ajudá-lo a remarcar caso não possa comparecer.

[FLUXO E REGRAS DE ATENDIMENTO]:
1. CONFIRMAÇÃO DE PRESENÇA:
   - Quando o cliente confirmar a presença (ex: "Sim", "Confirmo", "Vou sim", "Estarei lá", "Com certeza", "Combinado", "Ok", "Perfeito"):
     Responda com entusiasmo, cordialidade e acolhimento!
     Exemplo: "Excelente, [Nome]! Sua presença está confirmada com sucesso para nosso encontro. Qualquer dúvida até lá, estamos por aqui. Tenha um ótimo dia!"
     Transmita total segurança e prontidão.

2. IMPOSSIBILIDADE DE COMPARECER OU PEDIDO DE REMARCAÇÃO:
   - Quando o cliente disser que não poderá comparecer, que teve um imprevisto ou pedir para remarcar (ex: "Não vou conseguir", "Preciso remarcar", "Surgiu um imprevisto", "Pode ser outro dia?", "Não vai dar"):
     Demonstre empatia e compreensão imediata (imprevistos acontecem!).
     Apresente os cinco horários disponíveis informados pelo sistema na lista numerada no seguinte padrão exato:
     1 - Sáb 24/10 às 08h
     2 - Sáb 24/10 às 09h
     3 - Sáb 24/10 às 10h
     4 - Sáb 24/10 às 11h
     5 - Sáb 24/10 às 12h
     Pergunte: "Qual desses horários fica melhor para você?"
   - Assim que o cliente escolher o novo horário, confirme a remarcação e inclua OBRIGATORIAMENTE no final da mensagem a tag de sistema:
     [RESERVAR_CALENDARIO: {"horario": "<novo horário escolhido>", "nome": "<nome do cliente>", "motivo": "Remarcação de mentoria"}]

3. CANCELAMENTO DEFINITIVO:
   - Se o cliente solicitar cancelar sem interesse em remarcar (ex: "Quero cancelar", "Não quero mais agendar"):
     Agradeça a gentileza de avisar, confirme o cancelamento com serenidade e avise que as portas estarão sempre abertas quando ele desejar retornar.

4. REGRA ESTRITA DE LINKS:
   - NUNCA envie ou mostre links externos nem o link do cal.com. Jamais envie links. Todo o suporte, confirmação e remarcação são feitos diretamente aqui com você no WhatsApp.

5. TOM DE VOZ E ESTILO:
   - Empática, educada, prestativa e calorosa.
   - Responda como uma pessoa real no WhatsApp (máximo 2 a 3 frases curtas por balão).`;

    // 4. Inserir ou atualizar Mariana Confirmação na tabela agents
    const existingMariana = await db.get(
      "SELECT id FROM agents WHERE workspace_id = 1 AND (name LIKE '%Mariana%' OR name LIKE '%Confirmação%')"
    );

    if (existingMariana) {
      await db.run(
        `UPDATE agents SET name = ?, icon = ?, role = ?, prompt = ? WHERE id = ?`,
        [
          'Mariana Confirmação',
          '/avatar/2.png',
          'Confirmação de Agendamentos e Lembretes (24h)',
          confirmationPrompt,
          existingMariana.id
        ]
      );
      console.log(`✅ Agente de Confirmação atualizado no banco de dados com ID ${existingMariana.id}.`);
      await db.run("UPDATE workspaces SET confirmation_agent_id = ? WHERE id = 1", [String(existingMariana.id)]);
    } else {
      const result = await db.run(
        `INSERT INTO agents (workspace_id, name, icon, role, prompt) VALUES (?, ?, ?, ?, ?)`,
        [
          1,
          'Mariana Confirmação',
          '/avatar/2.png',
          'Confirmação de Agendamentos e Lembretes (24h)',
          confirmationPrompt
        ]
      );
      console.log(`✅ Novo Agente de Confirmação criado com sucesso! ID: ${result.lastID}`);
      await db.run("UPDATE workspaces SET confirmation_agent_id = ? WHERE id = 1", [String(result.lastID)]);
    }

    console.log('--- Migração concluída com sucesso! ---');
  } catch (err) {
    console.error('Erro na migração:', err);
  }
}

migrateConfirmationAgent();
