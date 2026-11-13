// File: src/pages/Files/Files.jsx
import React, { useState, useEffect, useRef } from 'react';
import './Files.css';
import {
  Folder,
  FolderPlus,
  File,
  FileText,
  Image,
  BookOpen,
  Eye,
  Download,
  Copy,
  Pencil,
  Trash,
  Plus,
  Search,
  Check,
  Close,
  ExternalLink,
  Grid3x3,
  Bulletlist,
  Users,
  User
} from 'pixelarticons/react';
import { getWorkspaceId } from '../../utils/workspace';

export default function Files() {
  const workspaceId = getWorkspaceId();

  const [files, setFiles] = useState([]);
  const [summary, setSummary] = useState({
    total_files: 0,
    total_size_bytes: 0,
    categories: { todos: 0, documentos: 0, fotos: 0, ebooks: 0, midias: 0, outros: 0 },
    folders: ['Raiz']
  });
  const [loading, setLoading] = useState(true);

  // Filtros, Escopo e Visualização
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState('all'); // 'all' | 'mine' | 'shared'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Modais
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Compartilhamento com @
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null); // { type: 'file', file } | { type: 'folder', folderName }
  const [targetShares, setTargetShares] = useState([]);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionInput, setMentionInput] = useState('');
  const [isSharingLoading, setIsSharingLoading] = useState(false);

  // Estado do formulário de Upload
  const [uploadFilesList, setUploadFilesList] = useState([]);
  const [uploadFolder, setUploadFolder] = useState('Raiz');
  const [uploadCategory, setUploadCategory] = useState('auto');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Feedback de link copiado
  const [copiedId, setCopiedId] = useState(null);

  const fileInputRef = useRef(null);

  // Carrega arquivos da API
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('unne_token');
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedFolder !== 'all') params.append('folder', selectedFolder);
      if (selectedScope !== 'all') params.append('scope', selectedScope);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await fetch(`/api/files?${params.toString()}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFiles(data.files || []);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err) {
      console.error('Erro ao buscar arquivos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [workspaceId, selectedCategory, selectedFolder, selectedScope]);

  // Busca instantânea com debounce simples
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFiles();
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Carrega sugestões de usuários (@) para autocomplete
  const fetchMentionSuggestions = async () => {
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch('/api/users/mention-suggestions', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMentionSuggestions(data.users || []);
      }
    } catch (err) {
      console.error('Erro ao carregar sugestões de menção:', err);
    }
  };

  useEffect(() => {
    fetchMentionSuggestions();
  }, []);

  // Abrir modal de compartilhamento para arquivo específico
  const handleOpenShareModal = async (file) => {
    setShareTarget({ type: 'file', file, id: file.id, title: file.name });
    setIsShareModalOpen(true);
    setMentionInput('');
    setIsSharingLoading(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/files/${file.id}/shares`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTargetShares(data.shares || []);
      }
    } catch (err) {
      console.error('Erro ao buscar compartilhamentos:', err);
    } finally {
      setIsSharingLoading(false);
    }
  };

  // Abrir modal de compartilhamento para pasta inteira
  const handleOpenFolderShareModal = async (folderName) => {
    const targetFolder = folderName || selectedFolder;
    if (!targetFolder || targetFolder === 'all') {
      alert('Por favor, selecione uma pasta específica para compartilhar.');
      return;
    }
    setShareTarget({ type: 'folder', folderName: targetFolder, title: `Pasta: ${targetFolder}` });
    setIsShareModalOpen(true);
    setMentionInput('');
    setIsSharingLoading(true);
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/files/folders/${encodeURIComponent(targetFolder)}/shares`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTargetShares(data.shares || []);
      }
    } catch (err) {
      console.error('Erro ao buscar compartilhamentos da pasta:', err);
    } finally {
      setIsSharingLoading(false);
    }
  };

  // Adicionar compartilhamento com @username
  const handleAddShare = async (rawUsername) => {
    const username = (rawUsername || mentionInput).trim().replace(/^@/, '').toLowerCase();
    if (!username) return;
    if (!shareTarget) return;

    setIsSharingLoading(true);
    try {
      const token = localStorage.getItem('unne_token');
      const endpoint = shareTarget.type === 'file'
        ? `/api/files/${shareTarget.id}/share`
        : `/api/files/folders/${encodeURIComponent(shareTarget.folderName)}/share`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ usernames: [username] })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTargetShares(data.shares || []);
        setMentionInput('');
        fetchFiles();
      } else {
        alert(data.error || 'Erro ao compartilhar.');
      }
    } catch (err) {
      console.error('Erro ao adicionar compartilhamento:', err);
      alert('Erro de conexão ao compartilhar.');
    } finally {
      setIsSharingLoading(false);
    }
  };

  // Remover / revogar compartilhamento de um usuário
  const handleRemoveShare = async (username) => {
    if (!shareTarget) return;
    setIsSharingLoading(true);
    try {
      const token = localStorage.getItem('unne_token');
      const endpoint = shareTarget.type === 'file'
        ? `/api/files/${shareTarget.id}/share/${encodeURIComponent(username)}`
        : `/api/files/folders/${encodeURIComponent(shareTarget.folderName)}/share/${encodeURIComponent(username)}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTargetShares(prev => prev.filter(s => s.shared_with_username !== username));
        fetchFiles();
      } else {
        alert(data.error || 'Erro ao remover compartilhamento.');
      }
    } catch (err) {
      console.error('Erro ao remover compartilhamento:', err);
      alert('Erro de conexão ao remover compartilhamento.');
    } finally {
      setIsSharingLoading(false);
    }
  };

  // Formatação de bytes para formato amigável (KB, MB, GB)
  const formatBytes = (bytes) => {
    const num = Number(bytes) || 0;
    if (num === 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
    return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Formatação de data
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Copia URL do arquivo para área de transferência
  const handleCopyLink = (file) => {
    const fullUrl = window.location.origin + file.url;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  // Upload de arquivos
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (uploadFilesList.length === 0) {
      alert('Por favor, selecione ao menos um arquivo para enviar.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(`Enviando ${uploadFilesList.length} arquivo(s)...`);

    try {
      const formData = new FormData();
      formData.append('workspace_id', workspaceId);
      formData.append('folder', uploadFolder.trim() || 'Raiz');
      formData.append('category', uploadCategory);
      formData.append('description', uploadDescription);

      for (let i = 0; i < uploadFilesList.length; i++) {
        formData.append('files', uploadFilesList[i]);
      }

      const token = localStorage.getItem('unne_token');
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsUploadModalOpen(false);
        setUploadFilesList([]);
        setUploadDescription('');
        fetchFiles();
      } else {
        alert('Erro no envio: ' + (data.error || 'Falha ao salvar arquivos.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao enviar arquivos.');
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  // Atualizar / Renomear arquivo
  const handleSaveEdit = async () => {
    if (!editingFile) return;
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/files/${editingFile.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: editingFile.name,
          folder: editingFile.folder,
          category: editingFile.category,
          description: editingFile.description
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditingFile(null);
        fetchFiles();
      } else {
        alert('Erro ao atualizar: ' + (data.error || 'Falha ao salvar alterações.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar arquivo.');
    }
  };

  // Excluir arquivo
  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Deseja realmente excluir "${file.name}" permanentemente?`)) return;
    try {
      const token = localStorage.getItem('unne_token');
      const res = await fetch(`/api/files/${file.id}?workspace_id=${workspaceId}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (previewFile?.id === file.id) setPreviewFile(null);
        fetchFiles();
      } else {
        alert('Erro: ' + (data.error || 'Falha ao excluir arquivo.'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir arquivo.');
    }
  };

  // Criar nova pasta
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    if (!summary.folders.includes(trimmed)) {
      setSummary(prev => ({ ...prev, folders: [...prev.folders, trimmed].sort() }));
    }
    setSelectedFolder(trimmed);
    setUploadFolder(trimmed);
    setIsNewFolderModalOpen(false);
    setNewFolderName('');
  };

  // Render do ícone e thumbnail do arquivo
  const renderThumbnail = (file) => {
    const isImage = file.category === 'fotos' || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes((file.extension || '').replace('.', ''));
    if (isImage) {
      return (
        <div className="file-thumb-img-wrapper">
          <img src={file.url} alt={file.name} className="file-thumb-img" loading="lazy" />
        </div>
      );
    }

    if (file.category === 'ebooks') {
      return (
        <div className="file-thumb-icon-wrapper ebook">
          <BookOpen size={36} color="#7c3aed" />
          <span className="file-thumb-tag">E-BOOK</span>
        </div>
      );
    }

    if (file.extension === '.pdf') {
      return (
        <div className="file-thumb-icon-wrapper pdf">
          <FileText size={36} color="#dc2626" />
          <span className="file-thumb-tag">PDF</span>
        </div>
      );
    }

    if (['.xls', '.xlsx', '.csv'].includes(file.extension)) {
      return (
        <div className="file-thumb-icon-wrapper sheet">
          <FileText size={36} color="#16a34a" />
          <span className="file-thumb-tag">PLANILHA</span>
        </div>
      );
    }

    return (
      <div className="file-thumb-icon-wrapper doc">
        <File size={36} color="#0284c7" />
        <span className="file-thumb-tag">{(file.extension || 'DOC').toUpperCase().replace('.', '')}</span>
      </div>
    );
  };

  return (
    <div className="files-container">
      {/* HEADER */}
      <div className="files-header">
        <div className="files-title-area">
          <h1>
            <Folder size={30} color="#6366f1" /> Cofre de Arquivos
          </h1>
          <p>
            Armazenamento inteligente de documentos, fotos, e-books e mídias para envio direto aos clientes.
          </p>
        </div>

        <div className="files-header-actions">
          <button 
            className="btn-secondary" 
            onClick={() => setIsNewFolderModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FolderPlus size={16} /> Nova Pasta
          </button>
          <button 
            className="btn-primary" 
            onClick={() => setIsUploadModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Enviar Arquivo(s)
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="files-kpis-grid">
        <div className="files-kpi-card" onClick={() => setSelectedCategory('all')}>
          <div className="files-kpi-icon" style={{ backgroundColor: '#e0e7ff', color: '#4338ca' }}>
            <Folder size={22} />
          </div>
          <div className="files-kpi-info">
            <span className="files-kpi-label">Total de Arquivos</span>
            <span className="files-kpi-value">{summary.total_files}</span>
            <span className="files-kpi-subtext">{formatBytes(summary.total_size_bytes)} em uso</span>
          </div>
        </div>

        <div className="files-kpi-card" onClick={() => setSelectedCategory('documentos')}>
          <div className="files-kpi-icon" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>
            <FileText size={22} />
          </div>
          <div className="files-kpi-info">
            <span className="files-kpi-label">Documentos</span>
            <span className="files-kpi-value">{summary.categories.documentos || 0}</span>
            <span className="files-kpi-subtext">PDFs, Planilhas & Docs</span>
          </div>
        </div>

        <div className="files-kpi-card" onClick={() => setSelectedCategory('fotos')}>
          <div className="files-kpi-icon" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
            <Image size={22} />
          </div>
          <div className="files-kpi-info">
            <span className="files-kpi-label">Fotos & Imagens</span>
            <span className="files-kpi-value">{summary.categories.fotos || 0}</span>
            <span className="files-kpi-subtext">JPG, PNG, WebP, SVG</span>
          </div>
        </div>

        <div className="files-kpi-card" onClick={() => setSelectedCategory('ebooks')}>
          <div className="files-kpi-icon" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>
            <BookOpen size={22} />
          </div>
          <div className="files-kpi-info">
            <span className="files-kpi-label">E-books & Livros</span>
            <span className="files-kpi-value">{summary.categories.ebooks || 0}</span>
            <span className="files-kpi-subtext">EPUB, MOBI, Manuais</span>
          </div>
        </div>
      </div>

      {/* TOOLBAR E FILTROS */}
      <div className="files-toolbar">
        {/* Scope Tabs: Todos | Meus Arquivos | Compartilhados Comigo */}
        <div className="files-scope-tabs">
          <button 
            className={`files-scope-tab ${selectedScope === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedScope('all')}
          >
            Todos os Arquivos
          </button>
          <button 
            className={`files-scope-tab ${selectedScope === 'mine' ? 'active' : ''}`}
            onClick={() => setSelectedScope('mine')}
          >
            Meus Arquivos
          </button>
          <button 
            className={`files-scope-tab ${selectedScope === 'shared' ? 'active' : ''}`}
            onClick={() => setSelectedScope('shared')}
          >
            <Users size={14} /> Compartilhados Comigo
          </button>
        </div>

        {/* Categorias Pills */}
        <div className="files-category-pills">
          <button 
            className={`file-cat-pill ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Todos ({summary.categories.todos || 0})
          </button>
          <button 
            className={`file-cat-pill ${selectedCategory === 'documentos' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('documentos')}
          >
            📄 Documentos ({summary.categories.documentos || 0})
          </button>
          <button 
            className={`file-cat-pill ${selectedCategory === 'fotos' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('fotos')}
          >
            🖼️ Fotos ({summary.categories.fotos || 0})
          </button>
          <button 
            className={`file-cat-pill ${selectedCategory === 'ebooks' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('ebooks')}
          >
            📚 E-books ({summary.categories.ebooks || 0})
          </button>
          <button 
            className={`file-cat-pill ${selectedCategory === 'midias' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('midias')}
          >
            🎥 Mídias ({summary.categories.midias || 0})
          </button>
          <button 
            className={`file-cat-pill ${selectedCategory === 'outros' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('outros')}
          >
            📦 Outros ({summary.categories.outros || 0})
          </button>
        </div>

        {/* Linha de Busca, Pastas e Alternador de Visão */}
        <div className="files-controls-row">
          <div className="files-search-box">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nome, extensão ou anotação..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Pasta:</span>
            <select 
              className="files-folder-select"
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
            >
              <option value="all">📁 Todas as Pastas</option>
              {summary.folders.map(f => (
                <option key={f} value={f}>📂 {f}</option>
              ))}
            </select>

            <button
              type="button"
              className="files-share-folder-btn"
              onClick={() => handleOpenFolderShareModal(selectedFolder === 'all' ? (summary.folders[0] || 'Raiz') : selectedFolder)}
              title={`Compartilhar pasta "${selectedFolder === 'all' ? (summary.folders[0] || 'Raiz') : selectedFolder}" com outros usuários`}
            >
              <Users size={14} /> Compartilhar Pasta (@)
            </button>
          </div>

          <div className="files-view-toggle">
            <button 
              className={`files-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              title="Visualização em Grade"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 size={18} />
            </button>
            <button 
              className={`files-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              title="Visualização em Lista"
              onClick={() => setViewMode('list')}
            >
              <Bulletlist size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ÁREA DE CONTEÚDO (GRID OU LISTA) */}
      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center', color: '#64748b' }}>
          <Folder size={36} className="spin" style={{ marginBottom: '12px', color: '#6366f1' }} />
          <p>Carregando arquivos do workspace...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="files-empty-state">
          <div className="files-empty-icon">
            <Folder size={44} color="#6366f1" />
          </div>
          <h3>Nenhum arquivo encontrado</h3>
          <p>
            {searchQuery || selectedCategory !== 'all' || selectedFolder !== 'all'
              ? 'Tente ajustar os filtros ou o termo de busca para encontrar o que procura.'
              : 'Seu cofre de arquivos está vazio. Envie documentos, fotos ou e-books para começar a compartilhar.'}
          </p>
          <button 
            className="btn-primary" 
            onClick={() => setIsUploadModalOpen(true)}
            style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Enviar Primeiro Arquivo
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* VISUALIZAÇÃO EM GRADE */
        <div className="files-grid">
          {files.map((file) => {
            const isCopied = copiedId === file.id;
            return (
              <div key={file.id} className="file-card">
                {/* Thumb clicável para preview */}
                <div className="file-card-thumb-area" onClick={() => setPreviewFile(file)}>
                  {renderThumbnail(file)}
                  <div className="file-card-hover-overlay">
                    <span className="file-hover-pill"><Eye size={14} /> Pré-visualizar</span>
                  </div>
                </div>

                {/* Info do arquivo */}
                <div className="file-card-details">
                  <div className="file-card-name" title={file.name}>
                    {file.name}
                  </div>

                  <div className="file-card-meta">
                    <span className="file-meta-folder">📁 {file.folder || 'Raiz'}</span>
                    <span className="file-meta-size">{formatBytes(file.size_bytes)}</span>
                  </div>

                  {/* Badges de Compartilhamento com @ */}
                  {file.is_owner === false ? (
                    <div className="file-shared-tag from">
                      <Users size={12} /> De @{file.shared_by || 'outro usuário'}
                    </div>
                  ) : file.shared_with && file.shared_with.length > 0 ? (
                    <div 
                      className="file-shared-tag to" 
                      onClick={(e) => { e.stopPropagation(); handleOpenShareModal(file); }} 
                      title="Clique para gerenciar acessos"
                    >
                      <Users size={12} /> Compartilhado: {file.shared_with.map(u => `@${u}`).join(', ')}
                    </div>
                  ) : file.is_folder_shared ? (
                    <div className="file-shared-tag folder" title="Esta pasta inteira está compartilhada">
                      <Folder size={12} /> Pasta compartilhada
                    </div>
                  ) : null}

                  {file.description && (
                    <div className="file-card-desc" title={file.description}>
                      {file.description}
                    </div>
                  )}

                  <div className="file-card-date">
                    Adicionado em {formatDate(file.created_at)}
                  </div>
                </div>

                {/* Ações do Card */}
                <div className="file-card-actions">
                  {file.is_owner !== false && (
                    <button 
                      className="file-action-btn share-btn"
                      title="Compartilhar com @"
                      onClick={() => handleOpenShareModal(file)}
                    >
                      <Users size={15} />
                    </button>
                  )}

                  <button 
                    className={`file-action-btn ${isCopied ? 'copied' : ''}`}
                    title={isCopied ? 'Link Copiado!' : 'Copiar Link Direto'}
                    onClick={() => handleCopyLink(file)}
                  >
                    {isCopied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                  </button>

                  <a 
                    href={file.url} 
                    download={file.name} 
                    className="file-action-btn"
                    title="Baixar Arquivo"
                  >
                    <Download size={15} />
                  </a>

                  {file.is_owner !== false && (
                    <>
                      <button 
                        className="file-action-btn"
                        title="Editar / Renomear"
                        onClick={() => setEditingFile({ ...file })}
                      >
                        <Pencil size={15} />
                      </button>

                      <button 
                        className="file-action-btn delete"
                        title="Excluir Arquivo"
                        onClick={() => handleDeleteFile(file)}
                      >
                        <Trash size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* VISUALIZAÇÃO EM LISTA */
        <div className="files-table-wrapper">
          <table className="files-table">
            <thead>
              <tr>
                <th>Nome do Arquivo</th>
                <th>Categoria</th>
                <th>Pasta</th>
                <th>Tamanho</th>
                <th>Data</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const isCopied = copiedId === file.id;
                return (
                  <tr key={file.id}>
                    <td>
                      <div className="files-table-name-cell" onClick={() => setPreviewFile(file)}>
                        <div className="files-table-mini-icon">
                          {file.category === 'fotos' ? (
                            <Image size={18} color="#16a34a" />
                          ) : file.category === 'ebooks' ? (
                            <BookOpen size={18} color="#7c3aed" />
                          ) : (
                            <FileText size={18} color="#0284c7" />
                          )}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="files-table-file-name">{file.name}</span>
                            {file.is_owner === false && (
                              <span className="file-shared-tag-mini from" title={`Compartilhado por @${file.shared_by}`}>
                                de @{file.shared_by}
                              </span>
                            )}
                            {file.is_owner !== false && file.shared_with && file.shared_with.length > 0 && (
                              <span 
                                className="file-shared-tag-mini to" 
                                title={`Compartilhado com: ${file.shared_with.map(u => `@${u}`).join(', ')}`}
                                onClick={(e) => { e.stopPropagation(); handleOpenShareModal(file); }}
                              >
                                👥 {file.shared_with.length} {file.shared_with.length === 1 ? 'usuário' : 'usuários'}
                              </span>
                            )}
                            {file.is_owner !== false && file.is_folder_shared && (!file.shared_with || file.shared_with.length === 0) && (
                              <span className="file-shared-tag-mini folder" title="Pasta compartilhada">
                                📁 pasta
                              </span>
                            )}
                          </div>
                          {file.description && (
                            <span className="files-table-file-desc">{file.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`file-badge-pill ${file.category}`}>
                        {file.category}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.84rem', color: '#475569', fontWeight: 600 }}>
                        📁 {file.folder || 'Raiz'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {formatBytes(file.size_bytes)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                        {formatDate(file.created_at)}
                      </span>
                    </td>
                    <td>
                      <div className="files-table-actions">
                        <button 
                          className="file-action-btn"
                          title="Visualizar"
                          onClick={() => setPreviewFile(file)}
                        >
                          <Eye size={15} />
                        </button>
                        {file.is_owner !== false && (
                          <button 
                            className="file-action-btn share-btn"
                            title="Compartilhar com @"
                            onClick={() => handleOpenShareModal(file)}
                          >
                            <Users size={15} />
                          </button>
                        )}
                        <button 
                          className={`file-action-btn ${isCopied ? 'copied' : ''}`}
                          title={isCopied ? 'Link Copiado!' : 'Copiar Link'}
                          onClick={() => handleCopyLink(file)}
                        >
                          {isCopied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                        </button>
                        <a 
                          href={file.url} 
                          download={file.name} 
                          className="file-action-btn"
                          title="Baixar"
                        >
                          <Download size={15} />
                        </a>
                        {file.is_owner !== false && (
                          <>
                            <button 
                              className="file-action-btn"
                              title="Editar"
                              onClick={() => setEditingFile({ ...file })}
                            >
                              <Pencil size={15} />
                            </button>
                            <button 
                              className="file-action-btn delete"
                              title="Excluir"
                              onClick={() => handleDeleteFile(file)}
                            >
                              <Trash size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: UPLOAD DE ARQUIVOS */}
      {isUploadModalOpen && (
        <div className="files-modal-overlay" onClick={() => !isUploading && setIsUploadModalOpen(false)}>
          <div className="files-modal" onClick={(e) => e.stopPropagation()}>
            <div className="files-modal-header">
              <h3><Plus size={20} color="#6366f1" /> Enviar Arquivo(s) para o Workspace</h3>
              <button 
                className="files-modal-close" 
                onClick={() => !isUploading && setIsUploadModalOpen(false)}
                disabled={isUploading}
              >
                <Close size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <div className="files-modal-body">
                {/* DROPZONE */}
                <div 
                  className="files-dropzone" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    multiple 
                    ref={fileInputRef} 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files) {
                        setUploadFilesList(Array.from(e.target.files));
                      }
                    }}
                  />
                  <FolderPlus size={44} color="#6366f1" style={{ marginBottom: '10px' }} />
                  <h4>Clique ou arraste seus arquivos aqui</h4>
                  <p>Documentos (PDF, DOCX), Fotos (PNG, JPG), E-books (EPUB, PDF), Mídias (até 100MB)</p>
                </div>

                {/* LISTA DE ARQUIVOS SELECIONADOS */}
                {uploadFilesList.length > 0 && (
                  <div className="files-selected-list">
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>
                      {uploadFilesList.length} arquivo(s) selecionado(s):
                    </span>
                    {uploadFilesList.map((f, i) => (
                      <div key={i} className="files-selected-item">
                        <span className="file-name" title={f.name}>📄 {f.name}</span>
                        <span className="file-size">{formatBytes(f.size)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* PASTA DE DESTINO */}
                <div className="form-group" style={{ marginTop: '16px' }}>
                  <label>Pasta de Destino:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select 
                      className="modern-input"
                      value={uploadFolder}
                      onChange={(e) => setUploadFolder(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      {summary.folders.map(f => (
                        <option key={f} value={f}>📂 {f}</option>
                      ))}
                    </select>
                    <input 
                      type="text" 
                      className="modern-input"
                      placeholder="Ou digite nova pasta..."
                      value={uploadFolder === 'Raiz' ? '' : uploadFolder}
                      onChange={(e) => setUploadFolder(e.target.value || 'Raiz')}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>

                {/* CATEGORIA FORÇADA (OPCIONAL) */}
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label>Categoria:</label>
                  <select 
                    className="modern-input"
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                  >
                    <option value="auto">✨ Detecção Automática (Recomendado)</option>
                    <option value="documentos">📄 Documentos (PDF, DOCX, Planilhas)</option>
                    <option value="fotos">🖼️ Fotos & Imagens</option>
                    <option value="ebooks">📚 E-books & Livros (EPUB, Livros PDF)</option>
                    <option value="midias">🎥 Áudios & Vídeos</option>
                    <option value="outros">📦 Outros Arquivos</option>
                  </select>
                </div>

                {/* ANOTAÇÃO / DESCRIÇÃO */}
                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label>Descrição / Anotação (Opcional):</label>
                  <input 
                    type="text" 
                    className="modern-input"
                    placeholder="Ex: E-book de Prospecção 2026 para envio aos leads..."
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="files-modal-footer">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isUploading}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn-primary" 
                  disabled={isUploading || uploadFilesList.length === 0}
                >
                  {isUploading ? (uploadProgress || 'Enviando...') : 'Confirmar e Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PRÉ-VISUALIZAÇÃO / PREVIEW DO ARQUIVO */}
      {previewFile && (
        <div className="files-modal-overlay" onClick={() => setPreviewFile(null)}>
          <div className="files-modal files-modal-preview" onClick={(e) => e.stopPropagation()}>
            <div className="files-modal-header">
              <h3>
                <Eye size={20} color="#6366f1" /> Visualização: {previewFile.name}
              </h3>
              <button className="files-modal-close" onClick={() => setPreviewFile(null)}>
                <Close size={18} />
              </button>
            </div>

            <div className="files-modal-body" style={{ textAlign: 'center', padding: '16px' }}>
              {previewFile.category === 'fotos' || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes((previewFile.extension || '').replace('.', '')) ? (
                <div className="preview-image-container">
                  <img src={previewFile.url} alt={previewFile.name} className="preview-full-img" />
                </div>
              ) : previewFile.extension === '.pdf' ? (
                <div className="preview-iframe-container">
                  <iframe 
                    src={previewFile.url} 
                    title={previewFile.name} 
                    className="preview-pdf-iframe" 
                  />
                </div>
              ) : previewFile.category === 'ebooks' ? (
                <div className="preview-ebook-box">
                  <BookOpen size={64} color="#7c3aed" style={{ marginBottom: '16px' }} />
                  <h4>{previewFile.name}</h4>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto 20px' }}>
                    E-book cadastrado no formato <strong>{previewFile.extension?.toUpperCase()}</strong>. Você pode fazer o download ou copiar o link direto para compartilhar com seus clientes.
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <a href={previewFile.url} download={previewFile.name} className="btn-primary">
                      <Download size={16} /> Baixar E-book ({formatBytes(previewFile.size_bytes)})
                    </a>
                  </div>
                </div>
              ) : (
                <div className="preview-generic-box">
                  <FileText size={64} color="#0284c7" style={{ marginBottom: '16px' }} />
                  <h4>{previewFile.name}</h4>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0 auto 20px' }}>
                    Arquivo {previewFile.extension?.toUpperCase()} ({formatBytes(previewFile.size_bytes)})
                  </p>
                  <a href={previewFile.url} download={previewFile.name} className="btn-primary">
                    <Download size={16} /> Baixar Arquivo
                  </a>
                </div>
              )}

              {/* Informações de meta */}
              <div className="preview-meta-bar">
                <span><strong>Pasta:</strong> {previewFile.folder || 'Raiz'}</span>
                <span><strong>Tamanho:</strong> {formatBytes(previewFile.size_bytes)}</span>
                <span><strong>Data:</strong> {formatDate(previewFile.created_at)}</span>
                {previewFile.description && (
                  <span><strong>Nota:</strong> {previewFile.description}</span>
                )}
              </div>
            </div>

            <div className="files-modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => handleCopyLink(previewFile)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedId === previewFile.id ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
                {copiedId === previewFile.id ? 'Link Copiado!' : 'Copiar Link Direto'}
              </button>

              <a 
                href={previewFile.url} 
                target="_blank" 
                rel="noreferrer" 
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={16} /> Abrir em Nova Aba
              </a>

              <a 
                href={previewFile.url} 
                download={previewFile.name} 
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={16} /> Baixar
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDITAR / RENOMEAR ARQUIVO */}
      {editingFile && (
        <div className="files-modal-overlay" onClick={() => setEditingFile(null)}>
          <div className="files-modal" onClick={(e) => e.stopPropagation()}>
            <div className="files-modal-header">
              <h3><Pencil size={20} color="#6366f1" /> Editar Informações do Arquivo</h3>
              <button className="files-modal-close" onClick={() => setEditingFile(null)}>
                <Close size={18} />
              </button>
            </div>

            <div className="files-modal-body">
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Nome do Arquivo:</label>
                <input 
                  type="text" 
                  className="modern-input"
                  value={editingFile.name}
                  onChange={(e) => setEditingFile({ ...editingFile, name: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Pasta:</label>
                <select 
                  className="modern-input"
                  value={editingFile.folder || 'Raiz'}
                  onChange={(e) => setEditingFile({ ...editingFile, folder: e.target.value })}
                >
                  {summary.folders.map(f => (
                    <option key={f} value={f}>📂 {f}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Categoria:</label>
                <select 
                  className="modern-input"
                  value={editingFile.category}
                  onChange={(e) => setEditingFile({ ...editingFile, category: e.target.value })}
                >
                  <option value="documentos">📄 Documentos</option>
                  <option value="fotos">🖼️ Fotos & Imagens</option>
                  <option value="ebooks">📚 E-books & Livros</option>
                  <option value="midias">🎥 Mídias (Áudio/Vídeo)</option>
                  <option value="outros">📦 Outros</option>
                </select>
              </div>

              <div className="form-group">
                <label>Descrição / Anotação:</label>
                <textarea 
                  className="modern-input"
                  rows={3}
                  value={editingFile.description || ''}
                  onChange={(e) => setEditingFile({ ...editingFile, description: e.target.value })}
                  placeholder="Informações adicionais sobre este arquivo..."
                />
              </div>
            </div>

            <div className="files-modal-footer">
              <button className="btn-secondary" onClick={() => setEditingFile(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveEdit}>Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: NOVA PASTA */}
      {isNewFolderModalOpen && (
        <div className="files-modal-overlay" onClick={() => setIsNewFolderModalOpen(false)}>
          <div className="files-modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="files-modal-header">
              <h3><FolderPlus size={20} color="#6366f1" /> Criar Nova Pasta</h3>
              <button className="files-modal-close" onClick={() => setIsNewFolderModalOpen(false)}>
                <Close size={18} />
              </button>
            </div>

            <div className="files-modal-body">
              <p style={{ fontSize: '0.88rem', color: '#64748b', margin: '0 0 16px' }}>
                Organize seus materiais criando pastas personalizadas (ex: E-books de Vendas, Modelos de Propostas, Imagens de Campanhas).
              </p>
              <div className="form-group">
                <label>Nome da Pasta:</label>
                <input 
                  type="text" 
                  className="modern-input"
                  placeholder="Ex: E-books de Vendas"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="files-modal-footer">
              <button className="btn-secondary" onClick={() => setIsNewFolderModalOpen(false)}>Cancelar</button>
              <button 
                className="btn-primary" 
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Criar Pasta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: COMPARTILHAR COM @ */}
      {isShareModalOpen && shareTarget && (
        <div className="files-modal-overlay" onClick={() => !isSharingLoading && setIsShareModalOpen(false)}>
          <div className="files-modal files-share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="files-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="files-share-modal-icon">
                  <Users size={22} color="#6366f1" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                    Compartilhar {shareTarget.type === 'file' ? 'Arquivo' : 'Pasta'} com @
                  </h3>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    {shareTarget.title}
                  </span>
                </div>
              </div>
              <button 
                className="files-modal-close" 
                onClick={() => !isSharingLoading && setIsShareModalOpen(false)}
                disabled={isSharingLoading}
              >
                <Close size={18} />
              </button>
            </div>

            <div className="files-modal-body">
              <p className="files-share-intro">
                Mencione qualquer usuário do sistema usando <strong>@username</strong> para conceder acesso imediato a {shareTarget.type === 'file' ? 'este arquivo' : 'todos os arquivos desta pasta'}.
              </p>

              {/* INPUT DE MENÇÃO COM @ */}
              <div className="files-share-input-wrapper">
                <div className="files-share-input-box">
                  <span className="files-mention-at">@</span>
                  <input 
                    type="text" 
                    className="files-mention-input"
                    placeholder="Digite o @usuário (ex: @yuri, @assis, @admin)..."
                    value={mentionInput}
                    onChange={(e) => setMentionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddShare();
                      }
                    }}
                    autoFocus
                  />
                  <button 
                    type="button"
                    className="btn-primary files-share-add-btn"
                    onClick={() => handleAddShare()}
                    disabled={isSharingLoading || !mentionInput.trim()}
                  >
                    Compartilhar
                  </button>
                </div>

                {/* SUGESTÕES DE AUTOCOMPLETE AO DIGITAR */}
                {mentionInput.trim() && (
                  <div className="files-mention-dropdown">
                    {mentionSuggestions
                      .filter(u => {
                        const q = mentionInput.trim().replace(/^@/, '').toLowerCase();
                        const isAlreadyShared = targetShares.some(s => s.shared_with_username === u.username);
                        const matchUser = u.username?.toLowerCase().includes(q);
                        const matchName = u.name?.toLowerCase().includes(q);
                        return !isAlreadyShared && (matchUser || matchName);
                      })
                      .slice(0, 6)
                      .map((u) => (
                        <div 
                          key={u.id || u.username} 
                          className="files-mention-item"
                          onClick={() => handleAddShare(u.username)}
                        >
                          <div className="files-mention-avatar">
                            <User size={14} color="#6366f1" />
                          </div>
                          <div className="files-mention-user-info">
                            <span className="files-mention-name">{u.name || u.username}</span>
                            <span className="files-mention-handle">@{u.username}</span>
                          </div>
                          <span className="files-mention-add-label">+ Adicionar</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* CHIPS RÁPIDOS DE USUÁRIOS DO SISTEMA */}
              {mentionSuggestions.length > 0 && (
                <div className="files-quick-mentions">
                  <span className="files-quick-mentions-label">Sugestões de usuários:</span>
                  <div className="files-quick-mentions-list">
                    {mentionSuggestions
                      .filter(u => !targetShares.some(s => s.shared_with_username === u.username))
                      .slice(0, 8)
                      .map((u) => (
                        <button
                          key={u.id || u.username}
                          type="button"
                          className="files-quick-mention-pill"
                          onClick={() => handleAddShare(u.username)}
                          title={`Compartilhar com @${u.username}`}
                        >
                          <span>@{u.username}</span>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* LISTA DE USUÁRIOS QUE TÊM ACESSO */}
              <div className="files-shares-list-section">
                <div className="files-shares-list-header">
                  <span>Pessoas com acesso ({targetShares.length})</span>
                  {shareTarget.type === 'folder' && (
                    <span className="files-shares-badge-folder">Acesso a toda a pasta</span>
                  )}
                </div>

                {isSharingLoading && targetShares.length === 0 ? (
                  <div className="files-shares-loading">Carregando permissões...</div>
                ) : targetShares.length === 0 ? (
                  <div className="files-shares-empty">
                    <Users size={28} color="#94a3b8" />
                    <p>Nenhum usuário com acesso compartilhado ainda.</p>
                    <span>Use o campo acima para adicionar pelo @</span>
                  </div>
                ) : (
                  <div className="files-shares-list">
                    {targetShares.map((share) => (
                      <div key={share.id || share.shared_with_username} className="files-share-item">
                        <div className="files-share-user-cell">
                          <div className="files-share-avatar">
                            <User size={16} color="#6366f1" />
                          </div>
                          <div>
                            <span className="files-share-username">@{share.shared_with_username}</span>
                            <span className="files-share-role">Leitura e Download</span>
                          </div>
                        </div>

                        <button 
                          className="files-share-remove-btn"
                          title={`Remover acesso de @${share.shared_with_username}`}
                          onClick={() => handleRemoveShare(share.shared_with_username)}
                          disabled={isSharingLoading}
                        >
                          <Close size={14} /> Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="files-modal-footer">
              <button 
                type="button" 
                className="btn-primary" 
                onClick={() => setIsShareModalOpen(false)}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
