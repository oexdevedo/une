import * as XLSX from 'xlsx';

export const parsePhone = (val) => {
  const raw = String(val || '').trim();
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
};

/**
 * Interpreta linhas de CSV/planilha com 1, 2 ou 3+ colunas, em qualquer ordem.
 * - Telefone: última coluna sem letras com 8+ dígitos
 * - Nome: primeira coluna que contém letras (senão "Contato N")
 * - Colunas extras (ID etc.) são ignoradas
 */
export const parseContactLines = (lines) => {
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /(nome|name|phone|telefone|contato|celular|whatsapp)/i.test(line)) continue;
    const parts = line.split(/[;,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));

    let phone = '';
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j];
      if (!/[a-zA-ZÀ-ÿ]/.test(p) && p.replace(/\D/g, '').length >= 8) {
        phone = parsePhone(p);
        break;
      }
    }
    if (!phone || phone.replace(/\D/g, '').length < 8) continue;

    const name = parts.find(p => /[a-zA-ZÀ-ÿ]/.test(p)) || '';
    result.push({ name: name || 'Contato ' + (i + 1), phone });
  }
  return result;
};

// Converte o resultado do FileReader (texto CSV ou ArrayBuffer de Excel) em linhas separadas por ';'
export const resultToText = (result) => {
  if (typeof result === 'string') return result;
  const wb = XLSX.read(result, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(sheet, { FS: ';', blankrows: false });
};

