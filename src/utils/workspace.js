// File: src/utils/workspace.js
/**
 * Utilitário central para recuperação do Workspace e Usuário logado.
 * Garante que cada conta acesse exclusivamente seus próprios dados (WhatsApp, Telegram, E-mails, Contratos, etc.)
 */

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('unne_user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Erro ao ler usuário do localStorage:', err);
    return null;
  }
}

export function getWorkspaceId() {
  const user = getCurrentUser();
  if (user && user.workspace_id) {
    const id = Number(user.workspace_id);
    if (!isNaN(id) && id > 0) return id;
  }
  return 1;
}

export function getScopedStorageKey(baseKey, workspaceId) {
  const wsId = workspaceId || getWorkspaceId();
  return `${baseKey}_ws_${wsId}`;
}
