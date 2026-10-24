// File: backend/phone_utils.js
/**
 * Utilitários Universais de Normalização de Telefones e JIDs do WhatsApp.
 * Suporta Tailândia (+66), Brasil (+55), EUA (+1), Portugal (+351), Reino Unido (+44)
 * e qualquer DDI internacional de acordo com o padrão E.164.
 */

/**
 * Normaliza qualquer formato de telefone para padrão internacional E.164 e JID do WhatsApp.
 * @param {string} rawPhone - Telefone bruto (ex: '+1 415 555 2671', '351912345678', '0812345678', '(11) 99999-9999')
 * @param {string} defaultDdi - DDI padrão do Workspace (padrão '55' ou '66')
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

  // 1. Se já é um JID oficial completo do WhatsApp (@s.whatsapp.net)
  // Preserva exatamente os dígitos do JID sem prepender DDI local
  if (raw.endsWith('@s.whatsapp.net')) {
    const digitsOnly = raw.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    let ddiDetected = digitsOnly.startsWith('1') ? '1' : (digitsOnly.startsWith('55') ? '55' : (digitsOnly.startsWith('66') ? '66' : digitsOnly.slice(0, 3)));
    return {
      e164: `+${digitsOnly}`,
      jid: `${digitsOnly}@s.whatsapp.net`,
      ddi: ddiDetected,
      cleanDigits: digitsOnly
    };
  }

  const hasPlus = raw.startsWith('+') || raw.startsWith('00');
  let digits = raw.replace(/^00/, '').replace(/\D/g, '');
  if (!digits) return { e164: '', jid: '', ddi: defaultDdi, cleanDigits: '' };

  // 2. Número informado com '+' ou '00' explícito internacional
  if (hasPlus) {
    if (digits.startsWith('66')) {
      let rest = digits.slice(2);
      if (rest.startsWith('0')) rest = rest.slice(1);
      return {
        e164: `+66${rest}`,
        jid: `66${rest}@s.whatsapp.net`,
        ddi: '66',
        cleanDigits: `66${rest}`
      };
    }
    let ddiDetected = digits.startsWith('1') ? '1' : (digits.startsWith('55') ? '55' : digits.slice(0, 3));
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: ddiDetected,
      cleanDigits: digits
    };
  }

  // 3. Tailândia local com zero de tronco (08x, 09x, 06x)
  if (digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
    const rest = digits.slice(1);
    return {
      e164: `+66${rest}`,
      jid: `66${rest}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${rest}`
    };
  }

  // 4. Já possui DDI 66 (Tailândia com 10 a 12 dígitos)
  if (digits.startsWith('66') && digits.length >= 10 && digits.length <= 12) {
    let rest = digits.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    return {
      e164: `+66${rest}`,
      jid: `66${rest}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${rest}`
    };
  }

  // 5. Já possui DDI 55 (Brasil com 12 ou 13 dígitos)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: '55',
      cleanDigits: digits
    };
  }

  // 6. Celular da Tailândia de 9 dígitos sem zero inicial
  if (digits.length === 9 && ['8', '9', '6'].includes(digits[0]) && defaultDdi === '66') {
    return {
      e164: `+66${digits}`,
      jid: `66${digits}@s.whatsapp.net`,
      ddi: '66',
      cleanDigits: `66${digits}`
    };
  }

  // 7. Número internacional completo sem + (12 a 15 dígitos)
  // Ex: Portugal 351..., Reino Unido 44..., Alemanha 49..., Argentina 54...
  if (digits.length >= 12) {
    let ddiDetected = digits.slice(0, 2);
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: ddiDetected,
      cleanDigits: digits
    };
  }

  // 8. EUA / Canadá sem + (11 dígitos começando com 1)
  const isBrazilAreaCode1x = ['11','12','13','14','15','16','17','18','19'].includes(digits.slice(0, 2)) && digits[2] === '9';
  if (digits.length === 11 && digits.startsWith('1') && !isBrazilAreaCode1x) {
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: '1',
      cleanDigits: digits
    };
  }

  // 9. Espanha sem + (11 dígitos começando com 34)
  if (digits.length === 11 && digits.startsWith('34')) {
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: '34',
      cleanDigits: digits
    };
  }

  // 10. França sem + (11 dígitos começando com 33)
  if (digits.length === 11 && digits.startsWith('33')) {
    return {
      e164: `+${digits}`,
      jid: `${digits}@s.whatsapp.net`,
      ddi: '33',
      cleanDigits: digits
    };
  }

  // 11. Brasil com DDD local (10 ou 11 dígitos, celular com 9 no 3º dígito)
  const isBrazilLocal = (digits.length === 10 || digits.length === 11) && 
    (raw.includes('(') || (defaultDdi === '55' && (digits.length === 10 || digits[2] === '9')));
  if (isBrazilLocal) {
    return {
      e164: `+55${digits}`,
      jid: `55${digits}@s.whatsapp.net`,
      ddi: '55',
      cleanDigits: `55${digits}`
    };
  }

  // 12. Fallback para números locais curtos (8, 9 ou 10 dígitos)
  if (defaultDdi && digits.length <= 10) {
    let rest = digits;
    if (defaultDdi === '66' && rest.startsWith('0')) rest = rest.slice(1);
    return {
      e164: `+${defaultDdi}${rest}`,
      jid: `${defaultDdi}${rest}@s.whatsapp.net`,
      ddi: defaultDdi,
      cleanDigits: `${defaultDdi}${rest}`
    };
  }

  // 13. Fallback universal
  return {
    e164: `+${digits}`,
    jid: `${digits}@s.whatsapp.net`,
    ddi: '',
    cleanDigits: digits
  };
}

/**
 * Retorna os candidatos a JID para teste no WhatsApp (suporta resolução do 9º dígito do Brasil e prefixos internacionais).
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
  } else if (digits.startsWith('54')) {
    // Argentina: números de celular no WhatsApp exigem o 9 após o DDI 54 (ex: 54 9 11 ...)
    if (!digits.startsWith('549')) {
      candidates.push(`549${digits.slice(2)}@s.whatsapp.net`);
      candidates.push(`${digits}@s.whatsapp.net`);
    } else {
      candidates.push(`${digits}@s.whatsapp.net`);
      candidates.push(`54${digits.slice(3)}@s.whatsapp.net`);
    }
  } else if (digits.startsWith('52')) {
    // México: celulares podem ter 1 após 52 (521...)
    if (digits.startsWith('521')) {
      candidates.push(`${digits}@s.whatsapp.net`);
      candidates.push(`52${digits.slice(3)}@s.whatsapp.net`);
    } else {
      candidates.push(`521${digits.slice(2)}@s.whatsapp.net`);
      candidates.push(`${digits}@s.whatsapp.net`);
    }
  } else if (digits.startsWith('66')) {
    // Tailândia: 66 + 9 dígitos
    let rest = digits.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    candidates.push(`66${rest}@s.whatsapp.net`);
  } else {
    // Qualquer outro país internacional (EUA +1, Portugal +351, Reino Unido +44, Alemanha +49, Espanha +34, etc.)
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

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return normalized.e164 || rawPhone;
}

module.exports = {
  normalizePhone,
  getWhatsAppCandidates,
  formatDisplayPhone
};
