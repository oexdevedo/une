// File: backend/phone_utils.js
/**
 * Utilitários Universais de Normalização de Telefones e JIDs do WhatsApp.
 * Suporta Tailândia (+66), Brasil (+55), EUA (+1) e qualquer DDI internacional.
 */

/**
 * Normaliza qualquer formato de telefone para padrão internacional E.164 e JID do WhatsApp.
 * @param {string} rawPhone - Telefone bruto (ex: '0812345678', '+66 81 234 5678', '(11) 99999-9999')
 * @param {string} defaultDdi - DDI padrão do Workspace (padrão '66' para Tailândia)
 * @returns {{ e164: string, jid: string, ddi: string, cleanDigits: string }}
 */
function normalizePhone(rawPhone, defaultDdi = '66') {
  if (!rawPhone) return { e164: '', jid: '', ddi: defaultDdi, cleanDigits: '' };

  let raw = String(rawPhone).trim();

  // Tratamento de JIDs especiais
  if (raw.endsWith('@lid')) {
    return { e164: raw, jid: raw, ddi: '', cleanDigits: raw.replace('@lid', '') };
  }
  if (raw.endsWith('@telegram')) {
    return { e164: raw, jid: raw, ddi: '', cleanDigits: raw.replace('@telegram', '') };
  }
  if (raw.endsWith('@s.whatsapp.net')) {
    raw = raw.replace('@s.whatsapp.net', '');
  }

  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return { e164: '', jid: '', ddi: defaultDdi, cleanDigits: '' };

  // 1. Número informado com '+' explícito internacional
  if (hasPlus) {
    // Se for Tailândia (+66):
    if (digits.startsWith('66')) {
      let rest = digits.slice(2);
      // Se tiver zero de tronco (+660812345678), remove o 0
      if (rest.startsWith('0')) rest = rest.slice(1);
      return {
        e164: `+66${rest}`,
        jid: `66${rest}@s.whatsapp.net`,
        ddi: '66',
        cleanDigits: `66${rest}`
      };
    }
    // Outros países com +
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: digits.slice(0, 2),
      cleanDigits: digits
    };
  }

  // 2. Número sem '+' mas que já começa com DDI 66 (Tailândia)
  if (digits.startsWith('66') && (digits.length === 11 || digits.length === 12 || digits.length === 10)) {
    let rest = digits.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    return {
      e164: `+66${rest}`,
      jid: `66${rest}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${rest}`
    };
  }

  // 3. Número sem '+' mas que já começa com DDI 55 (Brasil com 12 ou 13 dígitos)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: '55',
      cleanDigits: digits
    };
  }

  // 4. Formato local da Tailândia:
  // Celulares: 08x, 09x, 06x (10 dígitos começando com 0)
  // Fixos: 02x, 03x, 04x, 05x, 07x (9 dígitos começando com 0)
  if (digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
    const rest = digits.slice(1); // remove o 0 de tronco da Tailândia
    return {
      e164: `+66${rest}`,
      jid: `66${rest}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${rest}`
    };
  }

  // 5. Celular da Tailândia informado com 9 dígitos iniciando em 8, 9 ou 6 (sem o 0 inicial)
  if (digits.length === 9 && ['8', '9', '6'].includes(digits.charAt(0)) && (defaultDdi === '66' || !defaultDdi)) {
    return {
      e164: `+66${digits}`,
      jid: `66${digits}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${digits}`
    };
  }

  // 6. Formato do Brasil:
  // Se veio formatado como (11) 99999-9999 ou se defaultDdi === '55'
  const isBrazilPattern = (digits.length === 10 || digits.length === 11) && 
    (raw.includes('(') || defaultDdi === '55' || (['1','2','3','4','5','6','7','8','9'].includes(digits.charAt(0)) && digits.charAt(2) === '9'));
  if (isBrazilPattern && defaultDdi === '55') {
    return {
      e164: `+55${digits}`,
      jid: `55${digits}@s.whatsapp.net`,
      ddi: '55',
      cleanDigits: `55${digits}`
    };
  }
  if (raw.includes('(') && (digits.length === 10 || digits.length === 11)) {
    return {
      e164: `+55${digits}`,
      jid: `55${digits}@s.whatsapp.net`,
      ddi: '55',
      cleanDigits: `55${digits}`
    };
  }

  // 7. Se defaultDdi for '66' (Tailândia) e não caiu nos casos acima
  if (defaultDdi === '66') {
    let rest = digits;
    if (rest.startsWith('0')) rest = rest.slice(1);
    return {
      e164: `+66${rest}`,
      jid: `66${rest}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${rest}`
    };
  }

  // 8. Se defaultDdi estiver configurado para outro país (ex: 55, 1, 351, etc.)
  if (defaultDdi && !digits.startsWith(defaultDdi)) {
    return {
      e164: `+${defaultDdi}${digits}`,
      jid: `${defaultDdi}${digits}@s.whatsapp.net`,
      ddi: defaultDdi,
      cleanDigits: `${defaultDdi}${digits}`
    };
  }

  // 9. Fallback universal
  return {
    e164: `+${digits}`,
    jid: `${digits}@s.whatsapp.net`,
    ddi: '',
    cleanDigits: digits
  };
}

/**
 * Retorna os candidatos a JID para teste no WhatsApp (suporta resolução do 9º dígito do Brasil).
 */
function getWhatsAppCandidates(rawPhone, defaultDdi = '66') {
  const normalized = normalizePhone(rawPhone, defaultDdi);
  if (normalized.jid.endsWith('@lid') || normalized.jid.endsWith('@telegram')) {
    return { primaryJid: normalized.jid, candidates: [normalized.jid], ddi: '' };
  }

  const digits = normalized.cleanDigits;
  const candidates = [];

  // Se for Brasil (DDI 55), prepara com 9 e sem 9
  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);

    if (rest.length === 8) {
      candidates.push(`55${ddd}9${rest}@s.whatsapp.net`);
      candidates.push(`55${ddd}${rest}@s.whatsapp.net`);
    } else if (rest.length === 9) {
      candidates.push(`55${ddd}${rest}@s.whatsapp.net`);
      if (rest.startsWith('9')) {
        candidates.push(`55${ddd}${rest.slice(1)}@s.whatsapp.net`);
      }
    } else {
      candidates.push(`${digits}@s.whatsapp.net`);
    }
  } else if (digits.startsWith('66')) {
    // Tailândia: 66 + 9 dígitos (ex: 66812345678)
    candidates.push(`66${digits.slice(2)}@s.whatsapp.net`);
  } else {
    candidates.push(`${digits}@s.whatsapp.net`);
  }

  return {
    primaryJid: candidates[0] || normalized.jid,
    candidates,
    ddi: normalized.ddi
  };
}

/**
 * Formata um número para exibição legível de acordo com o país.
 */
function formatDisplayPhone(rawPhone, defaultDdi = '66') {
  const normalized = normalizePhone(rawPhone, defaultDdi);
  const digits = normalized.cleanDigits;

  if (digits.startsWith('66')) {
    const rest = digits.slice(2);
    if (rest.length === 9) {
      // +66 81 234 5678
      return `+66 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
    }
    return `+66 ${rest}`;
  }

  if (digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 (${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
    } else if (rest.length === 8) {
      return `+55 (${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+55 (${ddd}) ${rest}`;
  }

  return normalized.e164 || rawPhone;
}

module.exports = {
  normalizePhone,
  getWhatsAppCandidates,
  formatDisplayPhone
};
