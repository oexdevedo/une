// File: backend/workspace_seeder.js
/**
 * Popula dados e configurações padrão para um novo Workspace (Multi-tenant)
 * Garante que cada usuário/workspace tenha seus próprios Agentes, Templates, Contratos e Lista de Agendados.
 */
const { getOrCreateAgendadosList } = require('./reminder_service');

async function seedWorkspaceDefaults(db, workspaceId, workspaceName = 'Meu Escritório') {
  if (!workspaceId) return;

  try {
    // 1. Agente Lucas Vendas (Comercial e Agendamentos)
    const existingLucas = await db.get(
      'SELECT id FROM agents WHERE workspace_id = ? AND (name LIKE ? OR id = ?)', 
      [workspaceId, '%Lucas%', 2]
    );
    if (!existingLucas) {
      const lucasPrompt = `Você é o Lucas, funcionário virtual especialista em atendimento comercial e agendamentos.

[FLUXO OBRIGATÓRIO DE AGENDAMENTO E CALENDÁRIO]:
1. APRESENTAÇÃO DE HORÁRIOS DISPONÍVEIS:
   - Quando o cliente demonstrar interesse em agendar, falar sobre disponibilidade ou perguntar que dias/horários você tem:
     Apresente os horários informados pelo sistema SEMPRE em forma de lista numerada.
   - Pergunte qual desses horários fica bom para ele.

2. DADOS OBRIGATÓRIOS ANTES DE CONFIRMAR A VAGA:
   - Para oficializar e reservar a vaga na agenda, você DEVE OBRIGATORIAMENTE pedir:
     a) Nome completo do cliente
     b) Motivo do agendamento (qual assunto ou objetivo deseja tratar)
   - NUNCA confirme a reserva sem ter o Nome do cliente e o Motivo do agendamento.

3. EFETIVAÇÃO E RESERVA OFICIAL NO CAL.COM:
   - Assim que você tiver os 3 dados (Horário escolhido, Nome completo e Motivo):
     Confirme a reserva com entusiasmo, citando a data, horário, nome e o motivo!
     E inclua OBRIGATORIAMENTE no final da mensagem a tag de sistema:
     [RESERVAR_CALENDARIO: {"horario": "<horário escolhido>", "nome": "<nome do cliente>", "motivo": "<motivo do agendamento>"}]
   - A tag será lida pelo sistema para efetivar a reserva no Cal.com e será ocultada antes de chegar ao cliente.

4. REGRA ESTRITA DE LINKS:
   - NUNCA envie ou mostre links externos nem o link do cal.com. Jamais envie links. O agendamento é feito 100% diretamente com você por aqui.

- Tom de voz: Acolhedor, prestativo, educado e ágil.
- Responda de forma natural e humana no chat (máximo 2 a 3 frases curtas por balão).`;

      await db.run(
        `INSERT INTO agents (workspace_id, name, icon, prompt, role)
         VALUES (?, 'Lucas Vendas', '/avatar/1.png', ?, 'Consultor Comercial e Agendamentos')`,
        [workspaceId, lucasPrompt]
      );
    }

    // 2. Agente Mariana Confirmação (Lembretes e Reagendamentos)
    const existingMariana = await db.get(
      'SELECT id FROM agents WHERE workspace_id = ? AND (name LIKE ? OR id = ?)', 
      [workspaceId, '%Mariana%', 3]
    );
    if (!existingMariana) {
      const marianaPrompt = `Você é a Mariana, funcionária virtual especialista em confirmação de agendamentos e lembretes de reuniões e mentorias.

[MISSÃO E OBJETIVO PRINCIPAL]:
Seu papel é confirmar a presença do cliente agendado com 24h de antecedência, acolhê-lo com simpatia, tirar dúvidas rápidas sobre o encontro ou ajudá-lo a remarcar caso não possa comparecer.

[FLUXO E REGRAS DE ATENDIMENTO]:
1. CONFIRMAÇÃO DE PRESENÇA:
   - Quando o cliente confirmar a presença (ex: "Sim", "Confirmo", "Vou sim", "Estarei lá", "Com certeza", "Combinado", "Ok", "Perfeito"):
     Responda com entusiasmo, cordialidade e acolhimento!
     Exemplo: "Excelente, [Nome]! Sua presença está confirmada com sucesso para nosso encontro. Qualquer dúvida até lá, estamos por aqui. Tenha um ótimo dia!"

2. IMPOSSIBILIDADE DE COMPARECER OU PEDIDO DE REMARCAÇÃO:
   - Quando o cliente disser que não poderá comparecer ou pedir para remarcar:
     Demonstre empatia e compreensão imediata.
     Apresente os horários disponíveis informados pelo sistema na lista numerada.
     Assim que o cliente escolher o novo horário, confirme a remarcação e inclua OBRIGATORIAMENTE a tag:
     [RESERVAR_CALENDARIO: {"horario": "<novo horário escolhido>", "nome": "<nome do cliente>", "motivo": "Remarcação de mentoria"}]

3. CANCELAMENTO DEFINITIVO:
   - Se o cliente solicitar cancelar sem interesse em remarcar, agradeça e confirme o cancelamento cordialmente.

4. REGRA ESTRITA DE LINKS:
   - NUNCA envie ou mostre links externos nem o link do cal.com.

5. TOM DE VOZ E ESTILO:
   - Empática, educada, prestativa e calorosa.
   - Responda como uma pessoa real no WhatsApp (máximo 2 a 3 frases curtas por balão).`;

      await db.run(
        `INSERT INTO agents (workspace_id, name, icon, prompt, role)
         VALUES (?, 'Mariana Confirmação', '/avatar/2.png', ?, 'Confirmação de Agendamentos e Lembretes (24h)')`,
        [workspaceId, marianaPrompt]
      );
    }

    // 3. Templates Padrão de Mensagens
    const existingTmpl = await db.get('SELECT count(*) as count FROM templates WHERE workspace_id = ?', [workspaceId]);
    if (existingTmpl.count === 0) {
      await db.run(
        'INSERT INTO templates (workspace_id, title, content) VALUES (?, ?, ?)',
        [workspaceId, 'Boas-vindas', '# Olá!\n\nSeja bem-vindo(a) ao nosso atendimento.\nComo posso ajudar hoje?']
      );
      await db.run(
        'INSERT INTO templates (workspace_id, title, content) VALUES (?, ?, ?)',
        [workspaceId, 'Agendamento Confirmado', 'Olá {primeiro_nome}! Sua reunião foi confirmada com sucesso em nossa agenda. Até breve!']
      );
    }

    // 4. Modelo de Contrato Padrão
    const existingContract = await db.get('SELECT count(*) as count FROM contract_templates WHERE workspace_id = ?', [workspaceId]);
    if (existingContract.count === 0) {
      const contractTitle = 'Contrato de Prestação de Serviços';
      const contractDesc = 'Modelo padrão de prestação de serviços e consultoria com coleta automática de dados.';
      const contractVars = JSON.stringify([
        { key: "nome_cliente", label: "Nome Completo do Contratante", prompt: "Para começarmos a confecção do seu contrato, qual é o seu *nome completo*?", type: "text", required: true },
        { key: "cpf", label: "CPF do Contratante", prompt: "Perfeito! Qual é o seu número de *CPF*?", type: "text", required: true },
        { key: "rg", label: "RG do Contratante", prompt: "Poderia me informar o seu *RG* (número e órgão expedidor)?", type: "text", required: true },
        { key: "endereco", label: "Endereço Completo com CEP", prompt: "Qual é o seu *endereço completo* (com rua, número, complemento, bairro, cidade e CEP)?", type: "text", required: true },
        { key: "email", label: "E-mail de Contato", prompt: "Qual o seu melhor *e-mail* para envio do contrato?", type: "text", required: true },
        { key: "valor_total", label: "Valor Total dos Serviços", prompt: "Qual é o *valor total* acordado do serviço (ex: R$ 2.500,00)?", type: "text", required: true },
        { key: "parcelas_info", label: "Forma de Parcelamento", prompt: "Como será a condição de pagamento (ex: à vista ou em até 10x)?", type: "text", required: true }
      ]);
      const contractContent = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATANTE: {{nome_cliente}}, portador do CPF nº {{cpf}} e RG nº {{rg}}, residente e domiciliado em {{endereco}}, e-mail {{email}}.

CONTRATADA: Prestador de Serviços Unico CRM.

As partes têm entre si justo e contratado a prestação de serviços profissionais conforme as cláusulas a seguir:

CLÁUSULA 1ª - DO OBJETO
Prestação de serviços acordados diretamente com o contratante via canais digitais e atendimento personalizado.

CLÁUSULA 2ª - DA REMUNERAÇÃO
Pelos serviços prestados, o CONTRATANTE pagará à CONTRATADA o valor de {{valor_total}}, na modalidade {{parcelas_info}}.`;

      await db.run(
        `INSERT INTO contract_templates (workspace_id, title, description, content, variables, agent_id, active)
         VALUES (?, ?, ?, ?, ?, '3', 1)`,
        [workspaceId, contractTitle, contractDesc, contractContent, contractVars]
      );
    }

    // 5. Tags Padrão
    const existingTags = await db.get('SELECT count(*) as count FROM tags WHERE workspace_id = ?', [workspaceId]);
    if (existingTags.count === 0) {
      await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (?, 'Quente', '#EF4444', '#FEE2E2')", [workspaceId]);
      await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (?, 'VIP', '#F59E0B', '#FEF3C7')", [workspaceId]);
      await db.run("INSERT INTO tags (workspace_id, name, color_hex, bg_hex) VALUES (?, 'Frio', '#3B82F6', '#DBEAFE')", [workspaceId]);
    }

    // 6. Lista Automática de "Agendados" do Workspace
    await getOrCreateAgendadosList(db, workspaceId);

    console.log(`✅ [WorkspaceSeeder] Padrões configurados para Workspace ${workspaceId} (${workspaceName})`);
  } catch (err) {
    console.error(`❌ [WorkspaceSeeder] Erro ao semear Workspace ${workspaceId}:`, err);
  }
}

module.exports = { seedWorkspaceDefaults };
