const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
if (!process.env.AWS_ACCESS_KEY_ID && fs.existsSync(path.resolve(__dirname, '../.env'))) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const db = require('./db');
const { connectToWhatsApp, getMessages, sendMessage, getProfilePicUrl } = require('./whatsapp');
const { connectToTelegram } = require('./telegram');
const aiHandler = require('./ai_handler');
const { DB_PATH, UPLOADS_DIR } = require('./storage');
const { normalizePhone, formatDisplayPhone } = require('./phone_utils');
const { generateToken, requireAuth, requireAdmin, optionalAuth, JWT_SECRET } = require('./auth_middleware');

const app = express();

// Upload seguro com restrição de tamanho e filtro de extensões perigosas (SEC-09)
const upload = multer({
  dest: UPLOADS_DIR,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25 MB máximo por arquivo
  },
  fileFilter: (req, file, cb) => {
    const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.py', '.js', '.vbs', '.msi', '.com'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (blockedExtensions.includes(ext)) {
      return cb(new Error('Tipo de arquivo não permitido por motivos de segurança.'));
    }
    cb(null, true);
  }
});

// Storage para o Cofre de Arquivos (preserva nome seguro e extensão legível no disco)
const filesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const cleanBase = path.basename(file.originalname || 'arquivo', ext)
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .slice(0, 60);
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    cb(null, `${unique}_${cleanBase}${ext}`);
  }
});

const filesUpload = multer({
  storage: filesStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB máximo por arquivo (ideal para e-books, vídeos, fotos em alta resolução)
  },
  fileFilter: (req, file, cb) => {
    const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.py', '.js', '.vbs', '.msi', '.com'];
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (blockedExtensions.includes(ext)) {
      return cb(new Error('Tipo de arquivo não permitido por motivos de segurança.'));
    }
    cb(null, true);
  }
});

function detectFileCategory(originalName, mimeType) {
  const ext = path.extname(originalName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  const lowerName = (originalName || '').toLowerCase();

  // 1. Fotos & Imagens
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.heic'];
  if (imageExts.includes(ext) || mime.startsWith('image/')) {
    return 'fotos';
  }

  // 2. E-books & Livros
  const ebookExts = ['.epub', '.mobi', '.azw', '.azw3', '.fb2', '.ibooks', '.cbr', '.cbz'];
  if (ebookExts.includes(ext) || mime.includes('epub') || mime.includes('mobi')) {
    return 'ebooks';
  }
  if (ext === '.pdf' && (
    lowerName.includes('ebook') || lowerName.includes('e-book') || 
    lowerName.includes('livro') || lowerName.includes('guia') || 
    lowerName.includes('manual') || lowerName.includes('apostila')
  )) {
    return 'ebooks';
  }

  // 3. Documentos
  const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp'];
  if (docExts.includes(ext) || mime.startsWith('text/') || mime.includes('pdf') || mime.includes('officedocument') || mime.includes('msword') || mime.includes('excel')) {
    return 'documentos';
  }

  // 4. Áudio & Vídeo
  const mediaExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.mp4', '.mov', '.avi', '.mkv', '.webm'];
  if (mediaExts.includes(ext) || mime.startsWith('audio/') || mime.startsWith('video/')) {
    return 'midias';
  }

  return 'outros';
}

const PORT = process.env.PORT || 3001;

// Confiar no proxy reverso (EasyPanel / Nginx / Traefik) para IP real e HTTPS
app.set('trust proxy', 1);

// 1. Headers de segurança HTTP (SEC-10)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 2. CORS com origens controladas e suporte automático ao domínio próprio / EasyPanel (SEC-10)
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://banco-unne.ipeetd.easypanel.host'
];
const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : [];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  // Arquivos estáticos do frontend (/assets/*, /vite.svg, etc.) ou requisições sem Origin sempre liberados
  if (!origin || process.env.NODE_ENV !== 'production' || !req.path.startsWith('/api')) {
    return callback(null, { origin: true, credentials: true });
  }

  let isSameHost = false;
  try {
    const originUrl = new URL(origin);
    const reqHost = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (reqHost && (originUrl.host === reqHost || originUrl.hostname === reqHost.split(':')[0])) {
      isSameHost = true;
    }
    if (originUrl.hostname.endsWith('.easypanel.host')) {
      isSameHost = true;
    }
  } catch (_) {}

  if (isSameHost || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true, credentials: true });
  }
  return callback(null, { origin: false });
}));

// 3. Rate Limiters contra força bruta e flooding (SEC-10)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas requisições. Tente novamente mais tarde.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas tentativas de login ou cadastro. Aguarde 15 minutos.' }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos de uploads com proteção nosniff (SEC-09)
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// Aplicação de Rate Limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Gateway de Autenticação Geral para /api (SEC-01)
// Libera apenas rotas públicas essenciais; exige JWT nas demais.
app.use('/api', (req, res, next) => {
  const publicPaths = ['/health', '/auth/login', '/auth/register', '/auth/forgot-password'];
  if (publicPaths.includes(req.path) || req.path.startsWith('/users/check-username/') || req.path.startsWith('/avatar/')) {
    return next();
  }
  return requireAuth(req, res, next);
});

// Rota de Teste (Healthcheck)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API rodando perfeitamente!' });
});

// Helper de verificação de Super Admin (acesso global ao sistema)
function isSuperAdmin(user) {
  if (!user) return false;
  const r = (user.role || '').toLowerCase().trim();
  const u = (user.username || '').toLowerCase().trim().replace(/^@+/, '');
  return r === 'admin' || r === 'master' || r === 'administrador' || u === 'admin' || user.id === 1 || (r === 'owner' && Number(user.workspace_id) === 1);
}

// Helper para validação de privilégios de Administrador (sem bypass de header forjado - SEC-01)
async function isRequestAdmin(req) {
  if (req.user) {
    const r = (req.user.role || '').toLowerCase().trim();
    return ['admin', 'owner', 'master', 'administrador'].includes(r);
  }
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token && req.query?.token) token = String(req.query.token).trim();
  if (!token) return false;

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, JWT_SECRET);
    const database = await db.getDB();
    const user = await database.get('SELECT id, workspace_id, role, name, username, email FROM users WHERE id = ?', [decoded.id]);
    if (!user) return false;
    req.user = user;
    req.workspaceId = user.workspace_id;
    const r = (user.role || '').toLowerCase().trim();
    return ['admin', 'owner', 'master', 'administrador'].includes(r);
  } catch (e) {
    return false;
  }
}

// Helper para resolução segura do Workspace do usuário autenticado (Prevenção BOLA / IDOR - SEC-03)
function getEffectiveWorkspaceId(req) {
  if (req.user) {
    if (isSuperAdmin(req.user)) {
      const explicitWs = Number(req.query?.workspace_id || req.body?.workspace_id || req.params?.id);
      if (!isNaN(explicitWs) && explicitWs > 0) return explicitWs;
    }
    return req.user.workspace_id || 1;
  }
  const fallback = Number(req.query?.workspace_id || req.body?.workspace_id || req.params?.id);
  return (!isNaN(fallback) && fallback > 0) ? fallback : 1;
}

// Helper para validar permissão de acesso ao Workspace específico
function canAccessWorkspace(req, targetWorkspaceId) {
  if (!req.user) return false;
  if (isSuperAdmin(req.user)) return true;
  return Number(targetWorkspaceId) === Number(req.user.workspace_id);
}

// Helper para detecção de hosts privados / SSRF (SEC-07)
function isPrivateOrReservedHost(hostname) {
  if (!hostname) return true;
  const clean = String(hostname).toLowerCase().trim();
  if (clean === 'localhost' || clean === '::1' || clean === '0.0.0.0') return true;
  const parts = clean.split('.');
  if (parts.length === 4 && parts.every(p => !isNaN(p) && Number(p) >= 0 && Number(p) <= 255)) {
    const [a, b] = [Number(parts[0]), Number(parts[1])];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // Link-local e AWS/cloud metadata (169.254.169.254)
    if (a === 0) return true;
  }
  return false;
}


// Middleware de proteção de Acesso por Workspace (Prevenção BOLA / IDOR - SEC-03)
app.use('/api/workspaces/:id', (req, res, next) => {
  if (!canAccessWorkspace(req, req.params.id)) {
    return res.status(403).json({ success: false, error: 'Acesso negado: Você não possui permissão para acessar este workspace.' });
  }
  next();
});

// Endpoint de Workspace Settings
app.get('/api/workspaces/:id/settings', async (req, res) => {
  try {
    const database = await db.getDB();
    let row = await database.get('SELECT allow_stories, allow_ephemeral, allow_groups, ai_provider, ai_api_key, ai_base_url, ai_model, default_country, default_ddi FROM workspaces WHERE id = ?', [req.params.id]);
    
    const isAdmin = await isRequestAdmin(req);

    if (row) {
      if (isAdmin) {
        if (row.ai_api_key) row.ai_api_key = '•••••••••••••';
      } else {
        // Usuário não é admin: oculta chaves e configurações de IA
        row.ai_api_key = '';
        row.ai_base_url = '';
        row.ai_model = '';
      }
    }

    res.json(row || { 
      allow_stories: 1, 
      allow_ephemeral: 1, 
      allow_groups: 1, 
      ai_provider: isAdmin ? 'openai' : '', 
      ai_api_key: '', 
      ai_base_url: '', 
      ai_model: '',
      default_country: 'TH',
      default_ddi: '66'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

app.post('/api/workspaces/:id/settings', async (req, res) => {
  try {
    const { 
      allow_stories, 
      allow_ephemeral, 
      allow_groups, 
      ai_provider, 
      ai_api_key, 
      ai_base_url, 
      ai_model,
      default_country,
      default_ddi
    } = req.body;
    const database = await db.getDB();

    const isAdmin = await isRequestAdmin(req);

    // Se usuário não-admin tentar alterar configurações de IA, rejeita
    if (!isAdmin && (ai_api_key || ai_base_url || ai_model || (ai_provider && ai_provider !== 'openai'))) {
      return res.status(403).json({ error: 'Acesso negado: Configurações de IA são restritas a administradores.' });
    }

    let updateQuery = 'UPDATE workspaces SET allow_stories = ?, allow_ephemeral = ?, allow_groups = ?, default_country = ?, default_ddi = ?';
    let queryParams = [
      allow_stories ? 1 : 0, 
      allow_ephemeral ? 1 : 0, 
      allow_groups ? 1 : 0,
      default_country || 'TH',
      default_ddi || '66'
    ];

    if (isAdmin) {
      if (ai_base_url && ai_provider !== 'bedrock') {
        try {
          const parsed = new URL(ai_base_url);
          if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateOrReservedHost(parsed.hostname)) {
            return res.status(400).json({ error: 'URL do provedor de IA não permitida (endereço de rede interna ou reservado bloqueado).' });
          }
        } catch (e) {
          return res.status(400).json({ error: 'URL do provedor de IA inválida.' });
        }
      } else if (ai_base_url && ai_provider === 'bedrock' && (ai_base_url.startsWith('http://') || ai_base_url.startsWith('https://'))) {
        try {
          const parsed = new URL(ai_base_url);
          if (isPrivateOrReservedHost(parsed.hostname)) {
            return res.status(400).json({ error: 'URL do endpoint Bedrock não permitida (rede interna bloqueada).' });
          }
        } catch (e) {
          return res.status(400).json({ error: 'URL do endpoint Bedrock inválida.' });
        }
      }

      updateQuery += ', ai_provider = ?, ai_base_url = ?, ai_model = ?';
      queryParams.push(ai_provider || 'openai', ai_base_url || '', ai_model || '');

      if (ai_api_key && ai_api_key !== '•••••••••••••') {
        updateQuery += ', ai_api_key = ?';
        queryParams.push(ai_api_key);
      }
    }

    updateQuery += ' WHERE id = ?';
    queryParams.push(req.params.id);

    await database.run(updateQuery, queryParams);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

app.post('/api/workspaces/:id/ai/test', async (req, res) => {
  try {
    const isAdmin = await isRequestAdmin(req);
    if (!isAdmin) {
      return res.status(403).json({ success: false, error: 'Acesso negado: Apenas administradores podem testar o provedor de IA.' });
    }

    const { ai_provider, ai_api_key, ai_base_url, ai_model } = req.body;

    // Proteção contra SSRF e varredura de rede interna (SEC-07)
    if (ai_base_url && ai_provider !== 'bedrock') {
      try {
        const parsed = new URL(ai_base_url);
        if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateOrReservedHost(parsed.hostname)) {
          return res.status(400).json({ success: false, error: 'URL do provedor de IA não permitida (endereço de rede interna ou reservado bloqueado).' });
        }
      } catch (e) {
        return res.status(400).json({ success: false, error: 'URL do provedor de IA inválida.' });
      }
    } else if (ai_base_url && ai_provider === 'bedrock' && (ai_base_url.startsWith('http://') || ai_base_url.startsWith('https://'))) {
      try {
        const parsed = new URL(ai_base_url);
        if (isPrivateOrReservedHost(parsed.hostname)) {
          return res.status(400).json({ success: false, error: 'URL do endpoint Bedrock não permitida (rede interna bloqueada).' });
        }
      } catch (e) {
        return res.status(400).json({ success: false, error: 'URL do endpoint Bedrock inválida.' });
      }
    }

    const result = await aiHandler.testAiConnection({
      workspaceId: req.params.id,
      provider: ai_provider,
      apiKey: ai_api_key,
      baseUrl: ai_base_url,
      model: ai_model
    });
    res.json(result);
  } catch (error) {
    console.error('Erro ao testar IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// APIs para atribuição de Agentes a Chats
app.get('/api/workspaces/:id/chat_assignments', async (req, res) => {
  try {
    const database = await db.getDB();
    const rows = await database.all('SELECT remote_jid, agent_id FROM chat_assignments WHERE workspace_id = ?', [req.params.id]);
    const assignments = {};
    rows.forEach(r => assignments[r.remote_jid] = r.agent_id);
    res.json(assignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar atribuições' });
  }
});

app.post('/api/workspaces/:id/chat_assignments', async (req, res) => {
  try {
    const { remote_jid, agent_id } = req.body;
    const database = await db.getDB();
    if (!agent_id || agent_id === 'none') {
      await database.run('DELETE FROM chat_assignments WHERE workspace_id = ? AND remote_jid = ?', [req.params.id, remote_jid]);
    } else {
      await database.run(
        'INSERT OR REPLACE INTO chat_assignments (workspace_id, remote_jid, agent_id) VALUES (?, ?, ?)',
        [req.params.id, remote_jid, agent_id]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar atribuição' });
  }
});

// APIs para configuração Global de Auto-Resposta (Responder todos os chats ou não)
app.get('/api/workspaces/:id/auto_respond', async (req, res) => {
  try {
    const database = await db.getDB();
    const row = await database.get('SELECT auto_respond_all, auto_respond_type, auto_respond_target_id FROM workspaces WHERE id = ?', [req.params.id]);
    res.json(row || { auto_respond_all: 0, auto_respond_type: 'agent', auto_respond_target_id: 'none' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações de auto-resposta' });
  }
});

app.post('/api/workspaces/:id/auto_respond', async (req, res) => {
  try {
    const { auto_respond_all, auto_respond_type, auto_respond_target_id } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE workspaces SET auto_respond_all = ?, auto_respond_type = ?, auto_respond_target_id = ? WHERE id = ?',
      [auto_respond_all ? 1 : 0, auto_respond_type || 'agent', auto_respond_target_id || 'none', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configuração de auto-resposta' });
  }
});

// APIs para Automações
app.get('/api/automations', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM automations WHERE workspace_id = ? ORDER BY id ASC', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar automações' });
  }
});

app.post('/api/automations', async (req, res) => {
  try {
    const { name, mode, porteiro_prompt, agents_json, nodes_json } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO automations (workspace_id, name, mode, porteiro_prompt, agents_json, nodes_json) VALUES (?, ?, ?, ?, ?, ?)',
      [workspaceId, name || 'Nova Automação', mode || 'orchestra', porteiro_prompt || '', agents_json || '[]', nodes_json || '[]']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar automação' });
  }
});

app.put('/api/automations/:id', async (req, res) => {
  try {
    const { name, mode, porteiro_prompt, agents_json, nodes_json } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE automations SET name = ?, mode = ?, porteiro_prompt = ?, agents_json = ?, nodes_json = ? WHERE id = ?',
      [name, mode || 'orchestra', porteiro_prompt || '', agents_json || '[]', nodes_json || '[]', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar automação' });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM automations WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar automação' });
  }
});

// APIs para Templates de Mensagens
app.get('/api/templates', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM templates WHERE workspace_id = ? ORDER BY id DESC', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

app.post('/api/templates', async (req, res) => {
  try {
    const { title, content } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO templates (workspace_id, title, content) VALUES (?, ?, ?)',
      [workspaceId, title || 'Novo Template', content || '']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const { title, content } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE templates SET title = ?, content = ? WHERE id = ?',
      [title, content || '', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar template' });
  }
});

app.delete('/api/templates/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar template' });
  }
});

// ==========================================
// COFRE DE ARQUIVOS (DOCUMENTOS, FOTOS, E-BOOKS)
// ==========================================

// 1. Listar arquivos com filtros de categoria, pasta e busca
app.get('/api/files', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const { category, folder, search } = req.query;

    let query = 'SELECT * FROM stored_files WHERE workspace_id = ?';
    const params = [workspaceId];

    if (category && category !== 'all' && category !== 'todos') {
      query += ' AND category = ?';
      params.push(category);
    }

    if (folder && folder !== 'all' && folder !== 'todas') {
      query += ' AND folder = ?';
      params.push(folder);
    }

    if (search && search.trim()) {
      query += ' AND (name LIKE ? OR original_name LIKE ? OR description LIKE ? OR extension LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY id DESC';
    const rows = await database.all(query, params);

    // Sumários para métricas do dashboard de arquivos
    const allFiles = await database.all('SELECT category, folder, size_bytes FROM stored_files WHERE workspace_id = ?', [workspaceId]);

    let totalSize = 0;
    const catCounts = {
      todos: allFiles.length,
      documentos: 0,
      fotos: 0,
      ebooks: 0,
      midias: 0,
      outros: 0
    };
    const folderSet = new Set(['Raiz']);

    for (const f of allFiles) {
      totalSize += Number(f.size_bytes || 0);
      const cat = f.category || 'outros';
      if (catCounts[cat] !== undefined) {
        catCounts[cat]++;
      } else {
        catCounts.outros++;
      }
      if (f.folder && f.folder.trim()) {
        folderSet.add(f.folder.trim());
      }
    }

    const files = rows.map(r => ({
      ...r,
      url: `/uploads/${r.filename}`
    }));

    res.json({
      success: true,
      files,
      summary: {
        total_files: allFiles.length,
        total_size_bytes: totalSize,
        categories: catCounts,
        folders: Array.from(folderSet).sort()
      }
    });
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar lista de arquivos.' });
  }
});

// 2. Upload de novos arquivos (suporta múltiplos arquivos simultâneos)
app.post('/api/files/upload', (req, res, next) => {
  filesUpload.array('files', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Erro no upload de arquivos.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const uploaded = req.files || [];
    if (uploaded.length === 0 && req.file) {
      uploaded.push(req.file);
    }

    if (uploaded.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    }

    const requestedFolder = (req.body.folder || 'Raiz').trim() || 'Raiz';
    const explicitCat = (req.body.category || '').trim();
    const description = (req.body.description || '').trim();
    const userId = req.user?.id || null;

    const insertedFiles = [];

    for (const f of uploaded) {
      const ext = path.extname(f.originalname || '').toLowerCase();
      const detectedCat = explicitCat && explicitCat !== 'auto' ? explicitCat : detectFileCategory(f.originalname, f.mimetype);
      const displayName = req.body.name && uploaded.length === 1 ? req.body.name.trim() : f.originalname;

      const result = await database.run(
        `INSERT INTO stored_files 
          (workspace_id, user_id, name, filename, original_name, mime_type, extension, category, folder, size_bytes, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workspaceId,
          userId,
          displayName,
          f.filename,
          f.originalname,
          f.mimetype,
          ext,
          detectedCat,
          requestedFolder,
          f.size || 0,
          description || null
        ]
      );

      insertedFiles.push({
        id: result.lastID,
        workspace_id: workspaceId,
        name: displayName,
        filename: f.filename,
        original_name: f.originalname,
        mime_type: f.mimetype,
        extension: ext,
        category: detectedCat,
        folder: requestedFolder,
        size_bytes: f.size || 0,
        description: description || null,
        url: `/uploads/${f.filename}`
      });
    }

    res.json({
      success: true,
      message: `${insertedFiles.length} arquivo(s) armazenado(s) com sucesso.`,
      files: insertedFiles
    });
  } catch (error) {
    console.error('Erro ao salvar arquivos:', error);
    res.status(500).json({ success: false, error: 'Falha ao salvar arquivos no banco de dados.' });
  }
});

// 3. Atualizar dados de um arquivo (nome, pasta, categoria, descrição)
app.put('/api/files/:id', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const fileId = req.params.id;
    const { name, folder, category, description } = req.body;

    const file = await database.get('SELECT * FROM stored_files WHERE id = ? AND workspace_id = ?', [fileId, workspaceId]);
    if (!file) {
      return res.status(404).json({ success: false, error: 'Arquivo não encontrado.' });
    }

    const updatedName = name ? name.trim() : file.name;
    const updatedFolder = folder ? folder.trim() : (file.folder || 'Raiz');
    const updatedCat = category ? category.trim() : file.category;
    const updatedDesc = description !== undefined ? description : file.description;

    await database.run(
      `UPDATE stored_files 
       SET name = ?, folder = ?, category = ?, description = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND workspace_id = ?`,
      [updatedName, updatedFolder, updatedCat, updatedDesc, fileId, workspaceId]
    );

    const updatedFile = await database.get('SELECT * FROM stored_files WHERE id = ?', [fileId]);
    res.json({
      success: true,
      file: {
        ...updatedFile,
        url: `/uploads/${updatedFile.filename}`
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar arquivo:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar dados do arquivo.' });
  }
});

// 4. Deletar arquivo do banco e remover do disco
app.delete('/api/files/:id', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const fileId = req.params.id;

    const file = await database.get('SELECT * FROM stored_files WHERE id = ? AND workspace_id = ?', [fileId, workspaceId]);
    if (!file) {
      return res.status(404).json({ success: false, error: 'Arquivo não encontrado.' });
    }

    await database.run('DELETE FROM stored_files WHERE id = ? AND workspace_id = ?', [fileId, workspaceId]);

    // Remove arquivo físico se existir no disco
    try {
      const diskPath = path.join(UPLOADS_DIR, file.filename);
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    } catch (fsErr) {
      console.warn('Aviso ao remover arquivo físico do disco:', fsErr.message);
    }

    res.json({ success: true, message: 'Arquivo excluído com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir arquivo.' });
  }
});

// APIs para Eventos Manuais da Agenda
app.get('/api/calendar/events', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY id DESC', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar eventos do calendário' });
  }
});

app.post('/api/calendar/events', async (req, res) => {
  try {
    const { title, date, time, type } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO calendar_events (workspace_id, title, date, time, type) VALUES (?, ?, ?, ?, ?)',
      [workspaceId, title, date, time || '', type || 'event-work']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar evento do calendário' });
  }
});

app.delete('/api/calendar/events/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM calendar_events WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar evento' });
  }
});

// APIs de Confirmação 24h e Lembretes da Agenda
app.get('/api/workspaces/:id/reminders', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const database = await db.getDB();
    const logs = await database.all(
      'SELECT * FROM reminder_logs WHERE workspace_id = ? ORDER BY id DESC LIMIT 50',
      [workspaceId]
    );
    const reminderService = require('./reminder_service');
    const upcoming = await reminderService.getUpcomingBookings(workspaceId);
    const ws = await database.get('SELECT confirmation_enabled, confirmation_agent_id FROM workspaces WHERE id = ?', [workspaceId]);
    res.json({ logs, upcoming, settings: ws });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar lembretes de agendamento' });
  }
});

app.post('/api/workspaces/:id/reminders/trigger', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { withinHours, forceSendBookingId } = req.body || {};
    const reminderService = require('./reminder_service');
    const result = await reminderService.checkAndSend24hReminders(workspaceId, { withinHours, forceSendBookingId });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao executar verificação de confirmações' });
  }
});

app.post('/api/workspaces/:id/reminders/settings', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { confirmation_enabled, confirmation_agent_id } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE workspaces SET confirmation_enabled = ?, confirmation_agent_id = ? WHERE id = ?',
      [confirmation_enabled ? 1 : 0, confirmation_agent_id || '3', workspaceId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configurações de confirmação' });
  }
});

app.post('/api/workspaces/:id/reminders/booking-phone', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { bookingId, attendeeName, phone } = req.body;
    const reminderService = require('./reminder_service');
    const result = await reminderService.saveBookingPhone(workspaceId, { bookingId, attendeeName, phone });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao salvar telefone do agendamento' });
  }
});

app.post('/api/workspaces/:id/reminders/mark-confirmed', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { bookingId, clientName, clientPhone, title, date, time } = req.body;
    const reminderService = require('./reminder_service');
    const result = await reminderService.markBookingConfirmed(workspaceId, { bookingId, clientName, clientPhone, title, date, time });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao marcar confirmação' });
  }
});

// ==========================================
// APIs do Agente de Resumo Executivo (Sofia)
// ==========================================
app.get('/api/workspaces/:id/briefing', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const database = await db.getDB();
    const ws = await database.get(
      `SELECT 
        briefing_enabled, briefing_channel, briefing_target_phone, 
        briefing_time, briefing_last_sent, briefing_last_text, telegram_phone 
       FROM workspaces WHERE id = ?`,
      [workspaceId]
    );

    const briefingService = require('./briefing_service');
    const briefingData = await briefingService.getBriefingData(workspaceId);
    const preview = briefingService.buildBriefingText(briefingData);

    res.json({
      settings: ws || {},
      data: briefingData,
      preview
    });
  } catch (error) {
    console.error('[API Briefing] Erro ao obter dados do resumo:', error);
    res.status(500).json({ error: 'Erro ao carregar dados do resumo executivo' });
  }
});

app.post('/api/workspaces/:id/briefing/settings', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { briefing_enabled, briefing_channel, briefing_target_phone, briefing_time } = req.body;
    const database = await db.getDB();
    await database.run(
      `UPDATE workspaces SET 
        briefing_enabled = ?, 
        briefing_channel = ?, 
        briefing_target_phone = ?, 
        briefing_time = ? 
       WHERE id = ?`,
      [
        briefing_enabled ? 1 : 0,
        briefing_channel || 'whatsapp',
        briefing_target_phone || null,
        briefing_time || '08:00',
        workspaceId
      ]
    );
    res.json({ success: true, message: 'Configurações do resumo salvas com sucesso' });
  } catch (error) {
    console.error('[API Briefing] Erro ao salvar configurações:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações do resumo executivo' });
  }
});

app.get('/api/workspaces/:id/briefing/preview', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const briefingService = require('./briefing_service');
    const briefingData = await briefingService.getBriefingData(workspaceId);
    const preview = briefingService.buildBriefingText(briefingData);
    res.json({ data: briefingData, preview });
  } catch (error) {
    console.error('[API Briefing] Erro ao gerar prévia:', error);
    res.status(500).json({ error: 'Erro ao gerar prévia do resumo executivo' });
  }
});

app.post('/api/workspaces/:id/briefing/trigger', async (req, res) => {
  try {
    const workspaceId = req.params.id || 1;
    const { channel, targetPhone } = req.body || {};
    const briefingService = require('./briefing_service');
    const result = await briefingService.sendBriefingNow(workspaceId, { channel, targetPhone });
    res.json({ success: true, result });
  } catch (error) {
    console.error('[API Briefing] Erro ao disparar envio imediato:', error);
    res.status(500).json({ error: error.message || 'Erro ao enviar resumo executivo' });
  }
});

// ==========================================
// APIs de Confecção e Gestão de Contratos
// ==========================================

// 1. Listar Modelos de Contrato
app.get('/api/contracts/templates', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all(
      'SELECT * FROM contract_templates WHERE workspace_id = ? ORDER BY id DESC',
      [workspaceId]
    );
    res.json(rows.map(r => ({
      ...r,
      variables: typeof r.variables === 'string' ? JSON.parse(r.variables || '[]') : r.variables
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar modelos de contrato' });
  }
});

// 2. Criar Modelo de Contrato
app.post('/api/contracts/templates', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const { title, description, content, variables, agent_id } = req.body;
    const database = await db.getDB();
    const result = await database.run(
      `INSERT INTO contract_templates (workspace_id, title, description, content, variables, agent_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        workspaceId,
        title || 'Novo Modelo de Contrato',
        description || '',
        content || '',
        typeof variables === 'string' ? variables : JSON.stringify(variables || []),
        agent_id || '3'
      ]
    );
    res.json({ id: result.lastID, success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar modelo de contrato' });
  }
});

// 3. Atualizar Modelo de Contrato
app.put('/api/contracts/templates/:id', async (req, res) => {
  try {
    const { title, description, content, variables, agent_id } = req.body;
    const database = await db.getDB();
    await database.run(
      `UPDATE contract_templates 
       SET title = ?, description = ?, content = ?, variables = ?, agent_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title,
        description,
        content,
        typeof variables === 'string' ? variables : JSON.stringify(variables || []),
        agent_id || '3',
        req.params.id
      ]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar modelo de contrato' });
  }
});

// 4. Deletar Modelo de Contrato
app.delete('/api/contracts/templates/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM contract_templates WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir modelo de contrato' });
  }
});

// 5. Listar Contratos Confeccionados
app.get('/api/contracts', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all(`
      SELECT c.*, t.title as template_title 
      FROM contracts c
      LEFT JOIN contract_templates t ON t.id = c.template_id
      WHERE c.workspace_id = ?
      ORDER BY c.id DESC
    `, [workspaceId]);

    res.json(rows.map(r => ({
      ...r,
      data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data,
      pdf_url: r.pdf_filename ? `/uploads/${r.pdf_filename}` : null
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar contratos' });
  }
});

// 6. Confeccionar Contrato Manualmente / Gerar PDF
app.post('/api/contracts/generate', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const { templateId, clientName, clientPhone, data } = req.body;
    const database = await db.getDB();
    const template = await database.get('SELECT * FROM contract_templates WHERE id = ?', [templateId]);
    if (!template) return res.status(404).json({ error: 'Modelo de contrato não encontrado' });

    const contractService = require('./contract_service');
    const uploadsDir = UPLOADS_DIR;
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    // Cria registro de contrato
    const result = await database.run(
      `INSERT INTO contracts (workspace_id, template_id, client_name, client_phone, data, status)
       VALUES (?, ?, ?, ?, ?, 'completed')`,
      [workspaceId, templateId, clientName || 'Cliente', clientPhone || '', JSON.stringify(data || {})]
    );
    const contractId = result.lastID;

    const safeClient = (clientName || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFileName = `contrato_${contractId}_${safeClient}.pdf`;
    const outputPath = path.join(uploadsDir, pdfFileName);

    await contractService.generateContractPdf({
      title: template.title,
      content: template.content,
      data: data || {},
      clientName: clientName || 'Cliente',
      outputPath
    });

    await database.run(
      'UPDATE contracts SET pdf_filename = ? WHERE id = ?',
      [pdfFileName, contractId]
    );

    res.json({
      success: true,
      contractId,
      pdfFileName,
      pdfUrl: `/uploads/${pdfFileName}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao gerar contrato' });
  }
});

// 7. Iniciar Coleta com Agente de IA via WhatsApp
app.post('/api/contracts/start-collection', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const { templateId, clientName, clientPhone, remoteJid } = req.body;
    
    let targetJid = remoteJid;
    if (!targetJid && clientPhone) {
      const reminderService = require('./reminder_service');
      targetJid = reminderService.resolveRemoteJidForPhone(workspaceId, clientPhone);
    }

    if (!targetJid) {
      return res.status(400).json({ error: 'Número de WhatsApp ou JID do cliente é obrigatório para iniciar a coleta' });
    }

    const contractService = require('./contract_service');
    const result = await contractService.startContractCollection(workspaceId, {
      templateId,
      clientName,
      clientPhone,
      remoteJid: targetJid
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao iniciar coleta de contrato com a IA' });
  }
});

// 8. Enviar PDF no WhatsApp
app.post('/api/contracts/:id/send-whatsapp', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const contractService = require('./contract_service');
    const result = await contractService.sendContractViaWhatsapp(workspaceId, req.params.id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao enviar contrato no WhatsApp' });
  }
});

// ==================== APIs de E-mails (Hostinger IMAP/SMTP e Agente de IA) ====================
app.get('/api/emails/accounts', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all(`
      SELECT ea.*, a.name as agent_name, a.icon as agent_icon,
        (SELECT COUNT(*) FROM email_messages em WHERE em.account_id = ea.id AND em.folder = 'INBOX' AND em.is_read = 0) as unread_count,
        (SELECT COUNT(*) FROM email_messages em WHERE em.account_id = ea.id) as total_messages
      FROM email_accounts ea
      LEFT JOIN agents a ON a.id = ea.agent_id
      WHERE ea.workspace_id = ?
      ORDER BY ea.id ASC
    `, [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar contas de e-mail' });
  }
});

app.post('/api/emails/accounts', async (req, res) => {
  try {
    const {
      name, email_address, display_name,
      imap_host, imap_port, imap_secure,
      smtp_host, smtp_port, smtp_secure,
      username, password,
      agent_id, auto_reply_enabled
    } = req.body;

    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();

    const result = await database.run(`
      INSERT INTO email_accounts (
        workspace_id, name, email_address, display_name,
        imap_host, imap_port, imap_secure,
        smtp_host, smtp_port, smtp_secure,
        username, password,
        agent_id, auto_reply_enabled, status, status_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', 'Aguardando sincronização')
    `, [
      workspaceId,
      name || 'Hostinger E-mail',
      email_address,
      display_name || name || '',
      imap_host || 'imap.hostinger.com',
      imap_port ? parseInt(imap_port, 10) : 993,
      imap_secure !== undefined ? (imap_secure ? 1 : 0) : 1,
      smtp_host || 'smtp.hostinger.com',
      smtp_port ? parseInt(smtp_port, 10) : 465,
      smtp_secure !== undefined ? (smtp_secure ? 1 : 0) : 1,
      username || email_address,
      password,
      agent_id ? parseInt(agent_id, 10) : null,
      auto_reply_enabled ? 1 : 0
    ]);

    // Tenta sincronizar imediatamente em segundo plano
    const emailService = require('./email_service');
    emailService.syncAccountInbox(result.lastID).catch(err => console.log('Sync inicial:', err.message));

    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao cadastrar conta de e-mail' });
  }
});

app.put('/api/emails/accounts/:id', async (req, res) => {
  try {
    const {
      name, email_address, display_name,
      imap_host, imap_port, imap_secure,
      smtp_host, smtp_port, smtp_secure,
      username, password,
      agent_id, auto_reply_enabled
    } = req.body;

    const database = await db.getDB();
    const existing = await database.get('SELECT * FROM email_accounts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

    await database.run(`
      UPDATE email_accounts SET
        name = ?, email_address = ?, display_name = ?,
        imap_host = ?, imap_port = ?, imap_secure = ?,
        smtp_host = ?, smtp_port = ?, smtp_secure = ?,
        username = ?, password = ?,
        agent_id = ?, auto_reply_enabled = ?
      WHERE id = ?
    `, [
      name || existing.name,
      email_address || existing.email_address,
      display_name !== undefined ? display_name : existing.display_name,
      imap_host || existing.imap_host,
      imap_port ? parseInt(imap_port, 10) : existing.imap_port,
      imap_secure !== undefined ? (imap_secure ? 1 : 0) : existing.imap_secure,
      smtp_host || existing.smtp_host,
      smtp_port ? parseInt(smtp_port, 10) : existing.smtp_port,
      smtp_secure !== undefined ? (smtp_secure ? 1 : 0) : existing.smtp_secure,
      username || existing.username,
      password ? password : existing.password,
      agent_id !== undefined ? (agent_id ? parseInt(agent_id, 10) : null) : existing.agent_id,
      auto_reply_enabled !== undefined ? (auto_reply_enabled ? 1 : 0) : existing.auto_reply_enabled,
      req.params.id
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar conta de e-mail' });
  }
});

app.delete('/api/emails/accounts/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM email_messages WHERE account_id = ?', [req.params.id]);
    await database.run('DELETE FROM email_accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar conta de e-mail' });
  }
});

app.post('/api/emails/accounts/test', async (req, res) => {
  try {
    const emailService = require('./email_service');
    const result = await emailService.testEmailConnection(req.body);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || 'Erro ao testar conexão' });
  }
});

app.post('/api/emails/accounts/:id/sync', async (req, res) => {
  try {
    const emailService = require('./email_service');
    const result = await emailService.syncAccountInbox(req.params.id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao sincronizar mensagens' });
  }
});

app.get('/api/emails/messages', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const accountId = req.query.account_id;
    const folder = req.query.folder || 'INBOX';
    const search = req.query.search || '';

    const database = await db.getDB();

    let query = `
      SELECT em.*, ea.name as account_name, ea.email_address as account_email
      FROM email_messages em
      JOIN email_accounts ea ON ea.id = em.account_id
      WHERE em.workspace_id = ?
    `;
    const params = [workspaceId];

    if (accountId) {
      query += ` AND em.account_id = ?`;
      params.push(accountId);
    }
    if (folder) {
      query += ` AND em.folder = ?`;
      params.push(folder);
    }
    if (search) {
      query += ` AND (em.subject LIKE ? OR em.sender LIKE ? OR em.recipient LIKE ? OR em.snippet LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY em.date DESC, em.id DESC LIMIT 100`;

    const rows = await database.all(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao listar e-mails' });
  }
});

app.get('/api/emails/messages/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    const row = await database.get(`
      SELECT em.*, ea.name as account_name, ea.email_address as account_email, ea.agent_id
      FROM email_messages em
      JOIN email_accounts ea ON ea.id = em.account_id
      WHERE em.id = ?
    `, [req.params.id]);

    if (!row) return res.status(404).json({ error: 'Mensagem não encontrada' });

    // Marca como lida
    if (row.is_read === 0) {
      await database.run('UPDATE email_messages SET is_read = 1 WHERE id = ?', [req.params.id]);
      row.is_read = 1;
    }

    res.json(row);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar mensagem' });
  }
});

app.post('/api/emails/send', async (req, res) => {
  try {
    const { account_id, to, subject, text, html, in_reply_to } = req.body;
    if (!account_id || !to || !subject) {
      return res.status(400).json({ error: 'Conta, destinatário e assunto são obrigatórios' });
    }

    const emailService = require('./email_service');
    const result = await emailService.sendEmail({
      accountId: account_id,
      to,
      subject,
      text: text || '',
      html: html || '',
      inReplyTo: in_reply_to
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao enviar e-mail' });
  }
});

app.post('/api/emails/messages/:id/generate-reply', async (req, res) => {
  try {
    const { agent_id } = req.body;
    const emailService = require('./email_service');
    const result = await emailService.generateDraftReply(req.params.id, agent_id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro ao gerar resposta com IA' });
  }
});

app.patch('/api/emails/messages/:id/read', async (req, res) => {
  try {
    const { is_read } = req.body;
    const database = await db.getDB();
    await database.run('UPDATE email_messages SET is_read = ? WHERE id = ?', [is_read ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar status de leitura' });
  }
});

app.delete('/api/emails/messages/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM email_messages WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar e-mail' });
  }
});

// APIs para Listas e Contatos
app.get('/api/lists', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();

    // Sincroniza e garante a existência da lista automática "Agendados"
    try {
      const reminderService = require('./reminder_service');
      await reminderService.syncAgendaToAgendadosList(workspaceId);
    } catch (syncErr) {
      console.warn('Aviso ao sincronizar lista Agendados:', syncErr.message);
    }

    const rows = await database.all(`
      SELECT l.*, COUNT(c.id) as count,
        CASE WHEN l.name = 'Agendados' THEN 1 ELSE 0 END as is_system
      FROM lists l 
      LEFT JOIN contacts c ON c.list_id = l.id 
      WHERE l.workspace_id = ? 
      GROUP BY l.id
      ORDER BY is_system DESC, l.created_at DESC
    `, [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar listas' });
  }
});

app.post('/api/lists/sync-agenda', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const reminderService = require('./reminder_service');
    const listId = await reminderService.syncAgendaToAgendadosList(workspaceId);
    const database = await db.getDB();
    const countRow = await database.get('SELECT COUNT(id) as count FROM contacts WHERE workspace_id = ? AND list_id = ?', [workspaceId, listId]);
    res.json({ success: true, listId, count: countRow?.count || 0 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao sincronizar lista de agendados' });
  }
});

app.post('/api/lists', async (req, res) => {
  try {
    const { name } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const result = await database.run('INSERT INTO lists (workspace_id, name) VALUES (?, ?)', [workspaceId, name]);
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar lista' });
  }
});

app.delete('/api/lists/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    const list = await database.get('SELECT name FROM lists WHERE id = ?', [req.params.id]);
    if (list && list.name === 'Agendados') {
      return res.status(400).json({ error: 'A lista "Agendados" é uma lista automática de sistema e não pode ser excluída.' });
    }
    await database.run('DELETE FROM contacts WHERE list_id = ?', [req.params.id]);
    await database.run('DELETE FROM lists WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar lista' });
  }
});

app.post('/api/lists/:id/import-channel-contacts', async (req, res) => {
  try {
    const listId = req.params.id;
    const { channel } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const ws = await database.get('SELECT default_ddi FROM workspaces WHERE id = ?', [workspaceId]);
    const defaultDdi = ws?.default_ddi || '66';
    const reminderService = require('./reminder_service');

    let query = '';
    let params = [workspaceId];
    if (channel === 'telegram') {
      query = `SELECT DISTINCT remote_jid, push_name FROM messages WHERE workspace_id = ? AND remote_jid LIKE '%@telegram'`;
    } else {
      query = `SELECT DISTINCT remote_jid, push_name FROM messages 
               WHERE workspace_id = ? 
                 AND remote_jid NOT LIKE '%@telegram'
                 AND remote_jid NOT LIKE '%@newsletter'
                 AND remote_jid NOT LIKE '%@broadcast'`;
    }

    const rows = await database.all(query, params);
    let count = 0;
    for (const row of rows) {
      let phone = '';
      if (channel === 'telegram') {
        phone = row.remote_jid.replace('@telegram', '');
      } else {
        // Usa resolução de LID reversa caso seja um remote_jid @lid
        const resolvedPhone = reminderService.getPhoneNumberFromJid(row.remote_jid, workspaceId);
        if (row.remote_jid.endsWith('@lid') && (!resolvedPhone || resolvedPhone === row.remote_jid.replace('@lid', ''))) {
          // Se for LID puro sem mapeamento reverso, preserva @lid para identificação
          phone = row.remote_jid;
        } else {
          phone = formatDisplayPhone(resolvedPhone || row.remote_jid, defaultDdi);
        }
      }
      if (!phone) continue;

      const name = row.push_name || (channel === 'telegram' ? `Telegram ${phone}` : `Lead ${phone}`);

      const exists = await database.get(
        'SELECT id FROM contacts WHERE workspace_id = ? AND list_id = ? AND (phone = ? OR name = ?)',
        [workspaceId, listId, phone, name]
      );
      if (!exists) {
        await database.run(
          'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
          [workspaceId, listId, name, phone, 'Novo']
        );
        count++;
      }
    }
    res.json({ success: true, count });
  } catch (err) {
    console.error('Erro ao importar contatos do canal:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const listId = req.query.list_id;
    const database = await db.getDB();
    let query = 'SELECT * FROM contacts WHERE workspace_id = ?';
    const params = [workspaceId];
    const listIds = String(listId || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (listIds.length === 1) {
      query += ' AND list_id = ?';
      params.push(listIds[0]);
    } else if (listIds.length > 1) {
      query += ` AND list_id IN (${listIds.map(() => '?').join(',')})`;
      params.push(...listIds);
    }
    query += ' ORDER BY id DESC';
    const rows = await database.all(query, params);

    // Se mais de uma lista foi selecionada, remove contatos duplicados pelo telefone/JID para não enviar duas vezes
    if (listIds.length > 1 && Array.isArray(rows)) {
      const seen = new Set();
      const uniqueRows = [];
      for (const r of rows) {
        const rawKey = String(r.phone || r.remote_jid || '').trim().toLowerCase();
        const dedupKey = rawKey
          ? (rawKey.startsWith('@') || rawKey.includes('@') ? rawKey : rawKey.replace(/\D/g, '') || rawKey)
          : `id_${r.id}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        uniqueRows.push(r);
      }
      return res.json(uniqueRows);
    }

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const { list_id, name, phone, status } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const ws = await database.get('SELECT default_ddi FROM workspaces WHERE id = ?', [workspaceId]);
    const defaultDdi = ws?.default_ddi || '66';

    const normalized = normalizePhone(phone, defaultDdi);
    const phoneToSave = normalized.e164 || phone || '';

    const result = await database.run(
      'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
      [workspaceId, list_id || null, name, phoneToSave, status || 'Novo']
    );
    res.json({ success: true, id: result.lastID, phone: phoneToSave });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar contato' });
  }
});

app.post('/api/contacts/bulk', async (req, res) => {
  try {
    const { list_id, contacts } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Lista de contatos vazia ou inválida' });
    }
    const database = await db.getDB();
    const ws = await database.get('SELECT default_ddi FROM workspaces WHERE id = ?', [workspaceId]);
    const defaultDdi = ws?.default_ddi || '66';

    let inserted = 0;
    await database.run('BEGIN');
    try {
      for (const c of contacts) {
        if (!c.phone && !c.name) continue;
        const normalized = normalizePhone(c.phone, defaultDdi);
        const phoneToSave = normalized.e164 || c.phone || '';

        await database.run(
          'INSERT INTO contacts (workspace_id, list_id, name, phone, status) VALUES (?, ?, ?, ?, ?)',
          [workspaceId, list_id || null, c.name || 'Sem nome', phoneToSave, c.status || 'Novo']
        );
        inserted++;
      }
      await database.run('COMMIT');
    } catch (e) {
      await database.run('ROLLBACK').catch(() => {});
      throw e;
    }
    res.json({ success: true, count: inserted });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao importar contatos em lote' });
  }
});

app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar contato' });
  }
});

app.put('/api/contacts/:id', async (req, res) => {
  try {
    const { name, phone, status } = req.body;
    const database = await db.getDB();
    const workspaceId = getEffectiveWorkspaceId(req);
    const ws = await database.get('SELECT default_ddi FROM workspaces WHERE id = ?', [workspaceId]);
    const defaultDdi = ws?.default_ddi || '66';

    const normalized = normalizePhone(phone, defaultDdi);
    const phoneToSave = normalized.e164 || phone || '';

    await database.run(
      'UPDATE contacts SET name = ?, phone = ?, status = ? WHERE id = ?',
      [name, phoneToSave, status || 'Novo', req.params.id]
    );
    res.json({ success: true, phone: phoneToSave });
  } catch (error) {
    console.error('Erro ao atualizar contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// ==========================================
// AUTENTICAÇÃO E PERFIL COM SUPORTE A @USERNAME
// ==========================================

function validateAndCleanUsername(handle) {
  if (!handle) return { valid: false, error: 'O @ de usuário é obrigatório.' };
  const clean = handle.trim().replace(/^@+/, '').toLowerCase();
  if (clean.length < 2 || clean.length > 30) {
    return { valid: false, error: 'O @ deve conter entre 2 e 30 caracteres.' };
  }
  // Letras, números, sublinhado (_) e ponto (.)
  const regex = /^[a-z0-9_][a-z0-9_.]{0,28}[a-z0-9_]?$/;
  if (!regex.test(clean)) {
    return { valid: false, error: 'O @ deve conter apenas letras, números, underline (_) e ponto (.).' };
  }
  return { valid: true, clean };
}

function normalizeRecoveryTarget(rawTarget) {
  const raw = String(rawTarget || '').trim();
  if (!raw) return '';
  if (raw.startsWith('@') || /[a-zA-Z]/.test(raw)) {
    return '@' + raw.replace(/^@+/, '').replace(/\s+/g, '');
  }
  const normalized = normalizePhone(raw, '55');
  return normalized.e164 || raw;
}

function maskRecoveryTarget(target) {
  const t = String(target || '').trim();
  if (!t) return '';
  if (t.startsWith('@')) {
    const body = t.slice(1);
    if (body.length <= 3) return `@${body[0] || ''}***`;
    return `@${body.slice(0, 3)}***${body.slice(-1)}`;
  }
  const digits = t.replace(/\D/g, '');
  if (digits.length <= 4) return `***${digits}`;
  return `+${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

// Rota de Login (aceita @usuario, usuario ou e-mail)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'Informe seu @usuário ou e-mail e a senha.' });
    }

    const cleanInput = identifier.trim().toLowerCase();
    const cleanHandle = cleanInput.replace(/^@+/, '');

    const database = await db.getDB();
    const user = await database.get(
      `SELECT id, workspace_id, name, username, email, phone, password_hash, role, created_at, is_blocked, status, message_limit 
       FROM users 
       WHERE LOWER(email) = ? OR LOWER(username) = ?`,
      [cleanInput, cleanHandle]
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuário ou e-mail não encontrado.' });
    }

    if (user.is_blocked === 1 || user.status === 'blocked') {
      return res.status(403).json({
        success: false,
        error: 'Sua conta foi suspensa/bloqueada pelo administrador do sistema. Entre em contato com o suporte.'
      });
    }

    // Valida senha (compatível com bcrypt e auto-migração de legados) - SEC-02
    let validPassword = false;
    if (user.password_hash.startsWith('$2a$') || user.password_hash.startsWith('$2b$')) {
      validPassword = await bcrypt.compare(password, user.password_hash);
    } else if (user.password_hash === password || user.password_hash === `plain:${password}`) {
      validPassword = true;
      const newHash = await bcrypt.hash(password, 10);
      await database.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
    }

    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Senha incorreta. Tente novamente.' });
    }

    const displayUsername = user.username ? `@${user.username.replace(/^@+/, '')}` : '';

    const userPayload = {
      id: user.id,
      workspace_id: user.workspace_id,
      name: user.name,
      username: displayUsername,
      email: user.email,
      phone: user.phone || '',
      role: user.role
    };

    const token = generateToken(userPayload);

    res.json({
      success: true,
      token,
      user: userPayload
    });

    // Recupera chaves salvas no banco e conecta WhatsApp, Telegram, Cal.com e Email sempre que logar
    reconnectAllConnections(user.workspace_id || 1).catch(connErr => {
      console.error('⚠️ [Login AutoConnect] Erro ao reconectar contas em segundo plano:', connErr.message);
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao realizar login.' });
  }
});

// Rota de Cadastro de Nova Conta com @ exclusivo
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, username, email, phone, password } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'O Nome Completo é obrigatório.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'O E-mail é obrigatório.' });
    }
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, error: 'Informe seu Telefone ou @Telegram para recuperação de senha.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'A senha deve conter no mínimo 6 caracteres.' });
    }

    const handleCheck = validateAndCleanUsername(username);
    if (!handleCheck.valid) {
      return res.status(400).json({ success: false, error: handleCheck.error });
    }

    const cleanName = name.trim();
    const cleanHandle = handleCheck.clean;
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = normalizeRecoveryTarget(phone);

    const database = await db.getDB();

    // Verifica se @username já existe
    const existingHandle = await database.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanHandle]);
    if (existingHandle) {
      return res.status(400).json({ success: false, error: `O nome de usuário @${cleanHandle} já está em uso. Por favor, escolha outro.` });
    }

    // Verifica se e-mail já existe
    const existingEmail = await database.get('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existingEmail) {
      return res.status(400).json({ success: false, error: 'Este e-mail já está cadastrado no sistema.' });
    }

    // 1. Cria um Workspace exclusivo para esta conta
    const wsName = `Espaço de ${cleanName}`;
    const wsResult = await database.run(
      `INSERT INTO workspaces (name, allow_stories, allow_ephemeral, allow_groups, auto_respond_all, confirmation_enabled)
       VALUES (?, 0, 0, 0, 1, 1)`,
      [wsName]
    );
    const newWorkspaceId = wsResult.lastID;

    // 2. Semeia padrões isolados (Agentes, Templates, Contratos, Lista Agendados) para o novo workspace
    const { seedWorkspaceDefaults } = require('./workspace_seeder');
    await seedWorkspaceDefaults(database, newWorkspaceId, wsName);

    // 3. Hash criptográfico com Bcrypt (SEC-02)
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Cadastra o usuário como proprietário (owner) do seu próprio workspace
    const result = await database.run(
      `INSERT INTO users (workspace_id, name, username, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, 'owner')`,
      [newWorkspaceId, cleanName, cleanHandle, cleanEmail, cleanPhone, passwordHash]
    );

    const userPayload = {
      id: result.lastID,
      workspace_id: newWorkspaceId,
      name: cleanName,
      username: `@${cleanHandle}`,
      email: cleanEmail,
      phone: cleanPhone,
      role: 'owner'
    };

    const token = generateToken(userPayload);

    res.json({
      success: true,
      token,
      user: userPayload
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao cadastrar conta.' });
  }
});

// Rota de Recuperação de Senha via Telegram da Conta do Admin
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || !String(identifier).trim()) {
      return res.status(400).json({ success: false, error: 'Informe seu @usuário ou e-mail cadastrado.' });
    }

    const cleanInput = String(identifier).trim().toLowerCase();
    const cleanHandle = cleanInput.replace(/^@+/, '');

    const database = await db.getDB();
    const user = await database.get(
      `SELECT u.id, u.workspace_id, u.name, u.username, u.email, u.phone,
              w.telegram_phone, w.telegram_username, w.telegram_user_id
       FROM users u
       LEFT JOIN workspaces w ON w.id = u.workspace_id
       WHERE LOWER(u.email) = ? OR LOWER(u.username) = ?`,
      [cleanInput, cleanHandle]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Nenhuma conta encontrada com esse @usuário ou e-mail.' });
    }

    // Define destino do Telegram do usuário (prioriza phone/Telegram do perfil, com fallback para o Telegram conectado no workspace)
    const rawTarget =
      (user.phone && user.phone.trim()) ||
      (user.telegram_phone && user.telegram_phone.trim()) ||
      (user.telegram_username && user.telegram_username.trim() ? `@${user.telegram_username.trim().replace(/^@+/, '')}` : '') ||
      (user.telegram_user_id && String(user.telegram_user_id).trim()) ||
      '';

    if (!rawTarget) {
      return res.status(400).json({
        success: false,
        error: 'Esta conta ainda não possui um Telefone ou @Telegram vinculado para recuperação. Solicite a redefinição ao administrador.'
      });
    }

    const targetTelegram = normalizeRecoveryTarget(rawTarget);

    // Localiza o Workspace do Admin que possui Telegram conectado (prioriza Workspace 1 ou conta admin)
    const adminWs = await database.get(
      `SELECT w.id, w.telegram_session, w.telegram_token
       FROM workspaces w
       LEFT JOIN users u ON u.workspace_id = w.id AND LOWER(u.role) IN ('admin', 'master', 'administrador', 'owner')
       WHERE (w.telegram_session IS NOT NULL AND TRIM(w.telegram_session) != '')
          OR (w.telegram_token IS NOT NULL AND TRIM(w.telegram_token) != '')
       ORDER BY (w.id = 1) DESC, (LOWER(u.role) = 'admin') DESC, w.id ASC
       LIMIT 1`
    );

    if (!adminWs) {
      return res.status(503).json({
        success: false,
        error: 'O Telegram do administrador não está conectado no momento para enviar a senha temporária.'
      });
    }

    // Gera senha temporária de 6 dígitos
    const tempPassword = String(Math.floor(100000 + Math.random() * 900000));
    const displayHandle = user.username ? `@${user.username.replace(/^@+/, '')}` : user.email;
    const msgText =
      `🔐 Recuperação de Senha — Unico\n\n` +
      `Olá, ${user.name || displayHandle}!\n` +
      `Sua senha temporária de acesso para a conta ${displayHandle} é:\n\n` +
      `${tempPassword}\n\n` +
      `Acesse o sistema com esta senha e altere-a em Configurações > Minha Conta.`;

    // Envia pelo Telegram da conta do Admin (prioriza Conta de Usuário MTProto, que aceita telefone e @username)
    const telegramUserApi = require('./telegram_user');
    const telegramBotApi = require('./telegram');
    let sentOk = false;
    let lastSendErr = null;

    if (adminWs.telegram_session && adminWs.telegram_session.trim()) {
      try {
        await telegramUserApi.sendMessage(adminWs.id, targetTelegram, msgText, null, user.name);
        sentOk = true;
      } catch (err) {
        lastSendErr = err;
      }
    }

    if (!sentOk && adminWs.telegram_token && adminWs.telegram_token.trim()) {
      try {
        await telegramBotApi.sendMessage(adminWs.id, `${targetTelegram}@telegram`, msgText, null, user.name);
        sentOk = true;
      } catch (err) {
        lastSendErr = err;
      }
    }

    if (!sentOk) {
      console.error('Erro ao enviar senha temporária pelo Telegram do Admin:', lastSendErr);
      return res.status(502).json({
        success: false,
        error: `Não foi possível entregar a mensagem no Telegram (${maskRecoveryTarget(targetTelegram)}). Verifique se o número/@Telegram está correto e ativo no Telegram.`
      });
    }

    // Atualiza o hash da senha apenas após confirmar o envio no Telegram
    const newHash = await bcrypt.hash(tempPassword, 10);
    await database.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);

    const masked = maskRecoveryTarget(targetTelegram);
    res.json({
      success: true,
      maskedTarget: masked,
      message: `Enviamos uma senha temporária pelo Telegram para ${masked}.`
    });
  } catch (error) {
    console.error('Erro em forgot-password:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao processar a recuperação de senha.' });
  }
});

// Verificação de disponibilidade de @username em tempo real
app.get('/api/users/check-username/:username', async (req, res) => {
  try {
    const handleCheck = validateAndCleanUsername(req.params.username);
    if (!handleCheck.valid) {
      return res.json({ available: false, error: handleCheck.error });
    }

    const database = await db.getDB();
    const existing = await database.get('SELECT id FROM users WHERE LOWER(username) = ?', [handleCheck.clean]);
    if (existing) {
      return res.json({ available: false, error: `O @${handleCheck.clean} já está em uso.` });
    }

    res.json({ available: true, clean: handleCheck.clean, formatted: `@${handleCheck.clean}` });
  } catch (error) {
    console.error('Erro ao verificar username:', error);
    res.status(500).json({ available: false, error: 'Erro ao verificar disponibilidade.' });
  }
});

// API de Resumo Completo do Dashboard (Visão Geral do Sistema)
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();

    // 1. Mensagens e Conversas
    const msgStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END), 0) as sent,
        COALESCE(SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END), 0) as received,
        COUNT(DISTINCT remote_jid) as active_chats
      FROM messages
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentMessages = await database.all(`
      SELECT remote_jid, push_name, text, timestamp, from_me, type
      FROM messages
      WHERE workspace_id = ?
      ORDER BY timestamp DESC
      LIMIT 5
    `, [workspaceId]);

    // 2. Contatos
    const contactStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'Novo' THEN 1 ELSE 0 END), 0) as new_contacts,
        COALESCE(SUM(CASE WHEN status = 'Qualificado' THEN 1 ELSE 0 END), 0) as qualified_contacts
      FROM contacts
      WHERE workspace_id = ?
    `, [workspaceId]);

    const listsCount = await database.get('SELECT COUNT(*) as total FROM lists WHERE workspace_id = ?', [workspaceId]);

    // 3. Agentes de IA
    const agents = await database.all(`
      SELECT id, name, icon, role, created_at
      FROM agents
      WHERE workspace_id = ?
      ORDER BY id ASC
    `, [workspaceId]);

    // 4. Tarefas e Kanban
    const kanbanStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END), 0) as todo,
        COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) as in_progress,
        COALESCE(SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END), 0) as review,
        COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) as done
      FROM kanban_projects
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentKanban = await database.all(`
      SELECT id, title, status, priority, due_date, tag, assignee_name
      FROM kanban_projects
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT 4
    `, [workspaceId]);

    const notesCount = await database.get('SELECT COUNT(*) as total FROM task_notes WHERE workspace_id = ?', [workspaceId]);

    // 5. Contratos
    const contractStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) as draft,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
      FROM contracts
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentContracts = await database.all(`
      SELECT c.id, c.client_name, c.client_phone, c.status, c.created_at, ct.title as template_title
      FROM contracts c
      LEFT JOIN contract_templates ct ON ct.id = c.template_id
      WHERE c.workspace_id = ?
      ORDER BY c.created_at DESC
      LIMIT 4
    `, [workspaceId]);

    // 6. E-mails
    const emailStats = await database.get(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) as unread,
        COALESCE(SUM(CASE WHEN ai_replied = 1 THEN 1 ELSE 0 END), 0) as ai_replied
      FROM email_messages
      WHERE workspace_id = ?
    `, [workspaceId]);

    const emailAccounts = await database.all(`
      SELECT id, name, email_address, status
      FROM email_accounts
      WHERE workspace_id = ?
    `, [workspaceId]);

    const recentEmails = await database.all(`
      SELECT id, sender, sender_name, subject, date, is_read, ai_replied
      FROM email_messages
      WHERE workspace_id = ?
      ORDER BY date DESC
      LIMIT 4
    `, [workspaceId]);

    // 7. Agenda & Calendário
    const calendarStats = await database.get(`
      SELECT COUNT(*) as total
      FROM calendar_events
      WHERE workspace_id = ?
    `, [workspaceId]);

    const upcomingEvents = await database.all(`
      SELECT id, title, date, time, attendee_name
      FROM calendar_events
      WHERE workspace_id = ?
      ORDER BY date ASC, time ASC
      LIMIT 4
    `, [workspaceId]);

    // 8. Conexões Status
    let waStatus = { status: 'disconnected' };
    try {
      const whatsappApi = require('./whatsapp');
      waStatus = whatsappApi.getStatus(workspaceId);
    } catch (e) {}

    const ws = await database.get(`
      SELECT ai_provider, ai_model, telegram_token, cal_link
      FROM workspaces
      WHERE id = ?
    `, [workspaceId]);

    res.json({
      success: true,
      workspace_id: workspaceId,
      messages: {
        total: msgStats?.total || 0,
        sent: msgStats?.sent || 0,
        received: msgStats?.received || 0,
        active_chats: msgStats?.active_chats || 0,
        recent: recentMessages || []
      },
      contacts: {
        total: contactStats?.total || 0,
        new: contactStats?.new_contacts || 0,
        qualified: contactStats?.qualified_contacts || 0,
        lists_total: listsCount?.total || 0
      },
      agents: {
        total: agents?.length || 0,
        list: agents || []
      },
      tasks: {
        total: kanbanStats?.total || 0,
        todo: kanbanStats?.todo || 0,
        in_progress: kanbanStats?.in_progress || 0,
        review: kanbanStats?.review || 0,
        done: kanbanStats?.done || 0,
        notes_total: notesCount?.total || 0,
        recent: recentKanban || []
      },
      contracts: {
        total: contractStats?.total || 0,
        draft: contractStats?.draft || 0,
        active: contractStats?.active || 0,
        completed: contractStats?.completed || 0,
        recent: recentContracts || []
      },
      emails: {
        total: emailStats?.total || 0,
        unread: emailStats?.unread || 0,
        ai_replied: emailStats?.ai_replied || 0,
        accounts: emailAccounts || [],
        recent: recentEmails || []
      },
      calendar: {
        total: calendarStats?.total || 0,
        upcoming: upcomingEvents || []
      },
      connections: {
        whatsapp: waStatus?.status || 'disconnected',
        telegram: ws?.telegram_token ? 'connected' : 'disconnected',
        email: emailAccounts?.some(a => a.status === 'connected') ? 'connected' : 'disconnected',
        ai_provider: ws?.ai_provider || 'openai',
        ai_model: ws?.ai_model || ''
      }
    });
  } catch (error) {
    console.error('Erro ao buscar resumo do dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar dados do dashboard' });
  }
});

// APIs para Usuário / Perfil (SEC-01 & SEC-02)
app.get('/api/users/me', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const database = await db.getDB();
    const user = await database.get(
      `SELECT u.id, u.workspace_id, u.name, u.username, u.email, u.phone, u.role, u.created_at,
              w.telegram_phone, w.telegram_username
       FROM users u
       LEFT JOIN workspaces w ON w.id = u.workspace_id
       WHERE u.id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    user.username = user.username ? `@${user.username.replace(/^@+/, '')}` : '';
    user.phone = user.phone || user.telegram_phone || (user.telegram_username ? `@${user.telegram_username.replace(/^@+/, '')}` : '') || '';
    res.json(user);
  } catch (error) {
    console.error('Erro ao buscar dados do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário' });
  }
});

app.put('/api/users/me', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Usuário não autenticado.' });
    }

    const { name, username, email, phone, password } = req.body;
    const database = await db.getDB();

    const currentUser = await database.get('SELECT id, phone FROM users WHERE id = ?', [userId]);
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const cleanPhone = phone !== undefined ? normalizeRecoveryTarget(phone) : (currentUser.phone || '');

    let cleanHandle = null;
    if (username) {
      const handleCheck = validateAndCleanUsername(username);
      if (!handleCheck.valid) {
        return res.status(400).json({ success: false, error: handleCheck.error });
      }
      cleanHandle = handleCheck.clean;

      // Verifica se outro usuário já usa esse username
      const existing = await database.get(
        'SELECT id FROM users WHERE LOWER(username) = ? AND id != ?',
        [cleanHandle, userId]
      );
      if (existing) {
        return res.status(400).json({ success: false, error: `O @${cleanHandle} já pertence a outra conta.` });
      }
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const existingEmail = await database.get(
        'SELECT id FROM users WHERE LOWER(email) = ? AND id != ?',
        [cleanEmail, userId]
      );
      if (existingEmail) {
        return res.status(400).json({ success: false, error: 'Este e-mail já pertence a outra conta.' });
      }
    }

    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'A senha deve ter no mínimo 6 caracteres.' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await database.run(
        'UPDATE users SET name = ?, username = ?, email = ?, phone = ?, password_hash = ? WHERE id = ?',
        [name, cleanHandle, email, cleanPhone, hashedPassword, userId]
      );
    } else {
      await database.run(
        'UPDATE users SET name = ?, username = ?, email = ?, phone = ? WHERE id = ?',
        [name, cleanHandle, email, cleanPhone, userId]
      );
    }

    res.json({
      success: true,
      user: {
        id: Number(userId),
        name,
        username: cleanHandle ? `@${cleanHandle}` : '',
        email,
        phone: cleanPhone
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar dados do usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar dados do usuário' });
  }
});

// APIs para Backup e Restauração de Banco de Dados (.sqlite) - Restrito a SuperAdmin (SEC-04)
app.get('/api/admin/database/download', async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Acesso negado: Apenas administradores do sistema podem baixar o backup do banco de dados.' });
  }
  const dbPath = DB_PATH;
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'Arquivo de banco de dados não encontrado.' });
  }
  res.download(dbPath, 'database.sqlite');
});

app.post('/api/admin/database/upload', upload.single('database'), async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, error: 'Acesso negado: Apenas administradores do sistema podem restaurar o banco de dados.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
    }

    const uploadedPath = req.file.path;
    const dbPath = DB_PATH;

    // Valida se o arquivo é um SQLite válido checando o header 'SQLite format 3'
    const headerBuffer = Buffer.alloc(16);
    const fd = fs.openSync(uploadedPath, 'r');
    fs.readSync(fd, headerBuffer, 0, 16, 0);
    fs.closeSync(fd);
    const headerStr = headerBuffer.toString('utf8');

    if (!headerStr.startsWith('SQLite format 3')) {
      fs.unlinkSync(uploadedPath);
      return res.status(400).json({ success: false, error: 'O arquivo enviado não é um banco de dados SQLite válido.' });
    }

    // Faz backup de segurança do arquivo atual se existir
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.bak_${Date.now()}`;
      fs.copyFileSync(dbPath, backupPath);
    }

    // Substitui o banco pelo arquivo enviado
    fs.copyFileSync(uploadedPath, dbPath);
    fs.unlinkSync(uploadedPath);

    // Re-executa verificação de tabelas
    const initDbModule = require('./initialize_db');
    await initDbModule.init();

    res.json({ success: true, message: 'Banco de dados restaurado e sincronizado com sucesso!' });
  } catch (error) {
    console.error('Erro ao importar banco de dados:', error);
    res.status(500).json({ success: false, error: 'Erro ao processar importação do banco de dados.' });
  }
});

// ==========================================
// PAINEL DE CONTROLE ADMINISTRATIVO DE USUÁRIOS (ADMIN DASHBOARD)
// ==========================================

// 1. Listar todos os usuários com estatísticas de mensagens, conexões e limites
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador do Sistema.' });
    }

    const database = await db.getDB();

    // 1. Estatísticas globais calculadas diretamente sobre as tabelas do banco SQLite
    const totalUsersRow = await database.get('SELECT COUNT(*) as total FROM users');
    const activeUsersRow = await database.get('SELECT COUNT(*) as total FROM users WHERE COALESCE(is_blocked, 0) = 0');
    const blockedUsersRow = await database.get('SELECT COUNT(*) as total FROM users WHERE is_blocked = 1');
    const totalSentRow = await database.get('SELECT COUNT(*) as total FROM messages WHERE from_me = 1');
    const totalFailedRow = await database.get('SELECT COUNT(*) as total FROM failed_message_logs');
    const totalBannedRow = await database.get('SELECT COUNT(*) as total FROM whatsapp_ban_logs');
    const totalContactsRow = await database.get('SELECT COUNT(*) as total FROM contacts');

    // 2. Busca todos os usuários cadastrados no banco de dados SQLite
    const users = await database.all(`
      SELECT 
        u.id, u.name, u.username, u.email, u.phone, u.role, u.created_at,
        u.workspace_id, u.is_blocked, u.status, u.message_limit,
        w.name as workspace_name
      FROM users u
      LEFT JOIN workspaces w ON w.id = u.workspace_id
      ORDER BY u.id ASC
    `);

    // Busca estatísticas agregadas de mensagens por workspace diretamente da tabela messages
    const msgStats = await database.all(`
      SELECT 
        workspace_id,
        COUNT(*) as total_messages,
        SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) as sent_messages,
        SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) as received_messages
      FROM messages
      GROUP BY workspace_id
    `);
    const statsMap = {};
    for (const s of msgStats) {
      statsMap[s.workspace_id] = {
        total: Number(s.total_messages || 0),
        sent: Number(s.sent_messages || 0),
        received: Number(s.received_messages || 0)
      };
    }

    // Busca contagem de contatos por workspace diretamente da tabela contacts
    const contactStats = await database.all(`
      SELECT workspace_id, COUNT(*) as total_contacts
      FROM contacts
      GROUP BY workspace_id
    `);
    const contactMap = {};
    for (const c of contactStats) {
      contactMap[c.workspace_id] = Number(c.total_contacts || 0);
    }

    // Busca contagem de mensagens perdidas / falhas diretamente da tabela failed_message_logs
    const failLogs = await database.all(`
      SELECT workspace_id, COUNT(*) as fail_count
      FROM failed_message_logs
      GROUP BY workspace_id
    `).catch(() => []);
    const failedMap = {};
    for (const f of failLogs) {
      failedMap[f.workspace_id] = Number(f.fail_count || 0);
    }

    // Busca contagem de WhatsApps bloqueados diretamente da tabela whatsapp_ban_logs
    const banLogs = await database.all(`
      SELECT workspace_id, COUNT(*) as ban_count
      FROM whatsapp_ban_logs
      GROUP BY workspace_id
    `).catch(() => []);
    const banMap = {};
    for (const b of banLogs) {
      banMap[b.workspace_id] = Number(b.ban_count || 0);
    }

    const { getSavedSlots, getStatus } = require('./whatsapp');
    const enrichedUsers = users.map(u => {
      const wsId = u.workspace_id || 1;
      const mStat = statsMap[wsId] || { total: 0, sent: 0, received: 0 };
      const cCount = contactMap[wsId] || 0;
      const waSlots = getSavedSlots(wsId);
      
      const isBlocked = Boolean(u.is_blocked === 1 || u.status === 'blocked');
      const limit = Number(u.message_limit || 0);

      // Bloqueios de WhatsApp registrados no banco SQLite para este workspace
      const totalBansForUser = banMap[wsId] || 0;
      const totalFailsForUser = failedMap[wsId] || 0;

      return {
        id: u.id,
        name: u.name,
        username: u.username ? (u.username.startsWith('@') ? u.username : `@${u.username}`) : '',
        email: u.email,
        phone: u.phone || '',
        role: u.role || 'agent',
        workspace_id: wsId,
        workspace_name: u.workspace_name || `Espaço #${wsId}`,
        created_at: u.created_at,
        is_blocked: isBlocked,
        status: isBlocked ? 'blocked' : 'active',
        message_limit: limit, // 0 = ilimitado
        messages_sent: mStat.sent,
        messages_received: mStat.received,
        messages_total: mStat.total,
        messages_failed: totalFailsForUser,
        banned_whatsapps: totalBansForUser,
        contacts_count: cCount,
        wa_connected_slots: waSlots.length,
        has_wa: waSlots.length > 0
      };
    });

    res.json({
      success: true,
      summary: {
        total_users: Number(totalUsersRow?.total || 0),
        active_users: Number(activeUsersRow?.total || 0),
        blocked_users: Number(blockedUsersRow?.total || 0),
        total_messages_sent: Number(totalSentRow?.total || 0),
        total_failed_messages: Number(totalFailedRow?.total || 0),
        total_banned_whatsapps: Number(totalBannedRow?.total || 0),
        total_contacts: Number(totalContactsRow?.total || 0)
      },
      users: enrichedUsers
    });
  } catch (error) {
    console.error('Erro ao buscar usuários no painel admin:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar lista de usuários.' });
  }
});

// 1.1 Listar histórico de bloqueios de WhatsApp (Meta)
app.get('/api/admin/whatsapp-bans', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
    }
    const database = await db.getDB();
    const rows = await database.all(`
      SELECT b.*, w.name as workspace_name 
      FROM whatsapp_ban_logs b
      LEFT JOIN workspaces w ON w.id = b.workspace_id
      ORDER BY b.id DESC
      LIMIT 100
    `).catch(() => []);
    res.json({ success: true, bans: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1.2 Listar histórico de mensagens perdidas / falhas registradas no banco de dados SQLite
app.get('/api/admin/failed-messages', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador.' });
    }
    const database = await db.getDB();
    const rows = await database.all(`
      SELECT f.*, w.name as workspace_name 
      FROM failed_message_logs f
      LEFT JOIN workspaces w ON w.id = f.workspace_id
      ORDER BY f.id DESC
      LIMIT 100
    `).catch(() => []);
    res.json({ success: true, failures: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Bloquear / Desbloquear Usuário
app.post('/api/admin/users/:id/toggle-block', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador do Sistema.' });
    }

    const userId = Number(req.params.id);
    const database = await db.getDB();
    const user = await database.get('SELECT id, name, role, is_blocked, status, workspace_id FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Você não pode bloquear sua própria conta de administrador.' });
    }

    const currentBlocked = Boolean(user.is_blocked === 1 || user.status === 'blocked');
    const newBlockedState = req.body.is_blocked !== undefined ? Boolean(req.body.is_blocked) : !currentBlocked;
    const newStatus = newBlockedState ? 'blocked' : 'active';
    const newBlockedInt = newBlockedState ? 1 : 0;

    await database.run(
      'UPDATE users SET is_blocked = ?, status = ? WHERE id = ?',
      [newBlockedInt, newStatus, userId]
    );

    if (user.workspace_id) {
      await database.run(
        'UPDATE workspaces SET is_blocked = ? WHERE id = ?',
        [newBlockedInt, user.workspace_id]
      );
    }

    res.json({
      success: true,
      user_id: userId,
      is_blocked: newBlockedState,
      status: newStatus,
      message: newBlockedState ? `Usuário ${user.name} foi bloqueado com sucesso.` : `Usuário ${user.name} foi desbloqueado com sucesso.`
    });
  } catch (error) {
    console.error('Erro ao alternar bloqueio de usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao alterar status de bloqueio.' });
  }
});

// 3. Configurar Limite de Mensagens do Usuário / Workspace
app.post('/api/admin/users/:id/limit', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador do Sistema.' });
    }

    const userId = Number(req.params.id);
    const rawLimit = Number(req.body.message_limit);
    const limit = isNaN(rawLimit) ? 0 : Math.max(0, rawLimit);

    const database = await db.getDB();
    const user = await database.get('SELECT id, name, workspace_id FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    await database.run('UPDATE users SET message_limit = ? WHERE id = ?', [limit, userId]);
    if (user.workspace_id) {
      await database.run('UPDATE workspaces SET message_limit = ? WHERE id = ?', [limit, user.workspace_id]);
    }

    res.json({
      success: true,
      user_id: userId,
      message_limit: limit,
      message: limit > 0 ? `Limite de ${limit} mensagens configurado para ${user.name}.` : `Envios ilimitados liberados para ${user.name}.`
    });
  } catch (error) {
    console.error('Erro ao atualizar limite de mensagens:', error);
    res.status(500).json({ success: false, error: 'Erro ao configurar limite de mensagens.' });
  }
});

// 4. Resetar Conta / Redefinir Senha
app.post('/api/admin/users/:id/reset', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador do Sistema.' });
    }

    const userId = Number(req.params.id);
    const database = await db.getDB();
    const user = await database.get('SELECT id, name, username, email, workspace_id FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const customPass = req.body.new_password ? String(req.body.new_password).trim() : '';
    const tempPassword = customPass || `Unne@${Math.floor(100000 + Math.random() * 900000)}`;
    const newHash = await bcrypt.hash(tempPassword, 10);

    await database.run(
      'UPDATE users SET password_hash = ?, is_blocked = 0, status = "active" WHERE id = ?',
      [newHash, userId]
    );

    // Se solicitado reset de conexões/sessões
    if (req.body.reset_sessions && user.workspace_id) {
      const { clearWhatsAppAuthDir } = require('./storage');
      for (let s = 1; s <= 5; s++) {
        clearWhatsAppAuthDir(user.workspace_id, s);
      }
      try {
        await database.run('DELETE FROM telegram_user_sessions WHERE workspace_id = ?', [user.workspace_id]);
      } catch (_) {}
    }

    res.json({
      success: true,
      user_id: userId,
      user_name: user.name,
      temporary_password: tempPassword,
      message: `Conta de ${user.name} redefinida com sucesso!`
    });
  } catch (error) {
    console.error('Erro ao resetar conta do usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao resetar conta de usuário.' });
  }
});

// 5. Enviar Mensagem Direta no Privado para o Usuário
app.post('/api/admin/users/:id/send-direct-message', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao Administrador do Sistema.' });
    }

    const userId = Number(req.params.id);
    const { channel = 'whatsapp', message, target_phone } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Digite a mensagem a ser enviada.' });
    }

    const database = await db.getDB();
    const user = await database.get('SELECT id, name, phone, email, workspace_id FROM users WHERE id = ?', [userId]);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });
    }

    const recipientPhone = (target_phone || user.phone || '').trim();
    if (!recipientPhone) {
      return res.status(400).json({
        success: false,
        error: `O usuário ${user.name} não possui telefone cadastrado. Forneça o número manualmente no formulário.`
      });
    }

    // O envio é feito a partir do Workspace do Administrador (Workspace 1 ou req.workspaceId)
    const adminWorkspaceId = req.user.workspace_id || 1;
    let sendResult = null;

    if (channel === 'telegram') {
      const telegramUserApi = require('./telegram_user');
      const userStatus = await telegramUserApi.getStatus(adminWorkspaceId);
      if (userStatus && userStatus.connected) {
        sendResult = await telegramUserApi.sendMessage(adminWorkspaceId, recipientPhone, message, null, user.name);
      } else {
        const telegramApi = require('./telegram');
        sendResult = await telegramApi.sendMessage(adminWorkspaceId, recipientPhone, message, null, user.name);
      }
    } else {
      const whatsappApi = require('./whatsapp');
      sendResult = await whatsappApi.sendMessage(adminWorkspaceId, recipientPhone, message, null, user.name, {
        simulateTyping: true
      });
    }

    res.json({
      success: true,
      message: `Mensagem enviada com sucesso para ${user.name} (${recipientPhone})!`,
      result: sendResult
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem direta para usuário:', error);
    res.status(500).json({ success: false, error: error.message || 'Falha ao enviar mensagem privada.' });
  }
});


// APIs para Configuração e Padrão de Calendário
app.get('/api/calendar/settings', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const row = await database.get('SELECT cal_api_key, cal_link FROM workspaces WHERE id = ?', [workspaceId]);
    res.json(row || { cal_api_key: '', cal_link: '' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar configurações do calendário' });
  }
});

app.post('/api/calendar/settings', async (req, res) => {
  try {
    const { cal_api_key, cal_link } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    await database.run(
      'UPDATE workspaces SET cal_api_key = ?, cal_link = ? WHERE id = ?',
      [cal_api_key || '', cal_link || '', workspaceId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar configurações do calendário' });
  }
});

// Endpoint para buscar tags (Simulando Workspace 1 por enquanto)
app.get('/api/tags', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM tags WHERE workspace_id = ?', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar tags' });
  }
});

// APIs de Agentes de IA
app.get('/api/agents', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all('SELECT * FROM agents WHERE workspace_id = ?', [workspaceId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar agentes' });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, icon, prompt, role } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const result = await database.run(
      'INSERT INTO agents (workspace_id, name, icon, prompt, role) VALUES (?, ?, ?, ?, ?)',
      [workspaceId, name, icon || '🤖', prompt || '', role || '']
    );
    res.json({ success: true, id: result.lastID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao salvar agente' });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const { name, icon, prompt, role } = req.body;
    const database = await db.getDB();
    await database.run(
      'UPDATE agents SET name = ?, icon = ?, prompt = ?, role = ? WHERE id = ?',
      [name, icon, prompt || '', role || '', req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar agente' });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM agents WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar agente' });
  }
});

// APIs de Conexão WhatsApp (suporta até 3 linhas por Workspace via slot = 1 | 2 | 3)
app.get('/api/connections/whatsapp', (req, res) => {
  const workspaceId = getEffectiveWorkspaceId(req);
  const slot = req.query.slot ? Number(req.query.slot) : undefined;
  const whatsappApi = require('./whatsapp');
  res.json(whatsappApi.getStatus(workspaceId, slot));
});

app.post('/api/connections/whatsapp/start', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const forceNew = Boolean(req.body.force_new);
    const slot = Number(req.body.slot) || 1;
    const whatsappApi = require('./whatsapp');
    await whatsappApi.connectToWhatsApp(workspaceId, forceNew, slot);
    res.json({ success: true, slot });
  } catch (err) {
    console.error('Erro ao iniciar WhatsApp:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/whatsapp/disconnect', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const slot = Number(req.body.slot) || 1;
    const whatsappApi = require('./whatsapp');
    const result = await whatsappApi.disconnectWhatsApp(workspaceId, slot);
    res.json(result);
  } catch (err) {
    console.error('Erro ao desconectar WhatsApp:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// APIs de Mensagens do WhatsApp
app.get('/api/messages', async (req, res) => {
  const workspaceId = getEffectiveWorkspaceId(req);
  const messages = await getMessages(workspaceId);
  res.json(messages);
});

app.get('/api/contacts/:jid/avatar', async (req, res) => {
  const workspaceId = getEffectiveWorkspaceId(req);
  const jid = req.params.jid;
  const url = await getProfilePicUrl(workspaceId, jid);
  if (url) {
    res.redirect(url);
  } else {
    res.status(404).send('Avatar not found');
  }
});

app.post('/api/messages/send', upload.single('file'), async (req, res) => {
  const { to, text, contact_name, simulate_typing } = req.body;
  const workspaceId = getEffectiveWorkspaceId(req);
  const file = req.file;

  if (!to || (!text && !file)) {
    return res.status(400).json({ success: false, error: 'Destinatário (to) e conteúdo (text ou arquivo) são obrigatórios.' });
  }

  try {
    let result;
    if (to && to.endsWith('@telegram')) {
      const telegramUserApi = require('./telegram_user');
      const userStatus = await telegramUserApi.getStatus(workspaceId);
      if (userStatus && userStatus.connected) {
        result = await telegramUserApi.sendMessage(workspaceId, to, text, file, contact_name);
      } else {
        const telegramApi = require('./telegram');
        result = await telegramApi.sendMessage(workspaceId, to, text, file, contact_name);
      }
    } else {
      const whatsappApi = require('./whatsapp');
      const shouldSimulate = simulate_typing === undefined ? true : (simulate_typing === true || simulate_typing === 'true');
      result = await whatsappApi.sendMessage(workspaceId, to, text, file, contact_name, {
        simulateTyping: shouldSimulate
      });
    }
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// MOTOR DE DISPARO EM MASSA EM SEGUNDO PLANO (PERSISTENTE ENTRE ABAS)
// ==========================================
app.get('/api/mass-dispatch/status', (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const listId = req.query.list_id || '';
    const massDispatcher = require('./mass_dispatcher');
    const data = massDispatcher.getCampaignStatus(workspaceId, listId);
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Erro ao buscar status do disparo em massa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/mass-dispatch/start', upload.single('file'), async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const {
      list_id,
      channel,
      message_text,
      message_templates,
      multi_message_mode,
      resume,
      min_delay,
      max_delay,
      batch_size,
      batch_pause,
      simulate_typing,
      enable_daily_limit,
      daily_safe_limit,
      default_ddi,
      enable_anti_hash,
      enable_opt_out_footer,
      opt_out_footer_text,
      safe_hours_only
    } = req.body;

    let parsedTemplates = [];
    if (Array.isArray(message_templates)) {
      parsedTemplates = message_templates;
    } else if (typeof message_templates === 'string' && message_templates.trim()) {
      try {
        parsedTemplates = JSON.parse(message_templates);
      } catch (e) {
        parsedTemplates = [];
      }
    }

    const massDispatcher = require('./mass_dispatcher');
    const state = await massDispatcher.startCampaign(workspaceId, {
      listId: list_id,
      channel: channel || 'whatsapp',
      messageText: message_text || '',
      messageTemplates: parsedTemplates,
      multiMessageMode: multi_message_mode || 'rotate',
      resume: resume === true || resume === 'true',
      file: req.file || null,
      config: {
        minDelay: Number(min_delay) || 25,
        maxDelay: Number(max_delay) || 50,
        batchSize: Number(batch_size) || 12,
        batchPause: Number(batch_pause) || 120,
        simulateTyping: simulate_typing === undefined ? true : (simulate_typing === true || simulate_typing === 'true'),
        enableDailyLimit: enable_daily_limit === undefined ? true : (enable_daily_limit === true || enable_daily_limit === 'true'),
        dailySafeLimit: Number(daily_safe_limit) || 35,
        defaultDdi: default_ddi || '66',
        enableAntiHash: enable_anti_hash === undefined ? true : (enable_anti_hash === true || enable_anti_hash === 'true'),
        enableOptOutFooter: enable_opt_out_footer === true || enable_opt_out_footer === 'true',
        optOutFooterText: opt_out_footer_text || "Caso não queira mais receber mensagens, responda 'SAIR'.",
        safeHoursOnly: safe_hours_only === true || safe_hours_only === 'true'
      }
    });

    res.json({ success: true, campaign: state });
  } catch (error) {
    console.error('Erro ao iniciar disparo em massa no servidor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/mass-dispatch/pause', (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const { list_id } = req.body;
    const massDispatcher = require('./mass_dispatcher');
    const state = massDispatcher.pauseCampaign(workspaceId, list_id);
    res.json({ success: true, campaign: state });
  } catch (error) {
    console.error('Erro ao pausar disparo em massa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/mass-dispatch/stop', (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const { list_id } = req.body;
    const massDispatcher = require('./mass_dispatcher');
    const state = massDispatcher.stopCampaign(workspaceId, list_id);
    res.json({ success: true, campaign: state });
  } catch (error) {
    console.error('Erro ao parar disparo em massa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/mass-dispatch/reset', (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const { list_id } = req.body;
    const massDispatcher = require('./mass_dispatcher');
    const state = massDispatcher.resetCampaign(workspaceId, list_id);
    res.json({ success: true, campaign: state });
  } catch (error) {
    console.error('Erro ao zerar fila de disparo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/messages/:jid', async (req, res) => {
  const workspaceId = getEffectiveWorkspaceId(req);
  const jid = req.params.jid;
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM messages WHERE workspace_id = ? AND remote_jid = ?', [workspaceId, jid]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar conversa' });
  }
});

app.post('/api/ai/trigger', async (req, res) => {
  const { remote_jid, text, agent_id } = req.body;
  const workspaceId = getEffectiveWorkspaceId(req);
  const aiHandler = require('./ai_handler');
  const msgObj = {
    id: 'trig_' + Date.now(),
    from: remote_jid,
    fromMe: false,
    text: text || 'Olá',
    type: 'text',
    fileUrl: null,
    timestamp: Math.floor(Date.now() / 1000),
    pushName: 'Cliente'
  };
  try {
    await aiHandler.processMessage(workspaceId, msgObj, agent_id || '2');
    res.json({ success: true, message: 'IA processada com sucesso' });
  } catch (err) {
    console.error('Erro ao acionar IA manualmente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// APIs de Conexão Telegram
app.get('/api/connections/telegram', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramApi = require('./telegram');
    const statusData = await telegramApi.getStatus(workspaceId);
    res.json(statusData);
  } catch (err) {
    console.error('Erro ao consultar status do Telegram:', err);
    res.status(500).json({ status: 'disconnected', error: err.message });
  }
});

app.post('/api/connections/telegram/start', async (req, res) => {
  try {
    const { token } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramApi = require('./telegram');
    const result = await telegramApi.connectToTelegram(workspaceId, token);
    res.json(result);
  } catch (err) {
    console.error('Erro ao conectar no Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram/disconnect', async (req, res) => {
  try {
    const { clear_token } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramApi = require('./telegram');
    const result = await telegramApi.disconnectTelegram(workspaceId, Boolean(clear_token));
    res.json(result);
  } catch (err) {
    console.error('Erro ao desconectar Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram/save', async (req, res) => {
  try {
    const { token } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramApi = require('./telegram');
    const result = await telegramApi.saveToken(workspaceId, token);
    res.json(result);
  } catch (err) {
    console.error('Erro ao salvar token do Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// TELEGRAM MTPROTO (CONTA DE USUÁRIO / USERBOT — ATÉ 5 CONTAS POR WORKSPACE)
// ==========================================
app.get('/api/connections/telegram-user', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const slot = req.query.slot ? Number(req.query.slot) : undefined;
    const telegramUser = require('./telegram_user');
    const status = await telegramUser.getStatus(workspaceId, slot);
    res.json(status);
  } catch (err) {
    console.error('Erro ao buscar status do Telegram User:', err);
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.post('/api/connections/telegram-user/send-code', async (req, res) => {
  try {
    const { phone, api_id, api_hash, slot } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const result = await telegramUser.sendCode(workspaceId, phone, api_id, api_hash, slot || 1);
    res.json(result);
  } catch (err) {
    console.error('Erro ao enviar código do Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram-user/sign-in', async (req, res) => {
  try {
    const { code, password, slot } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const result = await telegramUser.signIn(workspaceId, { code, password, slot: slot || 1 });
    res.json(result);
  } catch (err) {
    console.error('Erro ao autenticar no Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram-user/sync-contacts', async (req, res) => {
  try {
    const { slot } = req.body || {};
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const result = await telegramUser.syncContacts(workspaceId, slot || 1);
    res.json(result);
  } catch (err) {
    console.error('Erro ao sincronizar contatos do Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram-user/disconnect', async (req, res) => {
  try {
    const { slot } = req.body || {};
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const result = await telegramUser.disconnectTelegramUser(workspaceId, slot || 1);
    res.json(result);
  } catch (err) {
    console.error('Erro ao desconectar Telegram User:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/telegram-user/start-mass', async (req, res) => {
  try {
    const { list_id, message, delay_min, delay_max } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const result = await telegramUser.startMassDispatch(workspaceId, {
      listId: list_id,
      message,
      delayMin: delay_min,
      delayMax: delay_max
    });
    res.json(result);
  } catch (err) {
    console.error('Erro ao iniciar disparo em massa Telegram:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/connections/telegram-user/mass-status', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const status = telegramUser.getMassDispatchStatus(workspaceId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ isRunning: false, error: err.message });
  }
});

app.post('/api/connections/telegram-user/stop-mass', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const telegramUser = require('./telegram_user');
    const result = telegramUser.stopMassDispatch(workspaceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connections/reconnect-all', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const status = await reconnectAllConnections(workspaceId);
    res.json({ success: true, status });
  } catch (err) {
    console.error('Erro ao reconectar todas as contas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ROTAS DE TAREFAS: POST-ITS & KANBAN
// ==========================================

// --- POST-ITS (CHECKLIST NOTES) ---
app.get('/api/tasks/notes', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all(
      'SELECT * FROM task_notes WHERE workspace_id = ? ORDER BY is_pinned DESC, id DESC',
      [workspaceId]
    );

    const notes = rows.map(r => ({
      ...r,
      items: r.items ? (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) : []
    }));

    res.json(notes);
  } catch (error) {
    console.error('Erro ao listar notas:', error);
    res.status(500).json({ error: 'Erro ao listar notas' });
  }
});

app.post('/api/tasks/notes', async (req, res) => {
  try {
    const { title, color = 'yellow', category = 'Geral', items = [], is_pinned = 0 } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    const database = await db.getDB();
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    
    const result = await database.run(
      `INSERT INTO task_notes (workspace_id, title, color, category, items, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workspaceId, title, color, category, itemsJson, is_pinned ? 1 : 0]
    );

    const created = await database.get('SELECT * FROM task_notes WHERE id = ?', [result.lastID]);
    created.items = JSON.parse(created.items);
    res.json({ success: true, note: created });
  } catch (error) {
    console.error('Erro ao criar nota:', error);
    res.status(500).json({ error: 'Erro ao criar nota' });
  }
});

app.put('/api/tasks/notes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, color, category, items, is_pinned } = req.body;
    const database = await db.getDB();

    const existing = await database.get('SELECT * FROM task_notes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Nota não encontrada' });

    const newTitle = title !== undefined ? title : existing.title;
    const newColor = color !== undefined ? color : existing.color;
    const newCategory = category !== undefined ? category : existing.category;
    const newPinned = is_pinned !== undefined ? (is_pinned ? 1 : 0) : existing.is_pinned;
    const newItems = items !== undefined 
      ? (typeof items === 'string' ? items : JSON.stringify(items)) 
      : existing.items;

    await database.run(
      `UPDATE task_notes 
       SET title = ?, color = ?, category = ?, is_pinned = ?, items = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newTitle, newColor, newCategory, newPinned, newItems, id]
    );

    const updated = await database.get('SELECT * FROM task_notes WHERE id = ?', [id]);
    updated.items = JSON.parse(updated.items);
    res.json({ success: true, note: updated });
  } catch (error) {
    console.error('Erro ao atualizar nota:', error);
    res.status(500).json({ error: 'Erro ao atualizar nota' });
  }
});

app.patch('/api/tasks/notes/:id/toggle-item', async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;
    const database = await db.getDB();

    const note = await database.get('SELECT * FROM task_notes WHERE id = ?', [id]);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada' });

    let items = [];
    try {
      items = JSON.parse(note.items);
    } catch(e) {
      items = [];
    }

    items = items.map(item => {
      if (String(item.id) === String(itemId)) {
        return { ...item, completed: !item.completed };
      }
      return item;
    });

    await database.run(
      'UPDATE task_notes SET items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(items), id]
    );

    res.json({ success: true, items });
  } catch (error) {
    console.error('Erro ao alternar item:', error);
    res.status(500).json({ error: 'Erro ao alternar item' });
  }
});

app.delete('/api/tasks/notes/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM task_notes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir nota:', error);
    res.status(500).json({ error: 'Erro ao excluir nota' });
  }
});

// --- KANBAN PROJECTS ---
app.get('/api/tasks/kanban', async (req, res) => {
  try {
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    const rows = await database.all(
      'SELECT * FROM kanban_projects WHERE workspace_id = ? ORDER BY position ASC, id DESC',
      [workspaceId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar cards kanban:', error);
    res.status(500).json({ error: 'Erro ao listar projetos' });
  }
});

app.post('/api/tasks/kanban', async (req, res) => {
  try {
    const {
      title,
      description = '',
      status = 'todo',
      priority = 'medium',
      due_date = null,
      tag = 'Geral',
      assignee_name = 'Equipe',
      assignee_avatar = 'EQ',
      checklist_total = 0,
      checklist_done = 0
    } = req.body;
    const workspaceId = getEffectiveWorkspaceId(req);

    if (!title) return res.status(400).json({ error: 'Título do projeto é obrigatório' });

    const database = await db.getDB();
    const maxPosRow = await database.get(
      'SELECT MAX(position) as max_pos FROM kanban_projects WHERE workspace_id = ? AND status = ?',
      [workspaceId, status]
    );
    const position = (maxPosRow?.max_pos || 0) + 1;

    const result = await database.run(
      `INSERT INTO kanban_projects 
       (workspace_id, title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [workspaceId, title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, position]
    );

    const created = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [result.lastID]);
    res.json({ success: true, card: created });
  } catch (error) {
    console.error('Erro ao criar card kanban:', error);
    res.status(500).json({ error: 'Erro ao criar card kanban' });
  }
});

app.put('/api/tasks/kanban/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await db.getDB();
    const existing = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Projeto não encontrado' });

    const {
      title = existing.title,
      description = existing.description,
      status = existing.status,
      priority = existing.priority,
      due_date = existing.due_date,
      tag = existing.tag,
      assignee_name = existing.assignee_name,
      assignee_avatar = existing.assignee_avatar,
      checklist_total = existing.checklist_total,
      checklist_done = existing.checklist_done
    } = req.body;

    await database.run(
      `UPDATE kanban_projects 
       SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, tag = ?,
           assignee_name = ?, assignee_avatar = ?, checklist_total = ?, checklist_done = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, description, status, priority, due_date, tag, assignee_name, assignee_avatar, checklist_total, checklist_done, id]
    );

    const updated = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [id]);
    res.json({ success: true, card: updated });
  } catch (error) {
    console.error('Erro ao atualizar card kanban:', error);
    res.status(500).json({ error: 'Erro ao atualizar card' });
  }
});

app.patch('/api/tasks/kanban/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, position } = req.body;
    if (!status) return res.status(400).json({ error: 'Novo status é obrigatório' });

    const database = await db.getDB();
    await database.run(
      'UPDATE kanban_projects SET status = ?, position = COALESCE(?, position), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, position !== undefined ? position : null, id]
    );

    const updated = await database.get('SELECT * FROM kanban_projects WHERE id = ?', [id]);
    res.json({ success: true, card: updated });
  } catch (error) {
    console.error('Erro ao mover card kanban:', error);
    res.status(500).json({ error: 'Erro ao mover card' });
  }
});

app.delete('/api/tasks/kanban/:id', async (req, res) => {
  try {
    const database = await db.getDB();
    await database.run('DELETE FROM kanban_projects WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir card kanban:', error);
    res.status(500).json({ error: 'Erro ao excluir card' });
  }
});

app.delete('/api/tasks/kanban/column/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const workspaceId = getEffectiveWorkspaceId(req);
    const database = await db.getDB();
    await database.run('DELETE FROM kanban_projects WHERE workspace_id = ? AND status = ?', [workspaceId, status]);
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao limpar coluna kanban:', error);
    res.status(500).json({ error: 'Erro ao limpar coluna' });
  }
});

// --- DATABASE CONNECTION & ENVIRONMENT VARIABLES (RESTRITO A SUPERADMIN - SEC-07 & SEC-08) ---
app.get('/api/connections/database', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Acesso negado: As configurações e variáveis de banco de dados são restritas a administradores do sistema.' });
    }

    const envPath = path.resolve(__dirname, '.env');
    let envFileContent = '';
    if (fs.existsSync(envPath)) {
      envFileContent = fs.readFileSync(envPath, 'utf8');
    }

    const parsed = {};
    envFileContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        parsed[match[1]] = val;
      }
    });

    const hasDbPassword = Boolean(parsed.DB_PASSWORD || process.env.DB_PASSWORD);
    const hasDbUrl = Boolean(parsed.DATABASE_URL || process.env.DATABASE_URL);

    res.json({
      db_type: parsed.DB_TYPE || process.env.DB_TYPE || 'mysql',
      db_host: parsed.DB_HOST || process.env.DB_HOST || '',
      db_port: parsed.DB_PORT || process.env.DB_PORT || '3306',
      db_user: parsed.DB_USER || process.env.DB_USER || '',
      db_password: hasDbPassword ? '••••••••••••' : '',
      db_name: parsed.DB_NAME || process.env.DB_NAME || '',
      db_ssl: (parsed.DB_SSL || process.env.DB_SSL) === 'true',
      database_url: hasDbUrl ? 'mysql://***:***@host/db' : '',
      active_driver: 'sqlite3',
      sqlite_file: 'database.sqlite'
    });
  } catch (error) {
    console.error('Erro ao ler configurações do banco:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações do banco' });
  }
});

app.post('/api/connections/database/test', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Acesso negado: Apenas administradores do sistema podem testar conexões de banco de dados.' });
    }

    const {
      db_type = 'mysql',
      db_host,
      db_port = '3306',
      db_user,
      db_password,
      db_name,
      db_ssl = false
    } = req.body;

    if (db_type === 'sqlite') {
      const dbPath = path.resolve(__dirname, 'database.sqlite');
      const exists = fs.existsSync(dbPath);
      return res.json({
        success: true,
        message: exists ? 'Banco SQLite local ativo e acessível!' : 'Arquivo SQLite será inicializado localmente.'
      });
    }

    if (!db_host) {
      return res.status(400).json({ success: false, message: 'Host do banco de dados (DB_HOST) é obrigatório.' });
    }

    // Proteção contra SSRF / varredura de metadados de nuvem e hosts reservados (SEC-07)
    const cleanHost = String(db_host).toLowerCase().trim();
    if (cleanHost === '169.254.169.254' || cleanHost.startsWith('169.254.') || cleanHost === '0.0.0.0') {
      return res.status(400).json({ success: false, message: 'Host de banco de dados não permitido (endereço de metadados ou reservado bloqueado).' });
    }

    const resolvedPassword = (db_password && db_password !== '••••••••••••') 
      ? db_password 
      : (process.env.DB_PASSWORD || '');

    if (db_type === 'mysql' || db_type === 'mariadb') {
      const mysql = require('mysql2/promise');
      const config = {
        host: db_host,
        port: parseInt(db_port, 10) || 3306,
        user: db_user || '',
        password: resolvedPassword,
        database: db_name || undefined,
        connectTimeout: 5000
      };

      if (db_ssl) {
        config.ssl = { rejectUnauthorized: false };
      }

      const connection = await mysql.createConnection(config);
      await connection.query('SELECT 1 + 1 AS solution');
      await connection.end();

      return res.json({
        success: true,
        message: `Conexão com MySQL em ${db_host}:${db_port} realizada com sucesso!`
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Tipo de banco de dados não suportado para teste direto de conexão.'
      });
    }
  } catch (error) {
    console.error('Erro ao testar conexão:', error.message);
    return res.json({
      success: false,
      message: error.message || 'Falha ao conectar no banco de dados',
      code: error.code
    });
  }
});

app.post('/api/connections/database/save', async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, error: 'Acesso negado: Apenas administradores do sistema podem alterar as variáveis de banco de dados.' });
    }

    const {
      db_type = 'mysql',
      db_host = '',
      db_port = '3306',
      db_user = '',
      db_password = '',
      db_name = '',
      db_ssl = false,
      database_url = ''
    } = req.body;

    const envPath = path.resolve(__dirname, '.env');
    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const parsedExisting = {};
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (match) parsedExisting[match[1]] = match[2].trim();
    });

    const finalPassword = (db_password && db_password !== '••••••••••••')
      ? db_password
      : (parsedExisting.DB_PASSWORD || process.env.DB_PASSWORD || '');

    const computedUrl = (database_url && !database_url.includes('***'))
      ? database_url
      : (db_host ? `${db_type}://${encodeURIComponent(db_user)}:${encodeURIComponent(finalPassword)}@${db_host}:${db_port}/${db_name}` : '');

    const updates = {
      DB_TYPE: db_type,
      DB_HOST: db_host,
      DB_PORT: db_port,
      DB_USER: db_user,
      DB_NAME: db_name,
      DB_SSL: db_ssl ? 'true' : 'false',
      DATABASE_URL: computedUrl
    };

    if (finalPassword) {
      updates.DB_PASSWORD = finalPassword;
    }

    const lines = content.split('\n');
    const keysUpdated = new Set();

    const newLines = lines.map(line => {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
      if (match) {
        const key = match[1];
        if (key in updates) {
          keysUpdated.add(key);
          process.env[key] = String(updates[key]);
          return `${key}=${updates[key]}`;
        }
      }
      return line;
    });

    for (const [key, val] of Object.entries(updates)) {
      if (!keysUpdated.has(key)) {
        newLines.push(`${key}=${val}`);
        process.env[key] = String(val);
      }
    }

    fs.writeFileSync(envPath, newLines.join('\n').trim() + '\n', 'utf8');

    const safeEnv = { ...updates };
    if (safeEnv.DB_PASSWORD) safeEnv.DB_PASSWORD = '••••••••••••';
    if (safeEnv.DATABASE_URL) safeEnv.DATABASE_URL = 'mysql://***:***@host/db';

    res.json({
      success: true,
      message: 'Variáveis de ambiente do banco de dados salvas no arquivo .env com sucesso!',
      env: safeEnv
    });
  } catch (error) {
    console.error('Erro ao salvar .env do banco:', error);
    res.status(500).json({ error: 'Erro ao salvar variáveis de ambiente' });
  }
});

// Servir build do frontend caso exista na pasta ../dist (ideal para produção / Hostinger)
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
  console.log('📦 Servindo frontend estático de ../dist');
}

// ==========================================
// CENTRAL DE RECONEXÃO AUTOMÁTICA DE CONTAS
// ==========================================
/**
 * Recupera as credenciais/tokens salvos no banco SQLite e conecta/sincroniza:
 * 1. WhatsApp (Baileys)
 * 2. Telegram (Bot Telegraf)
 * 3. Cal.com / Agenda (API Key)
 * 4. E-mail Hostinger (IMAP & SMTP)
 */
async function reconnectAllConnections(workspaceId = 1) {
  console.log(`\n======================================================`);
  console.log(`🔄 [AutoConnect] Verificando e conectando canais do Workspace ${workspaceId}...`);
  const results = {
    whatsapp: 'disconnected',
    telegram: 'disconnected',
    calendar: 'disconnected',
    email: 'disconnected'
  };

  try {
    const database = await db.getDB();
    const ws = await database.get('SELECT telegram_token, cal_api_key, cal_link FROM workspaces WHERE id = ?', [workspaceId]);

    // 1. WhatsApp (Baileys — até 3 linhas por Workspace)
    try {
      const whatsappApi = require('./whatsapp');
      const savedSlots = whatsappApi.getSavedSlots(workspaceId);
      if (savedSlots.length > 0) {
        for (const s of savedSlots) {
          const slotStatus = whatsappApi.getStatus(workspaceId, s);
          if (slotStatus && slotStatus.status === 'connected') {
            results.whatsapp = 'connected';
            console.log(`📱 [AutoConnect] WhatsApp Linha #${s} já está conectado para Workspace ${workspaceId}.`);
          } else {
            console.log(`📱 [AutoConnect] Sessão salva detectada. Conectando WhatsApp Linha #${s} para Workspace ${workspaceId}...`);
            await whatsappApi.connectToWhatsApp(workspaceId, false, s);
            if (results.whatsapp !== 'connected') results.whatsapp = 'connecting';
          }
        }
      } else {
        console.log(`ℹ️ [AutoConnect] Nenhuma credencial salva de WhatsApp para Workspace ${workspaceId}.`);
        results.whatsapp = 'disconnected';
      }
    } catch (waErr) {
      console.error('❌ [AutoConnect] Erro ao reconectar WhatsApp:', waErr.message);
      results.whatsapp = 'error';
    }

    // 2. Telegram (MTProto User - até 5 contas em rodízio ou Telegraf Bot)
    try {
      const telegramUser = require('./telegram_user');
      const connectedTgSlots = await telegramUser.connectAllSavedSlots(workspaceId);
      if (connectedTgSlots && connectedTgSlots.length > 0) {
        results.telegram = 'connected';
        console.log(`✅ [AutoConnect] ${connectedTgSlots.length} Conta(s) de Usuário do Telegram (MTProto) conectada(s) para Workspace ${workspaceId} (Slots: ${connectedTgSlots.join(', ')})!`);
      } else {
        const telegramApi = require('./telegram');
        const token = (ws && ws.telegram_token && ws.telegram_token.trim()) || null;
        if (token) {
          console.log(`✈️ [AutoConnect] Conectando Telegram com token recuperado do banco...`);
          const tgRes = await telegramApi.connectToTelegram(workspaceId, token);
          if (tgRes.success) {
            results.telegram = 'connected';
            console.log(`✅ [AutoConnect] Telegram conectado com sucesso: @${tgRes.botInfo ? tgRes.botInfo.username : 'bot'}`);
          } else {
            results.telegram = 'error';
            console.warn('⚠️ [AutoConnect] Erro ao conectar bot Telegram:', tgRes.error);
          }
        } else {
          console.log('ℹ️ [AutoConnect] Nenhuma conta de usuário ou bot Telegram configurado no banco.');
        }
      }
    } catch (tgErr) {
      console.error('❌ [AutoConnect] Erro ao reconectar Telegram:', tgErr.message);
      results.telegram = 'error';
    }

    // 3. Cal.com / Agenda
    try {
      if (ws && ws.cal_api_key && ws.cal_api_key.trim()) {
        results.calendar = 'connected';
        console.log('📅 [AutoConnect] Cal.com ativo e chave validada no banco.');
      } else {
        console.log('ℹ️ [AutoConnect] Nenhuma API Key do Cal.com configurada.');
      }
    } catch (calErr) {
      console.error('❌ [AutoConnect] Erro ao verificar Cal.com:', calErr.message);
      results.calendar = 'error';
    }

    // 4. E-mail Hostinger (IMAP & SMTP)
    try {
      const emailService = require('./email_service');
      const accounts = await database.all('SELECT id, email_address FROM email_accounts WHERE workspace_id = ?', [workspaceId]);
      if (accounts && accounts.length > 0) {
        for (const acc of accounts) {
          try {
            console.log(`📬 [AutoConnect] Sincronizando caixa de entrada Hostinger: ${acc.email_address}...`);
            await emailService.syncAccountInbox(acc.id);
            results.email = 'connected';
          } catch (mailSyncErr) {
            console.warn(`⚠️ [AutoConnect] Falha ao sincronizar e-mail ${acc.email_address}:`, mailSyncErr.message);
            results.email = 'error';
          }
        }
      } else {
        console.log('ℹ️ [AutoConnect] Nenhuma conta de e-mail Hostinger configurada.');
      }
    } catch (emailErr) {
      console.error('❌ [AutoConnect] Erro ao inicializar e-mails Hostinger:', emailErr.message);
      results.email = 'error';
    }

  } catch (dbErr) {
    console.error('❌ [AutoConnect] Erro ao ler banco para reconexão:', dbErr);
  }

  console.log(`🏁 [AutoConnect] Status de conexões:`, results);
  console.log(`======================================================\n`);
  return results;
}

// Inicia o Servidor
app.listen(PORT, async () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  
  // 1. Inicializa o banco de dados SQLite e garante todas as 22 tabelas
  try {
    const { init: initDB } = require('./initialize_db');
    await initDB();
  } catch (initErr) {
    console.error('❌ Erro na auto-inicialização do banco SQLite:', initErr);
  }

  // Reconecta automaticamente todas as conexões salvas em todos os workspaces
  try {
    const database = await db.getDB();
    const workspaces = await database.all('SELECT id FROM workspaces');
    for (const ws of workspaces) {
      await reconnectAllConnections(ws.id);
    }
  } catch (autoErr) {
    console.error('Erro na auto-reconexão inicial de canais:', autoErr);
  }

  // Inicia o serviço de confirmação e lembretes 24h antes
  try {
    const reminderService = require('./reminder_service');
    reminderService.startReminderService(15);
  } catch (remErr) {
    console.error('Erro ao iniciar ReminderService:', remErr);
  }

  // Inicia o serviço de sincronização periódica de e-mails Hostinger
  try {
    const emailService = require('./email_service');
    emailService.startPeriodicEmailSync();
  } catch (emailErr) {
    console.error('Erro ao iniciar EmailService:', emailErr);
  }

  // Inicia o serviço do Agente Executivo Sofia (Briefing Diário Programado)
  try {
    const briefingService = require('./briefing_service');
    briefingService.startBriefingScheduler();
  } catch (briefingErr) {
    console.error('Erro ao iniciar BriefingService:', briefingErr);
  }
});
