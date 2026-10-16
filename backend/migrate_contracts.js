const db = require('./db');

async function migrateContracts() {
  console.log('Iniciando migração de Contratos...');
  const database = await db.getDB();

  await database.exec(`
    CREATE TABLE IF NOT EXISTS contract_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      variables TEXT NOT NULL, -- JSON array: [{ key, label, prompt, type, required }]
      agent_id TEXT DEFAULT '3',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      template_id INTEGER REFERENCES contract_templates(id),
      client_name TEXT NOT NULL,
      client_phone TEXT,
      remote_jid TEXT,
      data TEXT NOT NULL DEFAULT '{}', -- JSON object: { "nome_cliente": "...", ... }
      status TEXT DEFAULT 'draft',    -- 'draft', 'collecting', 'completed', 'sent', 'signed'
      pdf_filename TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contract_collection_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      remote_jid TEXT NOT NULL,
      contract_id INTEGER NOT NULL REFERENCES contracts(id),
      template_id INTEGER NOT NULL REFERENCES contract_templates(id),
      current_variable_key TEXT,
      status TEXT DEFAULT 'active', -- 'active', 'completed', 'cancelled'
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, remote_jid)
    );
  `);

  // Adiciona um modelo padrão inicial se não houver nenhum
  const existing = await database.get('SELECT id FROM contract_templates LIMIT 1');
  if (!existing) {
    const defaultTitle = 'Contrato de Prestação de Serviços e Mentoria';
    const defaultDescription = 'Modelo padrão para contratação de mentorias, consultorias e serviços profissionais.';
    const defaultVariables = JSON.stringify([
      { key: 'nome_cliente', label: 'Nome Completo do Cliente', prompt: 'Para começarmos a confecção do seu contrato, qual o seu nome completo?', type: 'text', required: true },
      { key: 'cpf', label: 'CPF do Cliente', prompt: 'Perfeito! Qual o seu número de CPF?', type: 'text', required: true },
      { key: 'endereco', label: 'Endereço Completo', prompt: 'Qual o seu endereço completo (com cidade e CEP)?', type: 'text', required: true },
      { key: 'valor', label: 'Valor do Serviço / Mentoria', prompt: 'Qual o valor total acordado da mentoria/serviço (ex: R$ 2.500,00)?', type: 'text', required: true },
      { key: 'forma_pagamento', label: 'Forma de Pagamento', prompt: 'Qual a forma de pagamento combinada (ex: Pix à vista ou Cartão em 12x)?', type: 'text', required: true },
      { key: 'data_inicio', label: 'Data de Início', prompt: 'A partir de qual data iniciaremos as atividades?', type: 'text', required: true }
    ]);

    const defaultContent = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS E MENTORIA PROFISSIONAL

Pelo presente instrumento particular, de um lado:

CONTRATADA: UNICO SERVIÇOS E TECNOLOGIA LTDA, inscrita no CNPJ sob o nº 00.000.000/0001-00, com sede em Brasília/DF;

E, de outro lado:

CONTRATANTE: {{nome_cliente}}, portador(a) do CPF sob o nº {{cpf}}, residente e domiciliado(a) em {{endereco}};

Têm, entre si, justo e acordado o presente Contrato de Prestação de Serviços e Mentoria, mediante as seguintes cláusulas:

CLÁUSULA PRIMEIRA - DO OBJETO
O presente contrato tem como objeto a prestação de serviços de mentoria estratégica, direcionamento de negócios e suporte profissional pela CONTRATADA em favor do(a) CONTRATANTE.

CLÁUSULA SEGUNDA - DA VIGÊNCIA E INÍCIO
Os serviços terão início formal a partir da data de {{data_inicio}}, com acompanhamento regular conforme acordado entre as partes.

CLÁUSULA TERCEIRA - DO VALOR E FORMA DE PAGAMENTO
Pela prestação dos serviços objeto deste contrato, o(a) CONTRATANTE pagará à CONTRATADA o valor total de {{valor}}, a ser quitado através de {{forma_pagamento}}.

CLÁUSULA QUARTA - DO SIGILO E CONFIDENCIALIDADE
As partes comprometem-se a manter sob absoluto sigilo todas as informações confidenciais e estratégicas compartilhadas durante as sessões e execução dos serviços.

CLÁUSULA QUINTA - DA RESCISÃO
O presente contrato poderá ser rescindido por qualquer uma das partes mediante aviso prévio por escrito de 15 (quinze) dias.

CLÁUSULA SEXTA - DO FORO
Para dirimir quaisquer controvérsias oriundas do presente instrumento, as partes elegem o foro da Comarca do domicílio da CONTRATADA.

E, por estarem assim justas e contratadas, as partes assinam o presente contrato eletronicamente para que produza todos os efeitos legais.

Brasília/DF, {{data_atual}}.

____________________________________________
CONTRATADA: UNICO SERVIÇOS E TECNOLOGIA LTDA

____________________________________________
CONTRATANTE: {{nome_cliente}}
CPF: {{cpf}}`;

    await database.run(
      `INSERT INTO contract_templates (workspace_id, title, description, content, variables, agent_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, defaultTitle, defaultDescription, defaultContent, defaultVariables, '3']
    );
    console.log('✅ Modelo padrão de contrato criado com sucesso.');
  }

  console.log('✅ Migração de Contratos concluída com sucesso.');
}

migrateContracts().then(() => process.exit(0)).catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
