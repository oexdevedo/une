const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./db');

/**
 * Substitui tags {{variavel}} pelos dados fornecidos
 */
function interpolateContent(content, data) {
  let result = content;
  const now = new Date();
  const dateOpts = { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' };
  const dataAtual = now.toLocaleDateString('pt-BR', dateOpts);

  result = result.replace(/\{\{\s*data_atual\s*\}\}/gi, dataAtual);

  for (const [key, value] of Object.entries(data || {})) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    result = result.replace(regex, value || `[${key}]`);
  }
  return result;
}

/**
 * Gera um arquivo PDF profissional do contrato utilizando PDFKit
 */
async function generateContractPdf({ title, content, data, clientName, outputPath }) {
  return new Promise((resolve, reject) => {
    try {
      const compiledText = interpolateContent(content, data);
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 55, right: 55 },
        bufferPages: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Cabeçalho institucional discreto
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#64748B')
        .text('UNICO SISTEMAS • DOCUMENTO CONTRATUAL OFICIAL', { align: 'center', characterSpacing: 1 })
        .moveDown(0.3);

      doc
        .strokeColor('#CBD5E1')
        .lineWidth(0.5)
        .moveTo(55, doc.y)
        .lineTo(540, doc.y)
        .stroke()
        .moveDown(1.5);

      // Título do Contrato
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor('#0F172A')
        .text(title.toUpperCase(), { align: 'left', lineGap: 3 })
        .moveDown(1.2);

      // Corpo do Contrato
      const paragraphs = compiledText.split('\n');
      for (const rawParagraph of paragraphs) {
        let p = rawParagraph.trim();
        if (!p) {
          doc.moveDown(0.4);
          continue;
        }

        // Detecta se é linha de assinatura
        if (/^_{8,}/.test(p)) {
          doc.moveDown(1.2);
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor('#334155')
            .text('____________________________________________________', { align: 'left' });
          continue;
        }

        // Detecta bullets (listas como > * ou * ou • ou - )
        if (/^(?:>\s*\*|\*|•|-)\s+/.test(p)) {
          const bulletText = p.replace(/^(?:>\s*\*|\*|•|-)\s+/, '').replace(/\*\*/g, '').trim();
          doc
            .fontSize(9.5)
            .font('Helvetica')
            .fillColor('#334155')
            .text(`•  ${bulletText}`, {
              align: 'justify',
              lineGap: 2.5
            })
            .moveDown(0.3);
          continue;
        }

        // Remove marcações de cabeçalho markdown (## ) e asteriscos duplos para análise
        const cleanP = p.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();

        // Subtítulo principal
        if (/^CONTRATO DE PRESTAÇÃO DE SERVIÇOS/i.test(cleanP)) {
          doc
            .fontSize(10.5)
            .font('Helvetica-Bold')
            .fillColor('#0F172A')
            .text(cleanP, { align: 'left', lineGap: 2 })
            .moveDown(0.4);
          continue;
        }

        // Verifica se é título de cláusula
        if (/^(?:CLÁUSULA|CLÁUSULA\s+[0-9ªºA-ZÇÃÕ]+|DO\s+OBJETO|DO\s+PRAZO|DA\s+RETRIBUIÇÃO|DO\s+SIGILO|DO\s+FORO)/i.test(cleanP)) {
          doc.moveDown(0.5);
          doc
            .fontSize(10.5)
            .font('Helvetica-Bold')
            .fillColor('#0F172A')
            .text(cleanP, { align: 'left', lineGap: 2 })
            .moveDown(0.3);
          continue;
        }

        // Legislações ou Subtítulos em destaque
        if (/^(?:Lei Geral de Proteção|Código Civil|Marco Civil da Internet|Lei de Propriedade Intelectual)/i.test(cleanP)) {
          doc.moveDown(0.3);
          doc
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .fillColor('#1E293B')
            .text(cleanP, { align: 'left', lineGap: 2 })
            .moveDown(0.2);
          continue;
        }

        // Nomes nas assinaturas finais (quando a linha tem apenas CONTRATANTE ou CONTRATADA)
        if (/^(?:CONTRATADA|CONTRATANTE)$/i.test(cleanP)) {
          doc
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .fillColor('#1E293B')
            .text(cleanP, { align: 'left', lineGap: 1.5 });
          continue;
        }

        // Qualificação das partes com destaque (CONTRATANTE / CONTRATADA) e texto justificado
        if (/^(CONTRATANTE|CONTRATADA):\s*(.*)/i.test(cleanP)) {
          const match = cleanP.match(/^(CONTRATANTE|CONTRATADA):\s*(.*)/i);
          doc
            .fontSize(9.5)
            .font('Helvetica-Bold')
            .fillColor('#0F172A')
            .text(`${match[1].toUpperCase()}: `, { continued: true })
            .font('Helvetica')
            .fillColor('#334155')
            .text(match[2], { align: 'justify', lineGap: 3 })
            .moveDown(0.4);
          continue;
        }

        // Data e local (ex: Brasília/DF, ...)
        if (/^[A-Za-zÀ-ÿ\s]+\/[A-Z]{2},\s+[0-9]+/i.test(cleanP)) {
          doc.moveDown(0.6);
          doc
            .fontSize(9.5)
            .font('Helvetica')
            .fillColor('#334155')
            .text(cleanP, { align: 'left', lineGap: 2 })
            .moveDown(0.4);
          continue;
        }

        // Parágrafos comuns (justificados e alinhados à esquerda)
        const textToPrint = p.replace(/\*\*/g, '').replace(/\\/g, '');
        doc
          .fontSize(9.5)
          .font('Helvetica')
          .fillColor('#334155')
          .text(textToPrint, {
            align: 'justify',
            lineGap: 3
          })
          .moveDown(0.4);
      }

      // Rodapé em todas as páginas
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#94A3B8')
          .text(
            `Página ${i + 1} de ${range.count} • Documento gerado eletronicamente em ${new Date().toLocaleDateString('pt-BR')}`,
            55,
            780,
            { align: 'center', width: 485 }
          );
      }

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Cria ou recupera o contrato e inicia a coleta com o lead via WhatsApp
 */
async function startContractCollection(workspaceId = 1, { templateId, clientName, clientPhone, remoteJid }) {
  const database = await db.getDB();
  const template = await database.get('SELECT * FROM contract_templates WHERE id = ?', [templateId]);
  if (!template) {
    throw new Error('Modelo de contrato não encontrado');
  }

  const variables = JSON.parse(template.variables || '[]');
  if (variables.length === 0) {
    throw new Error('O modelo não possui variáveis cadastradas para coleta');
  }

  // Se o nome do cliente for fornecido, já inicializa com ele
  const initialData = {};
  if (clientName) {
    const nameVar = variables.find(v => v.key.includes('nome'));
    if (nameVar) {
      initialData[nameVar.key] = clientName;
    }
  }

  // Cria o registro do contrato
  const contractRes = await database.run(
    `INSERT INTO contracts (workspace_id, template_id, client_name, client_phone, remote_jid, data, status)
     VALUES (?, ?, ?, ?, ?, ?, 'collecting')`,
    [workspaceId, templateId, clientName || 'Lead', clientPhone || '', remoteJid, JSON.stringify(initialData)]
  );
  const contractId = contractRes.lastID;

  // Encontra a primeira variável faltante
  const firstMissing = variables.find(v => !initialData[v.key]);
  const currentKey = firstMissing ? firstMissing.key : variables[0].key;

  // Cria ou atualiza a sessão de coleta ativa
  await database.run(
    `INSERT INTO contract_collection_sessions (workspace_id, remote_jid, contract_id, template_id, current_variable_key, status)
     VALUES (?, ?, ?, ?, ?, 'active')
     ON CONFLICT(workspace_id, remote_jid) DO UPDATE SET
       contract_id = excluded.contract_id,
       template_id = excluded.template_id,
       current_variable_key = excluded.current_variable_key,
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
    [workspaceId, remoteJid, contractId, templateId, currentKey]
  );

  // Atribui o chat ao agente de contratos configurado
  if (template.agent_id) {
    await database.run(
      `INSERT INTO chat_assignments (workspace_id, remote_jid, agent_id)
       VALUES (?, ?, ?)
       ON CONFLICT(workspace_id, remote_jid) DO UPDATE SET agent_id = excluded.agent_id`,
      [workspaceId, remoteJid, String(template.agent_id)]
    );
  }

  // Envia a primeira pergunta pelo WhatsApp
  const promptMessage = firstMissing ? firstMissing.prompt : variables[0].prompt;
  const initialGreeting = `Olá, ${clientName ? clientName.split(' ')[0] : 'tudo bem'}! Vamos confeccionar o seu contrato de *${template.title}*.\n\n${promptMessage}`;

  const { sendMessage } = require('./whatsapp');
  await sendMessage(workspaceId, remoteJid, initialGreeting, null);

  // Registra no histórico de mensagens
  await database.run(
    `INSERT INTO messages (id, workspace_id, remote_jid, from_me, text, type, timestamp, push_name)
     VALUES (?, ?, ?, 1, ?, 'text', ?, 'Agente de Contratos')`,
    [`contr_${Date.now()}`, workspaceId, remoteJid, initialGreeting, Math.floor(Date.now() / 1000)]
  );

  return { success: true, contractId, nextVariable: currentKey };
}

/**
 * Intercepta e processa mensagens recebidas do lead durante uma sessão de coleta de contrato
 */
async function handleInboundContractAnswer(workspaceId = 1, remoteJid, answerText) {
  const database = await db.getDB();
  const session = await database.get(
    `SELECT * FROM contract_collection_sessions 
     WHERE workspace_id = ? AND remote_jid = ? AND status = 'active'`,
    [workspaceId, remoteJid]
  );

  if (!session) return false;

  const contract = await database.get('SELECT * FROM contracts WHERE id = ?', [session.contract_id]);
  const template = await database.get('SELECT * FROM contract_templates WHERE id = ?', [session.template_id]);
  if (!contract || !template) return false;

  const variables = JSON.parse(template.variables || '[]');
  const currentData = JSON.parse(contract.data || '{}');

  // Salva a resposta da variável atual limpa
  const answeredKey = session.current_variable_key;
  if (answeredKey) {
    currentData[answeredKey] = (answerText || '').trim();
    console.log(`📝 [ContractService] Dado coletado para [${answeredKey}]: "${currentData[answeredKey]}"`);
  }

  // Verifica qual é a próxima variável obrigatória faltante
  const remaining = variables.find(v => !currentData[v.key]);

  if (remaining) {
    // Atualiza a sessão para a próxima variável
    await database.run(
      'UPDATE contract_collection_sessions SET current_variable_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [remaining.key, session.id]
    );

    await database.run(
      'UPDATE contracts SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(currentData), contract.id]
    );

    // Envia a próxima pergunta com tom empático e conversacional
    const { sendMessage } = require('./whatsapp');
    const promptMessage = remaining.prompt;
    const replyText = `Anotado! 👍\n\n${promptMessage}`;

    await sendMessage(workspaceId, remoteJid, replyText, null);

    await database.run(
      `INSERT INTO messages (id, workspace_id, remote_jid, from_me, text, type, timestamp, push_name)
       VALUES (?, ?, ?, 1, ?, 'text', ?, 'Agente de Contratos')`,
      [`contr_${Date.now()}`, workspaceId, remoteJid, replyText, Math.floor(Date.now() / 1000)]
    );

    return true;
  } else {
    // TODAS as variáveis foram respondidas! Finaliza a coleta e gera o PDF!
    console.log(`🎉 [ContractService] Todos os dados foram coletados para o contrato ID: ${contract.id}! Confeccionando PDF...`);

    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const safeClient = (contract.client_name || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFileName = `contrato_${contract.id}_${safeClient}.pdf`;
    const outputPath = path.join(uploadsDir, pdfFileName);

    await generateContractPdf({
      title: template.title,
      content: template.content,
      data: currentData,
      clientName: contract.client_name,
      outputPath
    });

    console.log(`📄 [ContractService] PDF confeccionado com sucesso em: ${outputPath}`);

    // Atualiza o contrato no banco
    await database.run(
      `UPDATE contracts SET data = ?, status = 'sent', pdf_filename = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [JSON.stringify(currentData), pdfFileName, contract.id]
    );

    // Encerra a sessão de coleta
    await database.run(
      `UPDATE contract_collection_sessions SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [session.id]
    );

    // Envia mensagem final e o arquivo PDF no WhatsApp do lead
    const { sendMessage } = require('./whatsapp');
    const finalMsg = `Excelente! Todos os dados foram preenchidos com sucesso e o seu contrato foi confeccionado. 📄✨\n\nEstou enviando o arquivo em anexo abaixo para sua conferência e assinatura:`;

    await sendMessage(workspaceId, remoteJid, finalMsg, null);

    // Envia o documento PDF via WhatsApp
    const pdfFile = {
      path: outputPath,
      mimetype: 'application/pdf',
      originalname: `${template.title.replace(/[^a-zA-Z0-9 ]/g, '')}.pdf`,
      filename: pdfFileName
    };
    await sendMessage(workspaceId, remoteJid, '', pdfFile);

    console.log(`🚀 [ContractService] Contrato PDF enviado com sucesso no WhatsApp de ${remoteJid}!`);
    return true;
  }
}

/**
 * Envia o PDF de um contrato já gerado via WhatsApp
 */
async function sendContractViaWhatsapp(workspaceId = 1, contractId) {
  const database = await db.getDB();
  const contract = await database.get('SELECT * FROM contracts WHERE id = ?', [contractId]);
  if (!contract) throw new Error('Contrato não encontrado');
  if (!contract.pdf_filename) throw new Error('O PDF deste contrato ainda não foi confeccionado');

  const template = await database.get('SELECT title FROM contract_templates WHERE id = ?', [contract.template_id]);
  const title = template ? template.title : 'Contrato';

  const filePath = path.join(__dirname, 'uploads', contract.pdf_filename);
  if (!fs.existsSync(filePath)) throw new Error('Arquivo PDF não encontrado no disco');

  const { resolveRemoteJidForPhone } = require('./reminder_service');
  let targetJid = contract.remote_jid;
  if (!targetJid && contract.client_phone) {
    targetJid = resolveRemoteJidForPhone(workspaceId, contract.client_phone);
  }

  if (!targetJid) throw new Error('Não foi possível identificar o WhatsApp do cliente para envio');

  const { sendMessage } = require('./whatsapp');
  const msgText = `Olá, ${contract.client_name.split(' ')[0]}! Segue em anexo o seu documento contratual confeccionado:`;
  await sendMessage(workspaceId, targetJid, msgText, null);

  const pdfFile = {
    path: filePath,
    mimetype: 'application/pdf',
    originalname: `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.pdf`,
    filename: contract.pdf_filename
  };
  await sendMessage(workspaceId, targetJid, '', pdfFile);

  await database.run("UPDATE contracts SET status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [contractId]);
  return { success: true };
}

module.exports = {
  interpolateContent,
  generateContractPdf,
  startContractCollection,
  handleInboundContractAnswer,
  sendContractViaWhatsapp
};
