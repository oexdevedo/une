const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { Agent } = require('undici');

const fetchDispatcher = new Agent({
  headersTimeout: 180000,
  bodyTimeout: 180000,
  connectTimeout: 45000
});

function getPhoneNumberFromJid(jid, workspaceId = 1) {
  if (!jid) return '';
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.replace('@s.whatsapp.net', '');
  }
  if (jid.endsWith('@telegram')) {
    return jid.replace('@telegram', '');
  }
  if (jid.endsWith('@lid')) {
    const lid = jid.replace('@lid', '');
    const authDir = path.join(__dirname, `auth_info_baileys_${workspaceId}`);
    const mappingFile = path.join(authDir, `lid-mapping-${lid}_reverse.json`);
    try {
      if (fs.existsSync(mappingFile)) {
        const content = fs.readFileSync(mappingFile, 'utf8');
        const phone = JSON.parse(content);
        if (phone) return String(phone);
      }
    } catch (e) {}
    return lid;
  }
  return jid.split('@')[0];
}

async function processMessage(workspaceId, msgObj, agentId) {
  const { sendMessage } = require('./whatsapp');
  try {
    const database = await db.getDB();
    
    // 1. Fetch AI Settings
    let settings = await database.get('SELECT ai_provider, ai_api_key, ai_base_url, ai_model FROM workspaces WHERE id = ?', [workspaceId]);
    if (!settings) {
      settings = {};
    }
    
    // Inject fallbacks from .env if empty
    const provider = settings.ai_provider || process.env.AI_PROVIDER || 'openai';
    const apiKey = settings.ai_api_key || process.env.AI_API_KEY;
    const baseUrl = settings.ai_base_url || process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const aiModel = settings.ai_model || process.env.AI_MODEL || 'gpt-3.5-turbo';

    if (!apiKey) {
      console.log('AI Provider not configured or missing API key.');
      return;
    }
    // 2. Fetch Agent or Automation Settings
    let systemPrompt = '';
    let responderName = '';

    if (String(agentId).startsWith('auto_')) {
      const autoId = String(agentId).replace('auto_', '');
      const automation = await database.get('SELECT * FROM automations WHERE id = ?', [autoId]);
      responderName = automation ? automation.name : 'Automação';
      const promptInstruction = (automation && automation.porteiro_prompt)
        ? automation.porteiro_prompt
        : 'Você é um assistente virtual atencioso e inteligente.';
      systemPrompt = `${promptInstruction}\n\n[Instruções de Formato: Responda como um atendente humano no WhatsApp. Seja muito conciso, amigável e direto ao ponto (máximo 2 a 3 frases curtas). NUNCA envie blocos de código, JSON, ou "textão". Simule uma conversa natural.]`;
    } else {
      const agent = await database.get('SELECT * FROM agents WHERE id = ?', [agentId]);
      if (!agent) {
        // Fallback: check automations by ID
        const automation = await database.get('SELECT * FROM automations WHERE id = ?', [agentId]);
        if (automation) {
          responderName = automation.name;
          const promptInstruction = automation.porteiro_prompt || 'Você é um assistente virtual atencioso e inteligente.';
          systemPrompt = `${promptInstruction}\n\n[Instruções de Formato: Responda como um atendente humano no WhatsApp. Seja muito conciso, amigável e direto ao ponto (máximo 2 a 3 frases curtas). NUNCA envie blocos de código, JSON, ou "textão". Simule uma conversa natural.]`;
        } else {
          console.log(`Neither Agent nor Automation found for ID: ${agentId}`);
          return;
        }
      } else {
        responderName = agent.name;
        if (agent.prompt && agent.prompt.trim()) {
          systemPrompt = `${agent.prompt.trim()}\n\n[Instruções de Formato: Responda como o agente ${agent.name} no WhatsApp. Seja muito conciso, amigável e direto ao ponto (máximo 2 a 3 frases curtas). NUNCA envie blocos de código, JSON ou respostas excessivamente longas. Simule uma conversa natural humana.]`;
        } else {
          systemPrompt = `Você é o agente ${agent.name}. Responda como um atendente humano. Seja muito conciso, amigável e direto ao ponto (máximo 2 a 3 frases curtas). NUNCA envie blocos de código, JSON, ou "textão". Simule uma conversa natural.`;
        }
      }
    }
    // For a real app, you would compile the prompt from the agent's characteristics.

    // 3. Fetch past conversation context (last 5 messages)
    const contextMessages = await database.all(
      'SELECT from_me, text FROM messages WHERE workspace_id = ? AND remote_jid = ? ORDER BY timestamp DESC LIMIT 5',
      [workspaceId, msgObj.from]
    );
    contextMessages.reverse(); // chronological

    // 3.5 Consulta em Tempo Real ao Cal.com (Disponibilidade e 5 horários)
    try {
      const calendarService = require('./calendar_service');
      const calData = await calendarService.getCalAvailability(workspaceId, msgObj.text || '', contextMessages);
      if (calData && calData.promptContext) {
        systemPrompt += calData.promptContext;
      }
    } catch (calErr) {
      console.error('Erro ao consultar Cal.com no ai_handler:', calErr);
    }

    const messagesPayload = [
      { role: 'system', content: systemPrompt },
      ...contextMessages.map(m => ({
        role: m.from_me ? 'assistant' : 'user',
        content: m.text || '(mídia)'
      }))
    ];

    let replyText = '';

    // 4. Call AI API
    if (provider === 'openai' || provider === 'custom') {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages: messagesPayload
        })
      });
      
      const data = await response.json();
      if (data.choices && data.choices[0]) {
        replyText = data.choices[0].message.content;
      } else {
        console.error('AI API Error:', data);
      }
    } else if (provider === 'anythingllm') {
      // Anything LLM native workspace chat API
      const safeMessage = `[INSTRUÇÕES DO AGENTE E SISTEMA]:\n${systemPrompt}\n\n[MENSAGEM DO CLIENTE]:\n${msgObj.text || ''}`;
      const response = await fetch(`${baseUrl}/workspace/${aiModel}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        dispatcher: fetchDispatcher,
        body: JSON.stringify({
          message: safeMessage,
          mode: 'chat'
        })
      });
      
      const data = await response.json();
      if (data.textResponse) {
        replyText = data.textResponse;
        // Strip out any markdown code blocks just in case
        replyText = replyText.replace(/```[\s\S]*?```/g, '').trim();
      } else {
        console.error('Anything LLM API Error:', data);
      }
    } else if (provider === 'gemini') {
      // Gemini implementation via REST API
      const geminiMessages = messagesPayload.map(m => {
        if (m.role === 'system') return null; // System handled differently in Gemini REST or combined
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        };
      }).filter(Boolean);

      // Add system prompt as a part of the first message for simplicity
      if (geminiMessages.length > 0 && geminiMessages[0].role === 'user') {
        geminiMessages[0].parts[0].text = `[System Instructions: ${systemPrompt}]\n\n` + geminiMessages[0].parts[0].text;
      }
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiMessages })
      });
      
      const data = await response.json();
      if (data.candidates && data.candidates[0]) {
        replyText = data.candidates[0].content.parts[0].text;
      } else {
        console.error('Gemini API Error:', data);
      }
    } else {
      console.log('Provider not fully supported yet:', settings.ai_provider);
    }

    // 5. Send message back
    if (replyText) {
      console.log(`🤖 Responder [${responderName}] responding to ${msgObj.from}`);
      
      // Process RESERVAR_CALENDARIO tag if present
      const bookingTagMatch = replyText.match(/\[RESERVAR_CALENDARIO:\s*(\{.*?\})\]/i);
      if (bookingTagMatch) {
        try {
          const bookingData = JSON.parse(bookingTagMatch[1]);
          const calendarService = require('./calendar_service');
          const clientPhone = getPhoneNumberFromJid(msgObj.from, workspaceId);
          
          console.log('🎯 Tag [RESERVAR_CALENDARIO] detectada! Executando reserva no Cal.com...', bookingData);
          
          calendarService.createCalBooking(workspaceId, {
            slotText: bookingData.horario,
            name: bookingData.nome || msgObj.pushName,
            notes: bookingData.motivo || 'Mentoria agendada via WhatsApp',
            phone: clientPhone,
            email: bookingData.email
          }).catch(err => console.error('Erro assíncrono ao criar reserva no Cal.com:', err));
        } catch (e) {
          console.error('Erro ao processar tag RESERVAR_CALENDARIO:', e);
        }
        replyText = replyText.replace(/\[RESERVAR_CALENDARIO:\s*\{.*?\}\]/gi, '').trim();
      }

      // Atualiza o status em reminder_logs se for relacionado a confirmação de presença/remarcação
      try {
        if (bookingTagMatch) {
          await database.run(
            "UPDATE reminder_logs SET status = 'rescheduled' WHERE workspace_id = ? AND remote_jid = ? AND status = 'sent'",
            [workspaceId, msgObj.from]
          );
          console.log(`🔄 Status atualizado para 'rescheduled' em reminder_logs para ${msgObj.from}`);
        } else if (/presença (?:está|foi) confirmada|confirmad[oa] com sucesso|confirmamos sua presença|sua presença está garantida/i.test(replyText)) {
          await database.run(
            "UPDATE reminder_logs SET status = 'confirmed' WHERE workspace_id = ? AND remote_jid = ? AND status = 'sent'",
            [workspaceId, msgObj.from]
          );
          console.log(`✅ Status atualizado para 'confirmed' em reminder_logs para ${msgObj.from}`);
        } else if (/cancelad[oa]|cancelamento confirmado/i.test(replyText)) {
          await database.run(
            "UPDATE reminder_logs SET status = 'cancelled' WHERE workspace_id = ? AND remote_jid = ? AND status = 'sent'",
            [workspaceId, msgObj.from]
          );
          console.log(`❌ Status atualizado para 'cancelled' em reminder_logs para ${msgObj.from}`);
        }
      } catch (logErr) {
        console.error('Erro ao atualizar status em reminder_logs:', logErr);
      }

      // Strip out any cal.com link or mentions of external scheduling links
      replyText = replyText.replace(/https?:\/\/(?:www\.)?cal\.com[^\s)\]]*/gi, '').trim();
      replyText = replyText.replace(/(?:você também pode agendar diretamente aqui|você também pode agendar por aqui|ou agende diretamente aqui|link direto de agendamento):?\s*/gi, '').trim();
      
      console.log(`🤖 Texto gerado após limpeza:\n"${replyText}"`);
      
      // Clean up markdown bold/italics for WhatsApp and remove extra whitespace
      let cleanedText = replyText.replace(/\*\*/g, '*').trim();
      
      const lines = cleanedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let balloons = [];
      let currentBalloon = [];
      let currentLinesCount = 0;
      
      for (const line of lines) {
        const estimatedLines = Math.max(1, Math.ceil(line.length / 50));
        const isListItem = /^\d+[\s.-]/.test(line);
        const prevWasListItem = currentBalloon.length > 0 && /^\d+[\s.-]/.test(currentBalloon[currentBalloon.length - 1]);
        
        // Break balloon if over limit, unless we are currently inside a numbered list
        if (currentBalloon.length > 0 && (currentLinesCount + estimatedLines > 4) && !(isListItem && prevWasListItem)) {
          balloons.push(currentBalloon.join('\n'));
          currentBalloon = [];
          currentLinesCount = 0;
        }
        
        currentBalloon.push(line);
        currentLinesCount += estimatedLines;
      }
      
      if (currentBalloon.length > 0) {
        balloons.push(currentBalloon.join('\n'));
      }

      // Send each balloon with a small delay to simulate typing/reading and keep order
      for (const text of balloons) {
        if (msgObj.from && msgObj.from.endsWith('@telegram')) {
          const telegramApi = require('./telegram');
          await telegramApi.sendMessage(workspaceId, msgObj.from, text, null);
        } else {
          await sendMessage(workspaceId, msgObj.from, text, null);
        }
        await new Promise(resolve => setTimeout(resolve, 1500)); 
      }
    }

  } catch (err) {
    console.error('Error processing AI response:', err);
  }
}

/**
 * Gera uma resposta profissional de IA para e-mails usando o agente especificado
 */
async function generateAgentResponseForEmail({ workspaceId = 1, agentId, emailSubject, emailBody, senderName, senderEmail }) {
  try {
    const database = await db.getDB();
    
    // 1. Fetch AI settings
    let settings = await database.get('SELECT ai_provider, ai_api_key, ai_base_url, ai_model FROM workspaces WHERE id = ?', [workspaceId]);
    if (!settings) settings = {};
    
    const provider = settings.ai_provider || process.env.AI_PROVIDER || 'openai';
    const apiKey = settings.ai_api_key || process.env.AI_API_KEY;
    const baseUrl = settings.ai_base_url || process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const aiModel = settings.ai_model || process.env.AI_MODEL || 'gpt-3.5-turbo';

    if (!apiKey) {
      console.log('AI Provider not configured or missing API key.');
      return null;
    }

    // 2. Fetch Agent instructions
    let agent = null;
    if (agentId) {
      agent = await database.get('SELECT * FROM agents WHERE id = ?', [agentId]);
    }
    if (!agent) {
      agent = await database.get('SELECT * FROM agents WHERE workspace_id = ? ORDER BY id ASC LIMIT 1', [workspaceId]);
    }

    const agentName = agent ? agent.name : 'Assistente Virtual';
    const agentRole = agent ? agent.role : 'Atendimento e Suporte';
    const agentPrompt = agent ? agent.prompt : 'Você é um assistente profissional e atencioso.';

    const systemPrompt = `Você é ${agentName}, atuando na área de ${agentRole}.
Instruções e diretrizes gerais:
${agentPrompt}

DIRETRIZES ESPECÍFICAS PARA RESPOSTA POR E-MAIL:
- Responda de forma profissional, polida, clara e objetiva.
- Formate a resposta como um e-mail pronto (iniciando com saudação cordial ao remetente e finalizando com atenciosamente e sua assinatura).
- Não invente informações não fornecidas. Se faltar dados, solicite educadamente.
- Não inclua links de agendamento externos não solicitados.
- Idioma padrão: Português do Brasil.`;

    const userPrompt = `Recebemos o seguinte e-mail:
De: ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}
Assunto: ${emailSubject || '(Sem assunto)'}

Conteúdo da mensagem:
"""
${emailBody || '(Sem conteúdo de texto)'}
"""

Por favor, escreva a resposta completa a este e-mail.`;

    const messagesPayload = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let replyText = '';

    if (provider === 'openai' || provider === 'custom') {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages: messagesPayload
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]) {
        replyText = data.choices[0].message.content;
      }
    } else if (provider === 'anythingllm') {
      const safeMessage = `[INSTRUÇÕES DO AGENTE]:\n${systemPrompt}\n\n[E-MAIL RECEBIDO]:\n${userPrompt}`;
      const response = await fetch(`${baseUrl}/workspace/${aiModel}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        dispatcher: fetchDispatcher,
        body: JSON.stringify({
          message: safeMessage,
          mode: 'chat'
        })
      });
      const data = await response.json();
      if (data.textResponse) {
        replyText = data.textResponse.replace(/```[\s\S]*?```/g, '').trim();
      }
    } else if (provider === 'gemini') {
      const geminiMessages = [
        {
          role: 'user',
          parts: [{ text: `[System Instructions: ${systemPrompt}]\n\n` + userPrompt }]
        }
      ];
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiMessages })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0]) {
        replyText = data.candidates[0].content.parts[0].text;
      }
    }

    if (replyText) {
      replyText = replyText.replace(/https?:\/\/(?:www\.)?cal\.com[^\s)\]]*/gi, '').trim();
    }

    return replyText;
  } catch (err) {
    console.error('Error generating AI response for email:', err);
    return null;
  }
}

module.exports = { processMessage, generateAgentResponseForEmail };

