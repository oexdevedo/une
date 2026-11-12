// File: backend/quota_service.js
/**
 * Serviço central de controle de cotas de mensagens e validação de bloqueio de contas.
 * Garante que usuários bloqueados ou que ultrapassaram o teto estipulado pelo Administrador
 * não consigam disparar mensagens (seja no chat individual, massivo ou via robô).
 */
const db = require('./db');

async function getWorkspaceMessageStats(workspaceId) {
  const wsId = Number(workspaceId) || 1;
  const database = await db.getDB();

  const ws = await database.get(
    'SELECT id, name, message_limit, is_blocked FROM workspaces WHERE id = ?',
    [wsId]
  );
  const user = await database.get(
    'SELECT id, name, username, email, message_limit, is_blocked, status FROM users WHERE workspace_id = ? ORDER BY id ASC LIMIT 1',
    [wsId]
  );

  const sentRow = await database.get(
    'SELECT count(*) as sent_count FROM messages WHERE workspace_id = ? AND from_me = 1',
    [wsId]
  );
  const sentCount = Number(sentRow?.sent_count || 0);

  // O limite estipulado pelo Admin (prevalece o maior entre workspace ou user, ou user se configurado)
  const wsLimit = Number(ws?.message_limit || 0);
  const userLimit = Number(user?.message_limit || 0);
  const limit = userLimit > 0 ? userLimit : wsLimit;

  const isBlocked = Boolean(
    (ws && ws.is_blocked === 1) ||
    (user && (user.is_blocked === 1 || user.status === 'blocked'))
  );

  const isLimitReached = Boolean(limit > 0 && sentCount >= limit);

  return {
    workspaceId: wsId,
    workspaceName: ws?.name || `Espaço #${wsId}`,
    userName: user?.name || 'Usuário',
    sentCount,
    limit, // 0 = ilimitado
    isUnlimited: limit === 0,
    remaining: limit > 0 ? Math.max(0, limit - sentCount) : null,
    isBlocked,
    isLimitReached
  };
}

async function checkMessageQuota(workspaceId) {
  const stats = await getWorkspaceMessageStats(workspaceId);
  if (stats.isBlocked) {
    throw new Error('Sua conta está bloqueada pelo administrador do sistema. Envios de mensagens desativados.');
  }
  if (stats.isLimitReached) {
    throw new Error(`Limite de mensagens da sua conta atingido (${stats.sentCount}/${stats.limit}). Entre em contato com o administrador para expandir sua cota.`);
  }
  return stats;
}

module.exports = {
  getWorkspaceMessageStats,
  checkMessageQuota
};
