const { getDB } = require('./db.js');

async function migrateTasks() {
  console.log('🔄 Executando migration de Tarefas (Post-its & Kanban)...');
  const db = await getDB();

  // 1. Tabela de Post-its / Checklists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'yellow', -- yellow, pink, green, blue, purple, orange
      category TEXT DEFAULT 'Geral',
      items TEXT NOT NULL DEFAULT '[]', -- JSON array: [{ id, text, completed }]
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabela de Cards do Kanban
  await db.exec(`
    CREATE TABLE IF NOT EXISTS kanban_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo', -- todo, in_progress, review, done
      priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
      due_date TEXT,
      tag TEXT DEFAULT 'Geral',
      assignee_name TEXT,
      assignee_avatar TEXT,
      checklist_total INTEGER NOT NULL DEFAULT 0,
      checklist_done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Seed inicial se tabelas estiverem vazias
  const notesCount = await db.get('SELECT COUNT(*) as count FROM task_notes WHERE workspace_id = 1');
  if (notesCount.count === 0) {
    console.log('📝 Inserindo Post-its iniciais...');
    
    const initialNotes = [
      {
        title: '⚡ Metas da Semana',
        color: 'yellow',
        category: 'Prioritário',
        is_pinned: 1,
        items: JSON.stringify([
          { id: '1', text: 'Ajustar prompt do agente Lucas Vendas', completed: true },
          { id: '2', text: 'Revisar contratos pendentes de assinatura', completed: true },
          { id: '3', text: 'Ligar para clientes quentes do WhatsApp', completed: false },
          { id: '4', text: 'Configurar auto-resposta da Hostinger', completed: true }
        ])
      },
      {
        title: '💡 Ideias para Automação',
        color: 'pink',
        category: 'Inovação',
        is_pinned: 1,
        items: JSON.stringify([
          { id: '1', text: 'Disparo de lembrete 1h antes da mentoria', completed: true },
          { id: '2', text: 'Integração direta com Google Agenda', completed: false },
          { id: '3', text: 'Pesquisa de satisfação pós-atendimento', completed: false }
        ])
      },
      {
        title: '🎯 Reunião de Alinhamento',
        color: 'green',
        category: 'Estratégia',
        is_pinned: 0,
        items: JSON.stringify([
          { id: '1', text: 'Apresentar métricas de conversão do mês', completed: false },
          { id: '2', text: 'Validar novo fluxo de vendas com a equipe', completed: false },
          { id: '3', text: 'Definir orçamento para tráfego pago', completed: false }
        ])
      },
      {
        title: '📋 Onboarding Novos Clientes',
        color: 'blue',
        category: 'Operações',
        is_pinned: 0,
        items: JSON.stringify([
          { id: '1', text: 'Enviar termo de adesão assinado', completed: true },
          { id: '2', text: 'Liberar acesso à plataforma Unico', completed: true },
          { id: '3', text: 'Agendar sessão de boas-vindas com mentor', completed: false }
        ])
      },
      {
        title: '⚙️ Tarefas Administrativas',
        color: 'purple',
        category: 'Financeiro',
        is_pinned: 0,
        items: JSON.stringify([
          { id: '1', text: 'Emitir notas fiscais dos contratos fechados', completed: true },
          { id: '2', text: 'Conciliar extrato bancário da empresa', completed: false },
          { id: '3', text: 'Renovar assinatura dos servidores em nuvem', completed: false }
        ])
      },
      {
        title: '🚀 Lançamento Mentoria VIP',
        color: 'orange',
        category: 'Marketing',
        is_pinned: 0,
        items: JSON.stringify([
          { id: '1', text: 'Gravar vídeo de boas-vindas para o grupo', completed: false },
          { id: '2', text: 'Disparar mensagens em massa no WhatsApp', completed: false },
          { id: '3', text: 'Organizar links de materiais no Notion', completed: false }
        ])
      }
    ];

    for (const note of initialNotes) {
      await db.run(
        `INSERT INTO task_notes (workspace_id, title, color, category, is_pinned, items) VALUES (1, ?, ?, ?, ?, ?)`,
        [note.title, note.color, note.category, note.is_pinned, note.items]
      );
    }
  }

  const kanbanCount = await db.get('SELECT COUNT(*) as count FROM kanban_projects WHERE workspace_id = 1');
  if (kanbanCount.count === 0) {
    console.log('📊 Inserindo cards iniciais do Kanban...');

    const initialProjects = [
      {
        title: 'Novo fluxo de nutrição de Leads',
        description: 'Construir sequências automáticas com mensagens educativas e convites para mentoria.',
        status: 'todo',
        priority: 'high',
        due_date: '2026-10-25',
        tag: 'Marketing',
        assignee_name: 'Yuri Assis',
        assignee_avatar: 'YA',
        checklist_total: 4,
        checklist_done: 1,
        position: 0
      },
      {
        title: 'Integração Webhook com Gateway de Pagamento',
        description: 'Receber confirmação de PIX e cartão para atualizar status do contrato em tempo real.',
        status: 'todo',
        priority: 'medium',
        due_date: '2026-10-30',
        tag: 'Dev & API',
        assignee_name: 'Wyllkens',
        assignee_avatar: 'W',
        checklist_total: 3,
        checklist_done: 0,
        position: 1
      },
      {
        title: 'Treinamento do Agente Lucas Vendas',
        description: 'Aprimorar o contexto com objeções reais de clientes e novos produtos financeiros.',
        status: 'in_progress',
        priority: 'urgent',
        due_date: '2026-10-18',
        tag: 'IA & Agentes',
        assignee_name: 'Lucas IA',
        assignee_avatar: '🤖',
        checklist_total: 5,
        checklist_done: 3,
        position: 0
      },
      {
        title: 'Refatoração dos Modelos de Contratos em PDF',
        description: 'Padronizar cabeçalho, alinhamento justificado e cláusulas de rescisão com assinaturas.',
        status: 'in_progress',
        priority: 'high',
        due_date: '2026-10-20',
        tag: 'Jurídico',
        assignee_name: 'Yuri Assis',
        assignee_avatar: 'YA',
        checklist_total: 6,
        checklist_done: 4,
        position: 1
      },
      {
        title: 'Página de Agendamentos e Calendário',
        description: 'Interface responsiva integrada ao Cal.com com disparos de lembretes automáticos.',
        status: 'review',
        priority: 'medium',
        due_date: '2026-10-16',
        tag: 'Frontend',
        assignee_name: 'Wyllkens',
        assignee_avatar: 'W',
        checklist_total: 5,
        checklist_done: 5,
        position: 0
      },
      {
        title: 'Configuração do E-mail Hostinger (IMAP & SMTP)',
        description: 'Conexão validada em porta 465 SSL com auto-resposta inteligente do agente.',
        status: 'done',
        priority: 'high',
        due_date: '2026-10-14',
        tag: 'Infra & E-mail',
        assignee_name: 'Equipe TI',
        assignee_avatar: 'TI',
        checklist_total: 3,
        checklist_done: 3,
        position: 0
      },
      {
        title: 'Disparo de Mensagens em Massa de Pré-Lançamento',
        description: 'Envio programado com tags personalizadas e controle de intervalo anti-bloqueio.',
        status: 'done',
        priority: 'high',
        due_date: '2026-10-12',
        tag: 'Vendas',
        assignee_name: 'Lucas IA',
        assignee_avatar: '🤖',
        checklist_total: 4,
        checklist_done: 4,
        position: 1
      }
    ];

    for (const p of initialProjects) {
      await db.run(
        `INSERT INTO kanban_projects 
         (workspace_id, title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, position)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.title, p.description, p.status, p.priority, p.due_date, p.tag, p.assignee_name, p.assignee_avatar, p.checklist_total, p.checklist_done, p.position]
      );
    }
  }

  console.log('✅ Migration de Tarefas concluída com sucesso!');
}

if (require.main === module) {
  migrateTasks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Erro na migration de Tarefas:', err);
      process.exit(1);
    });
}

module.exports = { migrateTasks };
