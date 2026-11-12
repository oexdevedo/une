const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'unne_super_secret_jwt_key_change_in_production_2026';

/**
 * Gera um token JWT assinado para a sessão do usuário
 * @param {object} user 
 * @returns {string} token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      workspace_id: user.workspace_id,
      role: user.role,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Middleware que exige autenticação JWT válida.
 * Injeta `req.user` e `req.workspaceId` vinculados com segurança ao usuário autenticado.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // Suporte a token via query parameter (útil para links diretos de download ou SSE)
  if (!token && req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acesso negado: Token de autenticação obrigatório.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const database = await db.getDB();
    const user = await database.get(
      'SELECT id, workspace_id, role, name, username, email, is_blocked, status, message_limit FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Sessão inválida: Usuário não encontrado no sistema.' });
    }

    // Se o usuário foi bloqueado pelo Admin, rejeita a requisição imediatamente
    if (user.is_blocked === 1 || user.status === 'blocked') {
      return res.status(403).json({
        success: false,
        error: 'Sua conta foi suspensa/bloqueada pelo administrador do sistema. Entre em contato com o suporte.'
      });
    }

    req.user = user;
    req.workspaceId = user.workspace_id; // Forçado a partir da identidade real no banco de dados
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token expirado ou inválido.' });
  }
}

/**
 * Middleware que restringe o acesso a Administradores/Owners autenticados
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Não autenticado.' });
  }
  const role = (req.user.role || '').toLowerCase().trim();
  const isAdmin = ['admin', 'owner', 'master', 'administrador'].includes(role);
  if (!isAdmin) {
    return res.status(403).json({ success: false, error: 'Acesso restrito a administradores.' });
  }
  next();
}

/**
 * Middleware opcional de autenticação: se o token existir, injeta `req.user` e `req.workspaceId`.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token && req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const database = await db.getDB();
    const user = await database.get(
      'SELECT id, workspace_id, role, name, username, email FROM users WHERE id = ?',
      [decoded.id]
    );
    if (user) {
      req.user = user;
      req.workspaceId = user.workspace_id;
    }
  } catch (err) {
    // Ignora erro em autenticação opcional
  }
  next();
}

module.exports = {
  JWT_SECRET,
  generateToken,
  requireAuth,
  requireAdmin,
  optionalAuth
};
