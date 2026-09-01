/* ============================================================
   DISLAM - CONTROLE DE PENDÊNCIAS
   JavaScript principal, organizado por módulos funcionais.
   ============================================================ */

/* ============================================================
   01. FIREBASE
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyBCrefUgqf4Tez8O6kmsFRb3fR7VmxNXTo",
  authDomain: "pendenciasx.firebaseapp.com",
  databaseURL: "https://pendenciasx-default-rtdb.firebaseio.com",
  projectId: "pendenciasx",
  storageBucket: "pendenciasx.firebasestorage.app",
  messagingSenderId: "182049973312",
  appId: "1:182049973312:web:af1fb0103214ee8ceeeba5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const clientesRef = db.ref('clientes');
const itensRef = db.ref('itens');
const pendenciasRef = db.ref('pendencias');
const usersRef = db.ref('users');
const configRef = db.ref('config');
const sessoesRef = db.ref('sessoes');

/* ============================================================
   02. ESTADO DO SISTEMA
   ============================================================ */
let currentUser = null;
let currentPermissions = {};
let sessionId = null;
let clientesDB = {};
let itensDB = {};
let pendencias = {};
let users = {};
let editingId = null;
let selectedItems = new Set();
let currentPendenciaItens = [];
let currentRecolherItem = { item: '', quantidade: '' };
let currentEntregarItem = { item: '', quantidade: '' };
let nextPendenciaNumero = 1;
let ageChart = null;
let sessionListenerStarted = false;
let whatsappPending = null;

const motivosPadrao = ['Sem Motivo', 'Vendedor', 'Devolução', 'Cliente', 'Em Rota', 'Interno', 'Motorista', 'Avaria de Rota', 'Avaria de Fábrica', 'Televendas'];
const responsaveisPadrao = ['NA BASE', 'JONJON', 'CELSO', 'JAMILSON', 'RAONEY', 'EDUARDO', 'RENAN', 'EULLER', 'THIAGO', 'BRUNO', 'ITALO', 'JAIRO', 'SR. CARLOS', 'KEINHO'];
let motivosList = [...motivosPadrao];
let responsaveisList = [...responsaveisPadrao];

const permissoesLista = [
  ['create', 'Criar pendência'], ['edit', 'Editar pendência'], ['delete', 'Excluir pendência'],
  ['changeStatus', 'Alterar status'], ['export', 'Exportar dados'], ['print', 'Imprimir'],
  ['importClientes', 'Importar clientes'], ['importItens', 'Importar itens'],
  ['batchDelete', 'Excluir em lote'], ['deleteAll', 'Excluir todas'],
  ['manageUsers', 'Gerenciar usuários'], ['baixarPendencia', 'Baixar pendência']
];

const usuariosIniciais = {
  admin: {
    password: '123456', name: 'Administrador', role: 'admin',
    permissions: { create:true, edit:true, delete:true, changeStatus:true, export:true, importClientes:true, importItens:true, batchDelete:true, deleteAll:true, manageUsers:true, print:true, baixarPendencia:true }
  },
  xandy: {
    password: '123456', name: 'Alexandre', role: 'admin',
    permissions: { create:true, edit:true, delete:true, changeStatus:true, export:true, importClientes:true, importItens:true, batchDelete:true, deleteAll:true, manageUsers:true, print:true, baixarPendencia:true }
  },
  edi: {
    password: '123456', name: 'Ediclecio', role: 'user',
    permissions: { create:true, edit:false, delete:false, changeStatus:true, export:true, importClientes:false, importItens:false, batchDelete:false, deleteAll:false, manageUsers:false, print:true, baixarPendencia:true }
  }
};

users = JSON.parse(JSON.stringify(usuariosIniciais));

/* ============================================================
   03. UTILITÁRIOS
   ============================================================ */
const $ = id => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getTodayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function daysOpen(pendencia) {
  if (!pendencia?.dataFalta || pendencia.status === 'resolvido') return 0;
  const start = new Date(`${pendencia.dataFalta}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today - start) / 86400000));
}

function can(permission) {
  return Boolean(currentPermissions?.[permission]);
}

function showMessage(elementId, text, type = 'success') {
  const el = $(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `${type === 'error' ? 'form-error' : 'success-message'}`;
  el.classList.remove('hidden');
}

/* ============================================================
   04. NAVEGAÇÃO
   ============================================================ */
const pageMeta = {
  'dashboard-page': ['Dashboard', 'Visão geral das pendências em aberto.'],
  'pendencias-page': ['Pendências', 'Consulte e trate as ocorrências registradas.'],
  'nova-page': ['Nova Pendência', 'Registre uma nova ocorrência.'],
  'baixar-page': ['Baixar Pendência', 'Marque uma pendência como resolvida.'],
  'clientes-page': ['Clientes', 'Cadastro de clientes disponível para administradores.'],
  'itens-page': ['Itens', 'Cadastro de itens disponível para administradores.'],
  'usuarios-page': ['Usuários', 'Gerencie usuários e permissões.'],
  'sessoes-page': ['Sessões', 'Acompanhe os acessos ativos.'],
  'importacoes-page': ['Importações', 'Atualize clientes e itens por planilha.'],
  'backup-page': ['Backup e Segurança', 'Proteja e restaure os dados do sistema.'],
  'conta-page': ['Minha Conta', 'Informações da conta atualmente conectada.']
};

function navigateTo(pageId) {
  if (!$(pageId)) return;
  if ($(pageId).classList.contains('admin-page') && users[currentUser]?.role !== 'admin') return;

  document.querySelectorAll('.page').forEach(page => page.classList.remove('active-page'));
  $(pageId).classList.add('active-page');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === pageId));

  const meta = pageMeta[pageId] || ['Sistema', ''];
  $('page-title').textContent = meta[0];
  $('page-subtitle').textContent = meta[1];
  $('breadcrumb-current').textContent = meta[0];

  if (pageId === 'clientes-page') renderClientesList();
  if (pageId === 'itens-page') renderItemsList();
  if (pageId === 'usuarios-page') renderUsersList();
  if (pageId === 'sessoes-page') startSessionListener();
  if (pageId === 'dashboard-page') updateDashboard();
  if (pageId === 'pendencias-page') updatePendenciasTable();
  if (pageId === 'backup-page') updateBackupInfo();
}

/* ============================================================
   05. LOGIN E SESSÃO
   ============================================================ */
async function login(username, password) {
  const error = $('login-error');
  error.textContent = '';

  if (!users[username]) {
    error.textContent = 'Usuário não encontrado.';
    return false;
  }
  if (users[username].password !== password) {
    error.textContent = 'Senha incorreta.';
    return false;
  }

  try {
    const existing = await sessoesRef.child(username).once('value');
    const active = existing.val();
    if (active?.ativa && active.sessionId !== sessionStorage.getItem('sessionId')) {
      const force = confirm(`O usuário ${username} já possui uma sessão ativa. Deseja encerrar a sessão anterior?`);
      if (!force) {
        error.textContent = 'Acesso cancelado. A sessão anterior continua ativa.';
        return false;
      }
      await sessoesRef.child(username).remove();
    }

    sessionId = generateSessionId();
    await sessoesRef.child(username).set({ sessionId, ativa: true, inicio: Date.now(), ultimaAtividade: Date.now() });
  } catch (firebaseError) {
    console.warn('Não foi possível registrar a sessão no Firebase:', firebaseError);
    sessionId = generateSessionId();
  }

  currentUser = username;
  currentPermissions = users[username].permissions || {};
  sessionStorage.setItem('currentUser', username);
  sessionStorage.setItem('sessionId', sessionId);
  showMainSystem();
  return true;
}

function logout() {
  const user = currentUser;
  currentUser = null;
  currentPermissions = {};
  sessionId = null;
  sessionStorage.clear();
  if (user) sessoesRef.child(user).remove().catch(() => {});
  $('main-system').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  $('login-password').value = '';
}

function checkAutoLogin() {
  const savedUser = sessionStorage.getItem('currentUser');
  if (savedUser && users[savedUser]) {
    currentUser = savedUser;
    currentPermissions = users[savedUser].permissions || {};
    sessionId = sessionStorage.getItem('sessionId');
    showMainSystem();
  }
}

function showMainSystem() {
  $('login-screen').classList.add('hidden');
  $('main-system').classList.remove('hidden');
  const user = users[currentUser] || {};
  const displayName = user.name || currentUser;
  $('current-user').textContent = displayName;
  $('user-role').textContent = user.role === 'admin' ? 'Administrador' : 'Usuário';
  $('user-avatar').textContent = displayName.charAt(0).toUpperCase();
  $('account-name').textContent = displayName;
  $('account-role').textContent = user.role === 'admin' ? 'Administrador' : 'Usuário';
  $('account-avatar').textContent = displayName.charAt(0).toUpperCase();

  document.querySelectorAll('.admin-only').forEach(el => el.style.display = user.role === 'admin' ? 'flex' : 'none');
  $('batch-actions').style.display = can('batchDelete') || can('deleteAll') ? 'flex' : 'none';
  $('export-button').style.display = can('export') ? '' : 'none';
  $('print-selected-btn').style.display = can('print') ? '' : 'none';

  navigateTo('dashboard-page');
}

function startSessionListener() {
  if (sessionListenerStarted) return;
  sessionListenerStarted = true;
  sessoesRef.on('value', snapshot => {
    if ($('sessoes-page').classList.contains('active-page')) renderSessions(snapshot.val() || {});
  });
}

function renderSessions(sessoes) {
  const container = $('sessoes-list');
  const entries = Object.entries(sessoes).filter(([, session]) => session?.ativa);
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">Nenhuma sessão ativa.</div>';
    return;
  }
  container.innerHTML = entries.map(([username, session]) => `
    <div class="user-item">
      <div class="user-head">
        <div class="user-main"><strong>${escapeHtml(username)}</strong><small>Início: ${escapeHtml(formatDateTime(session.inicio))}</small></div>
        <button class="btn btn-secondary" type="button" onclick="disconnectUser('${escapeHtml(username)}')">Desconectar</button>
      </div>
    </div>`).join('');
}

window.disconnectUser = async username => {
  if (users[currentUser]?.role !== 'admin') return;
  if (!confirm(`Desconectar ${username}?`)) return;
  await sessoesRef.child(username).remove();
};

/* ============================================================
   06. LISTAS DINÂMICAS
   ============================================================ */
function updateSelects() {
  const motivo = $('motivo-input');
  const responsavel = $('responsavel-input');
  if (motivo) {
    const current = motivo.value;
    motivo.innerHTML = '<option value="">Selecione</option>' + motivosList.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    motivo.value = motivosList.includes(current) ? current : '';
  }
  if (responsavel) {
    const current = responsavel.value;
    responsavel.innerHTML = '<option value="">Selecione</option>' + responsaveisList.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    responsavel.value = responsaveisList.includes(current) ? current : '';
  }
}

async function loadDynamicLists() {
  try {
    const [motivosSnap, responsaveisSnap] = await Promise.all([
      configRef.child('motivosList').once('value'),
      configRef.child('responsaveisList').once('value')
    ]);
    if (Array.isArray(motivosSnap.val())) motivosList = motivosSnap.val();
    if (Array.isArray(responsaveisSnap.val())) responsaveisList = responsaveisSnap.val();
  } catch (error) { console.warn('Listas dinâmicas não carregadas:', error); }
  updateSelects();
}

/* ============================================================
   07. CLIENTES E ITENS
   Pesquisa limitada visualmente a 5 registros.
   O campo de nova pendência NÃO usa datalist.
   ============================================================ */
function renderClientesList() {
  const container = $('clientes-list');
  if (!container) return;
  const query = normalize($('clientes-search')?.value);
  const all = Object.entries(clientesDB).filter(([codigo, c]) => {
    if (!query) return true;
    return [codigo, c.nome, c.fantasia, c.cidade, c.telefone].some(value => normalize(value).includes(query));
  });
  const visible = all.slice(0, 5);
  $('clientes-result-count').textContent = query ? `${all.length} resultado(s)` : `${Object.keys(clientesDB).length} cadastrados • exibindo 5`;
  if (!visible.length) { container.innerHTML = '<div class="empty-state">Nenhum cliente encontrado.</div>'; return; }
  container.innerHTML = visible.map(([codigo, c]) => `
    <div class="record-row">
      <div class="record-main"><strong>${escapeHtml(codigo)} — ${escapeHtml(c.nome || '-')}</strong><span>${escapeHtml(c.fantasia || '')}${c.cidade ? ` • ${escapeHtml(c.cidade)}` : ''}${c.telefone ? ` • ${escapeHtml(c.telefone)}` : ''}</span></div>
      <div class="record-actions"><button class="btn btn-danger" type="button" onclick="deleteCliente('${escapeHtml(codigo)}')">Excluir</button></div>
    </div>`).join('');
}

function renderItemsList() {
  const container = $('items-list');
  if (!container) return;
  const query = normalize($('itens-search')?.value);
  const all = Object.entries(itensDB).filter(([codigo, item]) => {
    if (!query) return true;
    return [codigo, item.descricao, item.unidade].some(value => normalize(value).includes(query));
  });
  const visible = all.slice(0, 5);
  $('itens-result-count').textContent = query ? `${all.length} resultado(s)` : `${Object.keys(itensDB).length} cadastrados • exibindo 5`;
  if (!visible.length) { container.innerHTML = '<div class="empty-state">Nenhum item encontrado.</div>'; return; }
  container.innerHTML = visible.map(([codigo, item]) => `
    <div class="record-row">
      <div class="record-main"><strong>${escapeHtml(codigo)} — ${escapeHtml(item.descricao || '-')}</strong><span>${item.unidade ? `Unidade: ${escapeHtml(item.unidade)}` : 'Unidade não informada'}${item.valor ? ` • Valor: ${escapeHtml(item.valor)}` : ''}</span></div>
      <div class="record-actions"><button class="btn btn-danger" type="button" onclick="deleteItem('${escapeHtml(codigo)}')">Excluir</button></div>
    </div>`).join('');
}

window.deleteCliente = async codigo => {
  if (!can('deleteAll') && users[currentUser]?.role !== 'admin') return;
  if (!confirm(`Excluir o cliente ${codigo}?`)) return;
  await clientesRef.child(codigo).remove();
};

window.deleteItem = async codigo => {
  if (!can('deleteAll') && users[currentUser]?.role !== 'admin') return;
  if (!confirm(`Excluir o item ${codigo}?`)) return;
  await itensRef.child(codigo).remove();
};

async function deleteAllClientes() {
  if (!can('deleteAll')) return alert('Você não possui permissão para esta ação.');
  const total = Object.keys(clientesDB).length;
  if (!total) return alert('Não há clientes cadastrados.');
  if (!confirm(`Excluir todos os ${total} clientes?`)) return;
  if (prompt('Digite EXCLUIR para confirmar:') !== 'EXCLUIR') return;
  await clientesRef.set(null);
}

async function deleteAllItens() {
  if (!can('deleteAll')) return alert('Você não possui permissão para esta ação.');
  const total = Object.keys(itensDB).length;
  if (!total) return alert('Não há itens cadastrados.');
  if (!confirm(`Excluir todos os ${total} itens?`)) return;
  if (prompt('Digite EXCLUIR para confirmar:') !== 'EXCLUIR') return;
  await itensRef.set(null);
}

function fillClientByCode(codigo) {
  const client = clientesDB[String(codigo).trim()];
  if (!client) return false;
  $('cliente-nome').value = client.nome || '';
  $('cliente-fantasia').value = client.fantasia || '';
  $('endereco-input').value = client.endereco || '';
  $('telefone-input').value = client.telefone || '';
  $('cidade-input').value = client.cidade || '';
  $('bairro-input').value = client.bairro || '';
  return true;
}

function fillItemByCode(codigo) {
  const code = String(codigo || '').trim();
  const descField = $('item-descricao-input');
  if (!code) {
    if (descField) descField.value = '';
    return false;
  }
  const item = itensDB[code];
  // Se existir no cadastro, preenche a descrição automaticamente.
  // Se não existir, NÃO apaga a descrição: o usuário pode cadastrá-la manualmente.
  if (!item) return false;
  if (descField) descField.value = item.descricao || '';
  return true;
}

// Pesquisa o item pelo CÓDIGO digitado nos campos de Recolher/Entregar.
// Se o código existir no Firebase, a descrição é preenchida automaticamente.
// Se o código NÃO existir, o usuário pode digitar a descrição manualmente.
function findItemByCode(codigo) {
  const code = String(codigo ?? '').trim();
  if (!code) return null;

  // Primeiro tenta pela chave do Firebase.
  if (itensDB && itensDB[code]) return itensDB[code];

  // Depois procura pelo código salvo dentro do próprio objeto do item.
  // Isso também funciona caso a importação tenha criado chaves diferentes.
  const normalized = code.replace(/^0+(?=\d)/, '');
  const found = Object.values(itensDB || {}).find(item => {
    if (!item || typeof item !== 'object') return false;
    const possibleCodes = [item.codigo, item.cod, item.CODIGO, item.codigoItem, item.code];
    return possibleCodes.some(value => {
      const valueText = String(value ?? '').trim();
      return valueText === code || valueText.replace(/^0+(?=\d)/, '') === normalized;
    });
  });

  return found || null;
}

function fillItemByCode(codigo) {
  const code = String(codigo || '').trim();
  const descField = $('item-descricao-input');
  if (!code) return false;

  const item = findItemByCode(code);
  if (!item) return false;

  if (descField) descField.value = item.descricao || item.nome || '';
  return true;
}

// Procura o código informado em RECOLHER/ENTREGAR.
// Se encontrar no cadastro, preenche a descrição automaticamente.
// Se NÃO encontrar, não bloqueia o usuário: ele pode digitar a descrição manualmente.
function fillServiceItemByCode(codigo, operation) {
  const code = String(codigo || '').trim();
  const descId = operation === 'recolher' ? 'recolher-descricao-input' : 'entregar-descricao-input';
  const descField = $(descId);

  // A DESCRIÇÃO É SEMPRE EDITÁVEL.
  if (descField) {
    descField.readOnly = false;
    descField.disabled = false;
    descField.style.pointerEvents = 'auto';
  }

  if (!code || !descField) return false;

  const item = findItemByCode(code);
  if (item) {
    // Preenche automaticamente somente ao consultar o código.
    // Depois disso o usuário pode alterar livremente a descrição.
    const descricao = item.descricao || item.nome || item.DESCRICAO || item.DESCRIÇÃO || '';
    if (descricao) descField.value = descricao;
    return true;
  }

  // Código inexistente: não bloqueia e NÃO preenche a descrição.
  return false;
}

function updateServiceDetailFields() {
  const service = $('tipo-servico-input')?.value || 'SOMENTE ENTREGAR';
  const details = $('service-details-fields');
  const normalEntry = $('normal-item-entry');
  if (!details || !normalEntry) return;

  const isBoth = service === 'RECOLHER E ENTREGAR';
  details.classList.toggle('hidden', !isBoth);
  normalEntry.classList.toggle('hidden', isBoth);

  const recolherCard = details.querySelector('.service-recollect-card');
  const entregarCard = details.querySelector('.service-deliver-card');
  if (recolherCard) recolherCard.classList.toggle('hidden', !isBoth);
  if (entregarCard) entregarCard.classList.toggle('hidden', !isBoth);
}

function readServiceDetailFields() {
  currentRecolherItem = {
    codigo: $('recolher-codigo-input')?.value.trim() || '',
    descricao: $('recolher-descricao-input')?.value.trim() || '',
    quantidade: $('recolher-quantidade-input')?.value.trim() || ''
  };
  currentEntregarItem = {
    codigo: $('entregar-codigo-input')?.value.trim() || '',
    descricao: $('entregar-descricao-input')?.value.trim() || '',
    quantidade: $('entregar-quantidade-input')?.value.trim() || ''
  };
}

function writeServiceDetailFields() {
  // Os campos de descrição são deliberadamente EDITÁVEIS.
  ['recolher-descricao-input', 'entregar-descricao-input', 'numero-pendencia-input'].forEach(id => {
    const field = $(id);
    if (field) {
      field.readOnly = false;
      field.disabled = false;
      field.style.pointerEvents = 'auto';
    }
  });
  if ($('recolher-codigo-input')) $('recolher-codigo-input').value = currentRecolherItem.codigo || '';
  if ($('recolher-descricao-input')) $('recolher-descricao-input').value = currentRecolherItem.descricao || '';
  if ($('recolher-quantidade-input')) $('recolher-quantidade-input').value = currentRecolherItem.quantidade || '';
  if ($('entregar-codigo-input')) $('entregar-codigo-input').value = currentEntregarItem.codigo || '';
  if ($('entregar-descricao-input')) $('entregar-descricao-input').value = currentEntregarItem.descricao || '';
  if ($('entregar-quantidade-input')) $('entregar-quantidade-input').value = currentEntregarItem.quantidade || '';
  updateServiceDetailFields();
}

function validateServiceDetails() {
  if ($('tipo-servico-input')?.value !== 'RECOLHER E ENTREGAR') return true;
  readServiceDetailFields();

  // O código NÃO precisa existir no cadastro. Se existir, a descrição já foi
  // preenchida automaticamente; se não existir, a descrição digitada pelo
  // usuário será aceita e salva normalmente.
  if (!currentRecolherItem.codigo || !currentRecolherItem.descricao || !currentRecolherItem.quantidade || Number(currentRecolherItem.quantidade) <= 0) {
    alert('Informe o código, a descrição e a quantidade do item que será recolhido.');
    if (!currentRecolherItem.codigo) $('recolher-codigo-input')?.focus();
    else if (!currentRecolherItem.descricao) $('recolher-descricao-input')?.focus();
    else $('recolher-quantidade-input')?.focus();
    return false;
  }

  if (!currentEntregarItem.codigo || !currentEntregarItem.descricao || !currentEntregarItem.quantidade || Number(currentEntregarItem.quantidade) <= 0) {
    alert('Informe o código, a descrição e a quantidade do item que será entregue.');
    if (!currentEntregarItem.codigo) $('entregar-codigo-input')?.focus();
    else if (!currentEntregarItem.descricao) $('entregar-descricao-input')?.focus();
    else $('entregar-quantidade-input')?.focus();
    return false;
  }

  return true;
}

/* ============================================================
   08. ITENS DA PENDÊNCIA
   ============================================================ */
function addItemToPendencia() {
  const codigo = $('item-codigo-input').value.trim();
  const descricao = $('item-descricao-input').value.trim();
  const quantidade = $('item-quantidade-input').value.trim();
  if (!quantidade || Number(quantidade) <= 0) return alert('Informe uma quantidade válida.');
  if (!codigo && !descricao) return alert('Informe o código ou a descrição do item.');
  currentPendenciaItens.push({ codigo, descricao, quantidade });
  renderPendenciaItems();
  $('item-codigo-input').value = '';
  $('item-descricao-input').value = '';
  $('item-quantidade-input').value = '';
  $('item-codigo-input').focus();
}

function renderPendenciaItems() {
  const container = $('itens-list-pendencia');
  if (!currentPendenciaItens.length) {
    container.innerHTML = '<div class="empty-state small">Nenhum item adicionado.</div>';
    return;
  }
  container.innerHTML = currentPendenciaItens.map((item, index) => `
    <div class="item-pendencia-display">
      <span><strong>${escapeHtml(item.codigo || 'Sem código')}</strong> — ${escapeHtml(item.descricao || 'Sem descrição')} • Qtd. ${escapeHtml(item.quantidade || 0)}</span>
      <button class="remove-item" type="button" onclick="removePendenciaItem(${index})">Remover</button>
    </div>`).join('');
}
window.removePendenciaItem = index => { currentPendenciaItens.splice(index, 1); renderPendenciaItems(); };

/* ============================================================
   09. NUMERAÇÃO E FORMULÁRIO DE PENDÊNCIA
   ============================================================ */
function calculateNextNumber() {
  const numbers = Object.values(pendencias).map(p => Number(p.numeroPendencia)).filter(Number.isFinite);
  nextPendenciaNumero = numbers.length ? Math.max(...numbers) + 1 : 1;
}

function resetPendenciaForm() {
  editingId = null;
  $('pendencia-form').reset();
  $('pendencia-form').classList.remove('editing');
  $('form-page-title').textContent = 'Registrar nova pendência';
  $('numero-pendencia-input').readOnly = false;
  $('numero-pendencia-input').disabled = false;
  $('numero-pendencia-input').value = nextPendenciaNumero;
  $('data-falta-input').value = getTodayISO();
  currentPendenciaItens = [];
  currentRecolherItem = { codigo: '', descricao: '', quantidade: '' };
  currentEntregarItem = { codigo: '', descricao: '', quantidade: '' };
  writeServiceDetailFields();
  renderPendenciaItems();
  $('print-button').classList.add('hidden');
  updateSelects();
}

function openNewPendencia() {
  if (!can('create')) return alert('Você não possui permissão para criar pendências.');
  navigateTo('nova-page');
  resetPendenciaForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadPendenciaForEdit(id) {
  if (!can('edit')) return alert('Você não possui permissão para editar pendências.');
  const p = pendencias[id];
  if (!p) return;
  editingId = id;
  navigateTo('nova-page');
  $('form-page-title').textContent = `Editar pendência ${p.numeroPendencia || ''}`;
  $('pendencia-form').classList.add('editing');
  $('cliente-codigo').value = p.clienteCodigo || '';
  $('cliente-nome').value = p.cliente || '';
  $('cliente-fantasia').value = p.fantasia || '';
  $('endereco-input').value = p.endereco || '';
  $('telefone-input').value = p.telefone || '';
  $('cidade-input').value = p.cidade || '';
  $('bairro-input').value = p.bairro || '';
  $('rota-input').value = p.rota || '';
  $('data-falta-input').value = p.dataFalta || '';
  $('numero-pendencia-input').value = p.numeroPendencia || '';
  $('motivo-input').value = p.motivo || '';
  $('tipo-servico-input').value = p.tipoServico || 'SOMENTE ENTREGAR';
  currentRecolherItem = {
    codigo: p.codigoItemRecolher || '',
    descricao: p.descricaoItemRecolher || p.itemRecolher || '',
    quantidade: p.quantidadeRecolher || ''
  };
  currentEntregarItem = {
    codigo: p.codigoItemEntregar || '',
    descricao: p.descricaoItemEntregar || p.itemEntregar || '',
    quantidade: p.quantidadeEntregar || ''
  };
  writeServiceDetailFields();
  $('responsavel-input').value = p.responsavel || '';
  $('status-input').value = p.status || 'pendente';
  $('observacao-input').value = p.observacao || '';
  currentPendenciaItens = Array.isArray(p.itens) ? p.itens.map(item => ({ ...item })) : [];
  renderPendenciaItems();
  $('print-button').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function getNextPendenciaNumber() {
  // Usa uma transação no Firebase para evitar números duplicados quando
  // dois usuários registram uma pendência praticamente ao mesmo tempo.
  const sequenceRef = configRef.child('nextPendenciaNumero');

  const transaction = await sequenceRef.transaction(current => {
    const currentNumber = Number(current);
    const maxExisting = Object.values(pendencias)
      .map(p => Number(p.numeroPendencia))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0);

    const next = Math.max(
      Number.isFinite(currentNumber) && currentNumber > 0 ? currentNumber : 1,
      maxExisting + 1
    );

    return next + 1;
  });

  if (!transaction.committed) {
    throw new Error('Não foi possível reservar o próximo número da pendência.');
  }

  const reservedNext = Number(transaction.snapshot.val());
  return String(reservedNext - 1);
}

function cleanWhatsAppValue(value) {
  return String(value ?? '-')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '-';
}

function buildWhatsAppMessage(p) {
  // Formato EXATO para colar no WhatsApp: 3 linhas, somente
  // número da pendência, cidade e nome do cliente.
  const numero = cleanWhatsAppValue(p?.numeroPendencia);
  const cidade = cleanWhatsAppValue(p?.cidade);
  const cliente = cleanWhatsAppValue(p?.cliente);

  return [
    `PENDÊNCIA Nº ${numero}`,
    `CIDADE: ${cidade}`,
    `CLIENTE: ${cliente}`
  ].join('\n');
}

function ensureWhatsAppModal() {
  let modal = $('whatsapp-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'whatsapp-modal';
  modal.className = 'modal hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="modal-dialog whatsapp-dialog">
      <div class="modal-header">
        <div>
          <h2>Enviar no WhatsApp</h2>
          <p>Copie a mensagem abaixo e envie manualmente no grupo ou contato desejado.</p>
        </div>
        <button id="whatsapp-modal-close" class="icon-button" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="modal-body">
        <div class="whatsapp-preview">
          <span class="whatsapp-preview-label">Mensagem</span>
          <textarea id="whatsapp-message-preview" class="whatsapp-message-preview" rows="5" readonly></textarea>
        </div>
        <div class="whatsapp-actions">
          <button id="whatsapp-cancel-btn" class="btn btn-secondary" type="button">Fechar</button>
          <button id="whatsapp-copy-btn" class="btn btn-whatsapp" type="button">Copiar mensagem</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  $('whatsapp-copy-btn').addEventListener('click', copyWhatsAppMessage);
  $('whatsapp-cancel-btn').addEventListener('click', closeWhatsAppModal);
  $('whatsapp-modal-close').addEventListener('click', closeWhatsAppModal);

  return modal;
}


async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }

  try {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.top = '0';
    helper.style.left = '-9999px';
    helper.style.width = '1px';
    helper.style.height = '1px';
    helper.style.opacity = '0';
    helper.setAttribute('readonly', '');
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    helper.setSelectionRange(0, helper.value.length);
    const ok = document.execCommand('copy');
    helper.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

async function copyWhatsAppMessage() {
  if (!whatsappPending) return;

  const message = buildWhatsAppMessage(whatsappPending);
  const preview = $('whatsapp-message-preview');
  const button = $('whatsapp-copy-btn');
  const copied = await copyTextToClipboard(message);

  if (copied) {
    if (button) button.textContent = 'Mensagem copiada!';
    setTimeout(closeWhatsAppModal, 150);
    return;
  }

  if (preview) {
    preview.removeAttribute('readonly');
    preview.focus();
    preview.select();
  }

  alert('Não foi possível copiar automaticamente. A mensagem foi selecionada; pressione Ctrl + C.');
}

function showWhatsAppModal(p) {
  whatsappPending = { ...p };
  const modal = ensureWhatsAppModal();
  const preview = $('whatsapp-message-preview');
  if (!modal || !preview) return;

  preview.value = buildWhatsAppMessage(p);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  // Seleciona automaticamente a mensagem para facilitar Ctrl+C,
  // mas não copia sem a ação do usuário.
  setTimeout(() => {
    preview.focus();
    preview.select();
  }, 0);
}

function closeWhatsAppModal() {
  const modal = $('whatsapp-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  whatsappPending = null;
}

async function savePendencia(event) {
  event.preventDefault();
  if (editingId && !can('edit')) return alert('Você não possui permissão para editar.');
  if (!editingId && !can('create')) return alert('Você não possui permissão para criar.');

  const old = editingId ? pendencias[editingId] : null;
  // Permite editar o número da pendência. Se o usuário deixar o campo vazio
  // ao criar uma nova pendência, o sistema gera o próximo número automaticamente.
  const informedNumber = String($('numero-pendencia-input')?.value || '').trim();
  const number = editingId
    ? String(informedNumber || old?.numeroPendencia || '').trim()
    : String(informedNumber || await getNextPendenciaNumber()).trim();
  if (!number) return alert('Não foi possível gerar o número da pendência.');
  if (!validateServiceDetails()) return;

  const existingId = Object.entries(pendencias).find(([id, p]) => String(p.numeroPendencia) === String(number) && id !== editingId)?.[0];
  if (existingId) return alert('O número gerado já está em uso. Tente salvar novamente.');
  readServiceDetailFields();
  const pendencia = {
    clienteCodigo: $('cliente-codigo').value.trim(),
    cliente: $('cliente-nome').value.trim(),
    fantasia: $('cliente-fantasia').value.trim(),
    endereco: $('endereco-input').value.trim(),
    telefone: $('telefone-input').value.trim(),
    cidade: $('cidade-input').value.trim(),
    bairro: $('bairro-input').value.trim(),
    rota: $('rota-input').value.trim(),
    dataFalta: $('data-falta-input').value,
    numeroPendencia: number,
    motivo: $('motivo-input').value,
    tipoServico: $('tipo-servico-input').value,
    codigoItemRecolher: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentRecolherItem.codigo : '',
    descricaoItemRecolher: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentRecolherItem.descricao : '',
    itemRecolher: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentRecolherItem.descricao : '',
    quantidadeRecolher: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentRecolherItem.quantidade : '',
    codigoItemEntregar: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentEntregarItem.codigo : '',
    descricaoItemEntregar: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentEntregarItem.descricao : '',
    itemEntregar: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentEntregarItem.descricao : '',
    quantidadeEntregar: $('tipo-servico-input').value === 'RECOLHER E ENTREGAR' ? currentEntregarItem.quantidade : '',
    responsavel: editingId ? $('responsavel-input').value : 'NA BASE',
    status: editingId ? $('status-input').value : 'pendente',
    observacao: $('observacao-input').value.trim(),
    itens: currentPendenciaItens.map(item => ({ ...item })),
    registradoPor: old?.registradoPor || users[currentUser]?.name || currentUser,
    registradoEm: old?.registradoEm || new Date().toISOString()
  };

  if (old?.baixadoPor) pendencia.baixadoPor = old.baixadoPor;
  if (old?.dataBaixa) pendencia.dataBaixa = old.dataBaixa;

  try {
    const wasCreating = !editingId;
    if (editingId) {
      await pendenciasRef.child(editingId).set(pendencia);
    } else {
      await pendenciasRef.push(pendencia);
    }

    calculateNextNumber();

    if (wasCreating) {
      // Mostra imediatamente a mensagem pronta antes de limpar o formulário.
      // Assim o usuário sempre consegue copiar o texto da pendência recém-criada.
      showWhatsAppModal(pendencia);
      resetPendenciaForm();
      navigateTo('pendencias-page');
    } else {
      alert('Pendência atualizada com sucesso.');
      resetPendenciaForm();
      navigateTo('pendencias-page');
    }
  } catch (error) {
    console.error(error);
    alert('Não foi possível salvar a pendência. Verifique a conexão com o Firebase.');
  }
}

/* ============================================================
   COPIAR MENSAGEM DA ABA PENDÊNCIAS
   Copia somente número, cidade e cliente.
   ============================================================ */
async function copyPendenciaMessage(id) {
  const p = pendencias[id];
  if (!p) return alert('Pendência não encontrada.');

  const message = buildWhatsAppMessage(p);
  const copied = await copyTextToClipboard(message);

  if (copied) {
    const btn = document.querySelector(`.action-btn.copy[data-id=\"${String(id).replace(/\"/g, '&quot;')}\"]`);
    if (btn) {
      const original = btn.title;
      btn.title = 'Mensagem copiada';
      btn.setAttribute('aria-label', 'Mensagem copiada');
      btn.classList.add('copied');
      setTimeout(() => {
        btn.title = original;
        btn.setAttribute('aria-label', 'Copiar mensagem');
        btn.classList.remove('copied');
      }, 1200);
    }
    return;
  }

  window.prompt('Copie a mensagem abaixo:', message);
}

window.editPendencia = loadPendenciaForEdit;
window.deletePendencia = async id => {
  if (!can('delete')) return alert('Você não possui permissão para excluir.');
  if (!confirm('Excluir esta pendência?')) return;
  await pendenciasRef.child(id).remove();
};
window.changeStatus = async id => {
  if (!can('changeStatus')) return alert('Você não possui permissão para alterar o status.');
  const p = pendencias[id];
  if (!p) return;
  const next = { pendente: 'emrota', emrota: 'resolvido', resolvido: 'pendente' }[p.status] || 'pendente';
  await pendenciasRef.child(id).update({ status: next, ...(next === 'resolvido' ? { dataBaixa: new Date().toISOString(), baixadoPor: users[currentUser]?.name || currentUser } : {}) });
};

/* ============================================================
   10. TABELA DE PENDÊNCIAS
   Sem pesquisa: somente as 10 últimas. Com pesquisa: procura em toda a base.
   ============================================================ */
function getPendenciasArray() {
  return Object.entries(pendencias).map(([id, p]) => ({ id, ...p }));
}

function populateFilterOptions() {
  const reasonSelect = $('filter-reason');
  const responsibleSelect = $('filter-responsible');

  if (reasonSelect) {
    const current = reasonSelect.value;
    const values = [...new Set(
      [...motivosList, ...getPendenciasArray().map(p => p.motivo).filter(Boolean)]
    )].sort((a, b) => normalize(a).localeCompare(normalize(b), 'pt-BR'));

    reasonSelect.innerHTML = '<option value="">Todos os motivos</option>' +
      values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    reasonSelect.value = values.includes(current) ? current : '';
  }

  if (responsibleSelect) {
    const current = responsibleSelect.value;
    const values = [...new Set(
      [...responsaveisList, ...getPendenciasArray().map(p => p.responsavel).filter(Boolean)]
    )].sort((a, b) => normalize(a).localeCompare(normalize(b), 'pt-BR'));

    responsibleSelect.innerHTML = '<option value="">Todos os responsáveis</option>' +
      values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    responsibleSelect.value = values.includes(current) ? current : '';
  }
}

function filterPendencias() {
  const search = normalize($('search-input')?.value);
  const status = $('status-filter')?.value || 'todos';
  const dateStart = $('filter-date-start')?.value || '';
  const dateEnd = $('filter-date-end')?.value || '';
  const city = normalize($('filter-city')?.value);
  const route = normalize($('filter-route')?.value);
  const number = normalize($('filter-number')?.value);
  const client = normalize($('filter-client')?.value);
  const reason = normalize($('filter-reason')?.value);
  const responsible = normalize($('filter-responsible')?.value);
  const service = $('filter-service')?.value || '';
  const age = Number($('filter-age')?.value || 0);

  let list = getPendenciasArray().filter(p => {
    const registered = p.registradoEm ? new Date(p.registradoEm) : null;
    const registeredDate = registered && !Number.isNaN(registered.getTime())
      ? registered.toISOString().slice(0, 10)
      : '';

    if (dateStart && (!registeredDate || registeredDate < dateStart)) return false;
    if (dateEnd && (!registeredDate || registeredDate > dateEnd)) return false;

    if (status !== 'todos' && p.status !== status) return false;
    if (city && !normalize(p.cidade).includes(city)) return false;
    if (route && !normalize(p.rota).includes(route)) return false;
    if (number && !normalize(p.numeroPendencia).includes(number)) return false;

    if (client) {
      const clientMatch = [
        p.clienteCodigo, p.cliente, p.fantasia
      ].some(value => normalize(value).includes(client));
      if (!clientMatch) return false;
    }

    if (reason && normalize(p.motivo) !== reason) return false;
    if (responsible && normalize(p.responsavel) !== responsible) return false;
    if (service && p.tipoServico !== service) return false;
    if (age && (p.status === 'resolvido' || daysOpen(p) <= age)) return false;

    if (search) {
      const haystack = [
        p.numeroPendencia, p.clienteCodigo, p.cliente, p.fantasia,
        p.cidade, p.rota, p.responsavel, p.motivo, p.tipoServico,
        p.observacao
      ].map(normalize).join(' ');
      if (!haystack.includes(search)) return false;
    }

    return true;
  });

  const sort = $('sort-pendencias')?.value || 'data-desc';
  const textCompare = (a, b, direction = 1) => normalize(a).localeCompare(normalize(b), 'pt-BR', { numeric: true, sensitivity: 'base' }) * direction;
  const dateValue = p => {
    if (p.dataFalta) {
      const t = new Date(`${p.dataFalta}T00:00:00`).getTime();
      if (Number.isFinite(t)) return t;
    }
    const t = new Date(p.registradoEm || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  list.sort((a, b) => {
    switch (sort) {
      case 'data-asc': return dateValue(a) - dateValue(b);
      case 'data-desc': return dateValue(b) - dateValue(a);
      case 'numero-asc': return (Number(a.numeroPendencia) || 0) - (Number(b.numeroPendencia) || 0);
      case 'numero-desc': return (Number(b.numeroPendencia) || 0) - (Number(a.numeroPendencia) || 0);
      case 'cliente-asc': return textCompare(a.cliente, b.cliente, 1);
      case 'cliente-desc': return textCompare(a.cliente, b.cliente, -1);
      case 'cidade-asc': return textCompare(a.cidade, b.cidade, 1);
      case 'cidade-desc': return textCompare(a.cidade, b.cidade, -1);
      case 'motivo-asc': return textCompare(a.motivo, b.motivo, 1);
      case 'motivo-desc': return textCompare(a.motivo, b.motivo, -1);
      default: return dateValue(b) - dateValue(a);
    }
  });

  const hasFilters = Boolean(
    search || status !== 'todos' || dateStart || dateEnd || city || route ||
    number || client || reason || responsible || service || age
  );

  // A aba Pendências trabalha sempre com a base completa.
  // A rolagem interna da tabela controla a quantidade exibida na tela.
  return list;
}

function updatePendenciasTable() {
  const list = filterPendencias();
  const reason = $('filter-reason')?.value || '';
  const hasAnyFilter = Boolean(
    normalize($('search-input')?.value) ||
    $('status-filter')?.value !== 'todos' ||
    $('filter-date-start')?.value || $('filter-date-end')?.value ||
    $('filter-city')?.value || $('filter-route')?.value || $('filter-number')?.value ||
    $('filter-client')?.value || reason || $('filter-responsible')?.value ||
    $('filter-service')?.value || $('filter-age')?.value
  );

  const summary = $('pendencias-summary');
  if (summary) {
    if (reason) {
      summary.innerHTML = `<strong>${escapeHtml(list.length)}</strong> pendência(s) encontrada(s) para o motivo <strong>${escapeHtml(reason)}</strong>.`;
    } else if (hasAnyFilter) {
      summary.innerHTML = `<strong>${escapeHtml(list.length)}</strong> pendência(s) encontrada(s) com os filtros selecionados.`;
    } else {
      summary.innerHTML = `<strong>${escapeHtml(list.length)}</strong> pendência(s) cadastrada(s) no total.`;
    }
  }
  const tbody = $('pendencies-table');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="13"><div class="empty-state">Nenhuma pendência encontrada.</div></td></tr>';
    updateSelectedCount();
    return;
  }
  tbody.innerHTML = list.map(p => {
    const statusText = p.status === 'emrota' ? 'Em rota' : p.status === 'resolvido' ? 'Resolvido' : 'Pendente';
    const statusClass = p.status === 'emrota' ? 'status-emrota' : p.status === 'resolvido' ? 'status-resolvido' : 'status-pendente';
    const service = p.tipoServico === 'RECOLHER E ENTREGAR' ? 'Recolher / entregar' : p.tipoServico === 'SOMENTE RECOLHER' ? 'Somente recolher' : 'Somente entregar';
    const normalItems = Array.isArray(p.itens) ? p.itens : [];
    const serviceItems = [];
    if (p.itemRecolher || p.descricaoItemRecolher) serviceItems.push(`<span><strong>Recolher:</strong> ${escapeHtml(p.codigoItemRecolher || '-')} — ${escapeHtml(p.descricaoItemRecolher || p.itemRecolher || '-')} (${escapeHtml(p.quantidadeRecolher || 0)})</span>`);
    if (p.itemEntregar || p.descricaoItemEntregar) serviceItems.push(`<span><strong>Entregar:</strong> ${escapeHtml(p.codigoItemEntregar || '-')} — ${escapeHtml(p.descricaoItemEntregar || p.itemEntregar || '-')} (${escapeHtml(p.quantidadeEntregar || 0)})</span>`);
    const items = [...normalItems.map(i => `<span>${escapeHtml(i.codigo || '-')} — ${escapeHtml(i.descricao || '-')} (${escapeHtml(i.quantidade || 0)})</span>`), ...serviceItems].join('') || '<span>-</span>';
    return `<tr>
      <td><input type="checkbox" class="row-checkbox" data-id="${escapeHtml(p.id)}" ${selectedItems.has(p.id) ? 'checked' : ''}></td>
      <td><strong>${escapeHtml(p.numeroPendencia || '-')}</strong></td>
      <td><strong>${escapeHtml(p.cliente || '-')}</strong><br><small>${escapeHtml(p.clienteCodigo || '')}</small></td>
      <td>${escapeHtml(p.cidade || '-')}</td>
      <td>${escapeHtml(p.rota || '-')}</td>
      <td>${formatDate(p.registradoEm ? p.registradoEm.slice(0, 10) : '')}</td>
      <td>${formatDate(p.dataFalta)}</td>
      <td>${escapeHtml(p.responsavel || '-')}</td>
      <td>${escapeHtml(p.motivo || '-')}</td>
      <td><span class="service-badge">${escapeHtml(service)}</span></td>
      <td><span class="status ${statusClass}" onclick="changeStatus('${escapeHtml(p.id)}')">${statusText}</span></td>
      <td><div class="item-mini">${items}</div></td>
      <td>${escapeHtml(p.registradoPor || '-')}</td>
      <td><div class="action-buttons">
        ${can('edit') ? `<button class="action-btn edit" title="Editar pendência" aria-label="Editar pendência" type="button" onclick="editPendencia('${escapeHtml(p.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1-1 4 4-1L19.5 6.5a2.1 2.1 0 0 0-3-3Z"/></svg>
        </button>` : ''}
        ${can('delete') ? `<button class="action-btn delete" title="Excluir pendência" aria-label="Excluir pendência" type="button" onclick="deletePendencia('${escapeHtml(p.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>` : ''}
        ${can('print') ? `<button class="action-btn print" title="Imprimir pendência" aria-label="Imprimir pendência" type="button" onclick="printPendencia('${escapeHtml(p.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>
        </button>` : ''}
        <button class="action-btn copy" data-id="${escapeHtml(p.id)}" title="Copiar mensagem" aria-label="Copiar mensagem" type="button" onclick="copyPendenciaMessage('${escapeHtml(p.id)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div></td>
    </tr>`;
  }).join('');
  document.querySelectorAll('.row-checkbox').forEach(cb => cb.addEventListener('change', e => {
    if (e.target.checked) selectedItems.add(e.target.dataset.id); else selectedItems.delete(e.target.dataset.id);
    updateSelectedCount();
  }));
  updateSelectedCount();
}

function updateSelectedCount() {
  $('selected-count').textContent = `${selectedItems.size} selecionada(s)`;
  const checks = [...document.querySelectorAll('.row-checkbox')];
  $('header-checkbox').checked = checks.length > 0 && checks.every(cb => cb.checked);
}

async function deleteSelected() {
  if (!can('batchDelete')) return alert('Você não possui permissão para excluir em lote.');
  if (!selectedItems.size) return alert('Nenhuma pendência selecionada.');
  if (!confirm(`Excluir ${selectedItems.size} pendência(s)?`)) return;
  const updates = {};
  selectedItems.forEach(id => { updates[`pendencias/${id}`] = null; });
  await db.ref().update(updates);
  selectedItems.clear();
}

async function deleteAllPendencias() {
  if (!can('deleteAll')) return alert('Você não possui permissão para excluir todas.');
  const total = Object.keys(pendencias).length;
  if (!total) return alert('Não há pendências.');
  if (!confirm(`Excluir todas as ${total} pendências?`)) return;
  if (prompt('Digite EXCLUIR para confirmar:') !== 'EXCLUIR') return;
  await pendenciasRef.set(null);
  selectedItems.clear();
}

/* ============================================================
   11. DASHBOARD E GRÁFICO DE TEMPO
   ============================================================ */
function calculateAgeMetrics() {
  const open = Object.values(pendencias).filter(p => p && p.status !== 'resolvido');
  return {
    more7: open.filter(p => daysOpen(p) > 7).length,
    more15: open.filter(p => daysOpen(p) > 15).length,
    more30: open.filter(p => daysOpen(p) > 30).length,
    buckets: [
      open.filter(p => daysOpen(p) <= 7).length,
      open.filter(p => daysOpen(p) > 7 && daysOpen(p) <= 15).length,
      open.filter(p => daysOpen(p) > 15 && daysOpen(p) <= 30).length,
      open.filter(p => daysOpen(p) > 30).length
    ]
  };
}

function updateDashboard() {
  const all = Object.values(pendencias);
  $('total-count').textContent = all.length;
  $('pending-count').textContent = all.filter(p => p.status === 'pendente').length;
  $('emrota-count').textContent = all.filter(p => p.status === 'emrota').length;
  $('resolved-count').textContent = all.filter(p => p.status === 'resolvido').length;

  const age = calculateAgeMetrics();
  $('age-7-count').textContent = age.more7;
  $('age-15-count').textContent = age.more15;
  $('age-30-count').textContent = age.more30;
  renderAgeChart(age.buckets);

  const recent = getPendenciasArray().sort((a,b) => new Date(b.registradoEm || 0) - new Date(a.registradoEm || 0)).slice(0,5);
  $('dashboard-table').innerHTML = recent.length ? recent.map(p => {
    const statusText = p.status === 'emrota' ? 'Em rota' : p.status === 'resolvido' ? 'Resolvido' : 'Pendente';
    const statusClass = p.status === 'emrota' ? 'status-emrota' : p.status === 'resolvido' ? 'status-resolvido' : 'status-pendente';
    return `<tr><td><strong>${escapeHtml(p.numeroPendencia || '-')}</strong></td><td>${escapeHtml(p.cliente || '-')}</td><td>${escapeHtml(p.rota || '-')}</td><td>${formatDate(p.dataFalta)}</td><td><span class="status ${statusClass}">${statusText}</span></td></tr>`;
  }).join('') : '<tr><td colspan="5"><div class="empty-state">Nenhuma pendência registrada.</div></td></tr>';
}

function renderAgeChart(data) {
  const canvas = $('age-chart');
  if (!canvas) return;
  if (ageChart) ageChart.destroy();
  ageChart = new Chart(canvas, {
    type: 'bar',
    data: { labels: ['Até 7 dias', '8 a 15 dias', '16 a 30 dias', 'Mais de 30 dias'], datasets: [{ label: 'Pendências em aberto', data }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
    }
  });
}

/* ============================================================
   12. BAIXAR / IMPRIMIR
   ============================================================ */
async function baixarPendencia() {
  if (!can('baixarPendencia')) return alert('Você não possui permissão para baixar pendências.');
  const numero = $('baixar-numero').value.trim();
  if (!numero) return alert('Informe o número da pendência.');
  const entry = Object.entries(pendencias).find(([, p]) => String(p.numeroPendencia) === String(numero));
  if (!entry) return alert('Pendência não encontrada.');
  const [id, p] = entry;
  if (p.status === 'resolvido') return alert('Esta pendência já está resolvida.');
  await pendenciasRef.child(id).update({ status: 'resolvido', dataBaixa: new Date().toISOString(), baixadoPor: users[currentUser]?.name || currentUser });
  $('baixar-numero').value = '';
  showMessage('baixar-mensagem', `Pendência ${numero} baixada com sucesso.`);
}

function buildPrintHtml(p) {
  const items = Array.isArray(p.itens) ? p.itens : [];
  const service = String(p.tipoServico || '').trim() || '-';
  const serviceUpper = service.toUpperCase();
  const serviceLabel = serviceUpper === 'RECOLHER E ENTREGAR' ? 'ATENÇÃO: RECOLHER E ENTREGAR' :
    serviceUpper === 'SOMENTE RECOLHER' ? 'ATENÇÃO: SOMENTE RECOLHER' :
    serviceUpper === 'SOMENTE ENTREGAR' ? 'ATENÇÃO: SOMENTE ENTREGAR' :
    serviceUpper;
  const logoDataUri = 'data:image/png;base64,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';

  // Organiza os itens por operação para a impressão.
  // Cada linha mostra claramente RECOLHER ou ENTREGAR na coluna OPERAÇÃO.
  const hasSpecificRecolher = !!(p.codigoItemRecolher || p.itemRecolher || p.descricaoItemRecolher);
  const hasSpecificEntregar = !!(p.codigoItemEntregar || p.itemEntregar || p.descricaoItemEntregar);

  let recolherItems = [];
  let entregarItems = [];

  if (serviceUpper === 'SOMENTE RECOLHER' || serviceUpper === 'RECOLHER E ENTREGAR') {
    if (hasSpecificRecolher) {
      recolherItems.push({
        codigo: p.codigoItemRecolher || p.itemRecolher || '-',
        descricao: p.descricaoItemRecolher || p.itemRecolher || '-',
        quantidade: p.quantidadeRecolher || '-'
      });
    }
  }

  if (serviceUpper === 'SOMENTE ENTREGAR' || serviceUpper === 'RECOLHER E ENTREGAR') {
    if (hasSpecificEntregar) {
      entregarItems.push({
        codigo: p.codigoItemEntregar || p.itemEntregar || '-',
        descricao: p.descricaoItemEntregar || p.itemEntregar || '-',
        quantidade: p.quantidadeEntregar || '-'
      });
    }
  }

  // Compatibilidade com registros antigos que só possuem p.itens.
  if (!hasSpecificRecolher && !hasSpecificEntregar && items.length) {
    const genericItems = items.map(i => ({
      codigo: i.codigo || '-',
      descricao: i.descricao || '-',
      quantidade: i.quantidade || '-'
    }));

    if (serviceUpper === 'SOMENTE RECOLHER') {
      recolherItems = genericItems;
    } else if (serviceUpper === 'SOMENTE ENTREGAR') {
      entregarItems = genericItems;
    } else if (serviceUpper === 'RECOLHER E ENTREGAR') {
      genericItems.forEach((item, index) => {
        if (index === 0) recolherItems.push(item);
        else entregarItems.push(item);
      });
    }
  }

  const makeRows = (list, operation) => list.map(i => {
    const opClass = operation === 'RECOLHER' ? 'op-recolher' : 'op-entregar';
    return `<tr><td class="operation ${opClass}"><strong>${operation}</strong></td><td>${escapeHtml(i.codigo)}</td><td>${escapeHtml(i.descricao)}</td><td class="qty">${escapeHtml(i.quantidade)}</td></tr>`;
  }).join('');

  let rows = '';
  rows += makeRows(recolherItems, 'RECOLHER');
  rows += makeRows(entregarItems, 'ENTREGAR');
  if (!rows) rows = '<tr><td colspan="4">Nenhum item informado.</td></tr>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 12mm 10mm 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #172033;
    background: #fff;
    font-family: "Courier New", monospace;
    font-size: 12px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    position: relative;
    min-height: 270mm;
    overflow: hidden;
    isolation: isolate;
  }


  .content {
    position: relative;
    z-index: 10;
  }

  .header {
    text-align: center;
    padding: 2px 0 10px;
    border-bottom: 2px solid #e87512;
    margin-bottom: 20px;
  }
  .print-logo {
    display: block;
    width: 320px;
    max-width: 72%;
    height: auto;
    max-height: 125px;
    object-fit: contain;
    margin: 8px auto 10px;
  }
  .brand { color: #e87512; font-size: 27px; font-weight: 800; letter-spacing: .5px; }
.title {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 1.5px;
  text-align: center;
}  .client-box {
    border: 1px solid #d7dde5;
    border-radius: 5px;
    background: rgba(248,250,252,.91);
    padding: 13px 14px;
    margin-bottom: 20px;
  }
  .client-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 32px;
    row-gap: 7px;
  }
  .info { display: grid; grid-template-columns: 100px 1fr; gap: 5px; min-width: 0; }
  .info.full { grid-column: 1 / -1; }
  .label { font-weight: 700; }
  .value { word-break: break-word; }
  .alert {
    border: 2px solid #ffb000;
    border-radius: 5px;
    background: rgba(255,244,194,.93);
    text-align: center;
    font-weight: 700;
    font-size: 13px;
    padding: 13px 10px;
    margin-bottom: 20px;
  }
  .alert::before, .alert::after { content: "⚠"; margin: 0 16px; font-family: Arial, sans-serif; }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 20px;
  }
  th {
    background: #2f4356;
    color: #fff;
    border: 1px solid #2f4356;
    padding: 10px 8px;
    font-size: 11px;
    text-align: center;
  }
  td {
    border: 1px solid #d5dbe2;
    padding: 10px 9px;
    background: rgba(255,255,255,.84);
    vertical-align: top;
    word-break: break-word;
  }
  th:nth-child(1), td:nth-child(1) { width: 20%; }
  th:nth-child(2), td:nth-child(2) { width: 18%; }
  th:nth-child(3), td:nth-child(3) { width: 47%; }
  th:nth-child(4), td:nth-child(4) { width: 15%; text-align: center; }
  .operation { text-align: center; vertical-align: middle; font-weight: 800; font-size: 10px; letter-spacing: .2px; }
  .operation strong { display: block; padding: 7px 4px; }
  .op-recolher { background: rgba(255, 235, 210, .96) !important; color: #a34a00; }
  .op-entregar { background: rgba(220, 238, 255, .96) !important; color: #155eef; }
  .section-row td { padding: 8px 10px; font-weight: 800; font-size: 11px; letter-spacing: .3px; border-top: 2px solid #172033; }
  .section-recolher td { background: rgba(255, 235, 210, .98) !important; color: #a34a00; }
  .section-entregar td { background: rgba(220, 238, 255, .98) !important; color: #155eef; }
  .obs {
    background: rgba(242,244,247,.94);
    border-left: 3px solid #e87512;
    padding: 12px 12px;
    min-height: 50px;
    margin-bottom: 70px;
    white-space: pre-wrap;
    line-height: 1.35;
  }
  .obs-title { font-weight: 700; margin-bottom: 3px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 35px; }
  .signature { text-align: center; }
  .line { border-top: 1px solid #172033; height: 18px; }
  .signature-name { font-size: 11px; }
  .footer { display: none; }
  @media print {
    html, body {
      background: #fff !important;
    }
    .sheet {
      min-height: 270mm !important;
      position: relative !important;
      overflow: hidden !important;
    }
    .print-logo {
      display: block !important;
      width: 320px !important;
      max-width: 72% !important;
      height: auto !important;
      max-height: 125px !important;
      object-fit: contain !important;
      margin: 8px auto 10px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="content">
    <div class="header">
      <div class="brand">DISLAM Distribuidora</div>
      <img class="print-logo" src="${logoDataUri}" alt="DISLAM" width="360" height="120">
      <div class="title">PENDÊNCIA Nº ${escapeHtml(p.numeroPendencia || '-')}</div>
    </div>

    <div class="client-box">
      <div class="client-grid">
        <div class="info"><span class="label">Código:</span><span class="value">${escapeHtml(p.clienteCodigo || '-')}</span></div>
        <div class="info"><span class="label">Cliente:</span><span class="value">${escapeHtml(p.cliente || '-')}</span></div>
        <div class="info"><span class="label">Nome<br>Fantasia:</span><span class="value">${escapeHtml(p.fantasia || '-')}</span></div>
        <div class="info"><span class="label">Telefone:</span><span class="value">${escapeHtml(p.telefone || '-')}</span></div>
        <div class="info full"><span class="label">Endereço:</span><span class="value">${escapeHtml(p.endereco || '-')}</span></div>
        <div class="info"><span class="label">Bairro:</span><span class="value">${escapeHtml(p.bairro || '-')}</span></div>
        <div class="info"><span class="label">Cidade:</span><span class="value">${escapeHtml(p.cidade || '-')}</span></div>
        <div class="info"><span class="label">Data da<br>Falta:</span><span class="value">${formatDate(p.dataFalta)}</span></div>
      </div>
    </div>

    <div class="alert">${escapeHtml(serviceLabel)}</div>

    <table>
      <thead><tr><th>OPERAÇÃO</th><th>CÓDIGO</th><th>DESCRIÇÃO DO ITEM</th><th>QTD</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="obs">
      <div class="obs-title">📝 OBSERVAÇÃO:</div>
      ${escapeHtml(p.observacao || 'Nenhuma observação.')}
    </div>

    <div class="signatures">
      <div class="signature"><div class="line"></div><div class="signature-name">Assinatura do Cliente</div></div>
      <div class="signature"><div class="line"></div><div class="signature-name">Assinatura do Responsável</div></div>
    </div>
  </div>
</div>
</body>
</html>`;
}

window.printPendencia = id => {
  if (!can('print')) return alert('Você não possui permissão para imprimir.');
  const p = pendencias[id];
  if (!p) return;
  const win = window.open('', '_blank');
  if (!win) return alert('O navegador bloqueou a janela de impressão.');
  win.document.write(buildPrintHtml(p));
  win.document.close();
  win.focus();
  try { win.document.title = ''; } catch (_) {}
  const printAfterImages = () => {
    const images = Array.from(win.document.images || []);
    if (!images.length) {
      setTimeout(() => win.print(), 100);
      return;
    }
    let remaining = images.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) setTimeout(() => win.print(), 150);
    };
    images.forEach(img => {
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
  };
  setTimeout(printAfterImages, 50);
};

function printSelected() {
  if (!can('print')) return alert('Você não possui permissão para imprimir.');
  if (!selectedItems.size) return alert('Nenhuma pendência selecionada.');
  const html = [...selectedItems].map(id => pendencias[id]).filter(Boolean).map(buildPrintHtml).join('<div style="page-break-after:always"></div>');
  const win = window.open('', '_blank');
  if (!win) return alert('O navegador bloqueou a janela de impressão.');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    const images = Array.from(win.document.images || []);
    const wait = images.filter(img => !img.complete).map(img => new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }));
    Promise.all(wait).then(() => setTimeout(() => win.print(), 150));
  }, 50);
}

/* ============================================================
   IMPORTANTE SOBRE CABEÇALHO/RODAPÉ DO NAVEGADOR
   A data/hora, "about:blank" e "1/1" mostrados na impressão são
   cabeçalho/rodapé automáticos do navegador. Eles NÃO pertencem ao
   HTML da pendência e não podem ser removidos por JavaScript/CSS.
   No diálogo de impressão, desative "Cabeçalhos e rodapés".
   ============================================================ */

/* ============================================================
   13. EXPORTAÇÃO
   ============================================================ */
function exportCSV() {
  if (!can('export')) return alert('Você não possui permissão para exportar.');
  const list = filterPendencias();
  if (!list.length) return alert('Não há dados para exportar.');
  const headers = ['Numero','Cliente Codigo','Cliente','Cidade','Data Falta','Responsavel','Motivo','Tipo Servico','Status','Itens','Registrado Por','Registrado Em'];
  const rows = list.map(p => [p.numeroPendencia,p.clienteCodigo,p.cliente,p.cidade,p.rota,p.registradoEm,p.dataFalta,p.responsavel,p.motivo,p.tipoServico,p.status,[...(p.itens || []).map(i => `${i.codigo || ''} - ${i.descricao || ''} (${i.quantidade || 0})`), ...(p.itemRecolher ? [`Recolher: ${p.itemRecolher} (${p.quantidadeRecolher || 0})`] : []), ...(p.itemEntregar ? [`Entregar: ${p.itemEntregar} (${p.quantidadeEntregar || 0})`] : [])].join(' | '),p.registradoPor,p.registradoEm]);
  const csv = [headers,...rows].map(row => row.map(value => `"${String(value ?? '').replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`pendencias-${getTodayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
}

/* ============================================================
   14. USUÁRIOS E PERMISSÕES
   ============================================================ */
function renderUsersList() {
  const container = $('users-list');
  if (!container) return;
  const entries = Object.entries(users).filter(([username]) => username !== currentUser);
  if (!entries.length) { container.innerHTML = '<div class="empty-state">Nenhum outro usuário cadastrado.</div>'; return; }
  container.innerHTML = entries.map(([username, user]) => {
    const permissions = user.permissions || {};
    return `<div class="user-item"><div class="user-head"><div class="user-main"><strong>${escapeHtml(username)}</strong><small>${escapeHtml(user.name || '')}</small><span class="badge ${user.role === 'admin' ? 'admin' : 'user'}">${user.role === 'admin' ? 'Administrador' : 'Usuário'}</span></div><div class="user-actions"><button class="btn btn-secondary" type="button" onclick="resetUserPassword('${escapeHtml(username)}')">Resetar senha</button><button class="btn btn-danger" type="button" onclick="deleteUser('${escapeHtml(username)}')">Excluir</button></div></div><div class="permissions">${permissoesLista.map(([id,label]) => `<label class="perm"><input type="checkbox" data-user="${escapeHtml(username)}" data-perm="${id}" ${permissions[id] ? 'checked' : ''}>${escapeHtml(label)}</label>`).join('')}</div></div>`;
  }).join('');
  container.querySelectorAll('.perm input').forEach(cb => cb.addEventListener('change', async e => {
    const username = e.target.dataset.user, permission = e.target.dataset.perm;
    if (!users[username]) return;
    users[username].permissions = users[username].permissions || {};
    users[username].permissions[permission] = e.target.checked;
    await usersRef.set(users);
  }));
}

window.resetUserPassword = async username => {
  if (users[currentUser]?.role !== 'admin') return;
  const pass = prompt(`Nova senha para ${username}:`);
  if (!pass) return;
  if (pass.length < 4) return alert('A senha deve ter pelo menos 4 caracteres.');
  users[username].password = pass;
  await usersRef.set(users);
  alert('Senha alterada.');
};
window.deleteUser = async username => {
  if (users[currentUser]?.role !== 'admin') return;
  if (!confirm(`Excluir o usuário ${username}?`)) return;
  delete users[username];
  await usersRef.set(users);
  renderUsersList();
};

async function createUser(event) {
  event.preventDefault();
  if (users[currentUser]?.role !== 'admin') return alert('Apenas administradores podem criar usuários.');
  const username = $('new-username').value.trim();
  const password = $('new-password-admin').value;
  const role = $('new-role').value;
  if (!username || !password) return;
  if (users[username]) return alert('Esse usuário já existe.');
  users[username] = { password, name: username, role, permissions: { create:true, edit:false, delete:false, changeStatus:true, export:true, importClientes:false, importItens:false, batchDelete:false, deleteAll:false, manageUsers:false, print:true, baixarPendencia:true } };
  await usersRef.set(users);
  $('create-user-form').reset();
  renderUsersList();
  alert('Usuário criado com sucesso.');
}

async function changeOwnPassword(event) {
  event.preventDefault();
  const username = $('change-username').value.trim();
  const current = $('current-password').value;
  const next = $('new-password').value;
  const confirmNext = $('confirm-new-password').value;
  const error = $('change-password-error');
  error.textContent = '';
  if (next !== confirmNext) return error.textContent = 'As senhas não coincidem.';
  if (!users[username]) return error.textContent = 'Usuário não encontrado.';
  if (users[username].password !== current) return error.textContent = 'Senha atual incorreta.';
  if (next.length < 4) return error.textContent = 'A nova senha deve ter pelo menos 4 caracteres.';
  users[username].password = next;
  await usersRef.set(users);
  alert('Senha alterada com sucesso.');
  $('change-password-form').reset();
  $('change-password-form').classList.add('hidden');
  $('login-form-wrap').classList.remove('hidden');
  if (currentUser === username) logout();
}

/* ============================================================
   15. BACKUP E SEGURANÇA
   ============================================================ */
function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateBackupInfo() {
  const info = $('last-backup-info');
  if (!info) return;
  const last = localStorage.getItem('dislamLastBackup');
  info.textContent = last ? `Último backup: ${formatDateTime(last)}` : 'Nenhum backup realizado nesta sessão.';
}

async function createFullBackup() {
  if (users[currentUser]?.role !== 'admin') return alert('Apenas administradores podem fazer backup.');
  const button = $('create-backup-btn');
  if (button) { button.disabled = true; button.textContent = 'Preparando backup...'; }
  try {
    const snapshot = await db.ref('/').once('value');
    const root = snapshot.val() || {};
    const backup = {
      app: 'DISLAM - Controle de Pendências',
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      data: {
        clientes: root.clientes || {},
        itens: root.itens || {},
        pendencias: root.pendencias || {},
        users: root.users || {},
        config: root.config || {}
      }
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T','_').replace('Z','');
    downloadJsonFile(backup, `DISLAM-backup-${stamp}.json`);
    localStorage.setItem('dislamLastBackup', backup.createdAt);
    updateBackupInfo();
    alert('Backup concluído com sucesso. Guarde o arquivo em um local seguro.');
  } catch (error) {
    console.error(error);
    alert('Não foi possível criar o backup. Verifique a conexão com o Firebase.');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Fazer backup agora'; }
  }
}

async function restoreFullBackup() {
  if (users[currentUser]?.role !== 'admin') return alert('Apenas administradores podem restaurar backup.');
  const input = $('backup-file-input');
  const file = input?.files?.[0];
  if (!file) return alert('Selecione um arquivo de backup JSON.');
  if (!confirm('Atenção: a restauração substituirá os dados atuais de clientes, itens, pendências, usuários e configurações. Deseja continuar?')) return;
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup || backup.backupVersion !== 1 || !backup.data || typeof backup.data !== 'object') {
      throw new Error('Formato de backup inválido.');
    }
    const required = ['clientes','itens','pendencias','users','config'];
    if (!required.every(key => Object.prototype.hasOwnProperty.call(backup.data, key))) {
      throw new Error('O arquivo não possui a estrutura completa do sistema.');
    }
    const confirmText = prompt('Para confirmar a restauração, digite RESTAURAR:');
    if (confirmText !== 'RESTAURAR') return alert('Restauração cancelada.');
    await db.ref('/').update({
      clientes: backup.data.clientes || {},
      itens: backup.data.itens || {},
      pendencias: backup.data.pendencias || {},
      users: backup.data.users || {},
      config: backup.data.config || {}
    });
    await sessoesRef.set(null);
    alert(`Backup restaurado com sucesso.\nArquivo criado em: ${formatDateTime(backup.createdAt)}`);
    location.reload();
  } catch (error) {
    console.error(error);
    alert(`Não foi possível restaurar o backup. ${error.message || ''}`);
  }
}

/* ============================================================
   15. IMPORTAÇÕES
   ============================================================ */
function importClientes(file) {
  if (!can('importClientes')) return alert('Você não possui permissão para importar clientes.');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows.length < 2) return alert('Arquivo vazio.');
      const novos = {};
      for (let i=1; i<rows.length; i++) {
        const row = rows[i]; const codigo = row[3] || row[0];
        if (!codigo) continue;
        const key = String(codigo).trim();
        novos[key] = { codigo:key, nome:row[1] || '', fantasia:row[2] || '', cidade:row[4] || '', endereco:row[5] || '', telefone:row[6] || '', bairro:row[7] || '' };
      }
      await clientesRef.update(novos); alert(`${Object.keys(novos).length} clientes importados.`);
    } catch (error) { console.error(error); alert('Não foi possível ler o arquivo.'); }
  };
  reader.readAsArrayBuffer(file);
}

function importItens(file) {
  if (!can('importItens')) return alert('Você não possui permissão para importar itens.');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows.length < 2) return alert('Arquivo vazio.');
      const headers = rows[0].map(v => normalize(v)); const idx = name => headers.indexOf(normalize(name));
      const novos = {};
      for (let i=1; i<rows.length; i++) {
        const row = rows[i]; const codigo = row[idx('codigo')] || row[0];
        if (!codigo) continue;
        const key = String(codigo).trim();
        novos[key] = { codigo:key, descricao:row[idx('descricao')] || row[idx('descrição')] || row[1] || '', unidade:row[idx('unidade')] || '', valor:row[idx('valor')] || '' };
      }
      await itensRef.update(novos); alert(`${Object.keys(novos).length} itens importados.`);
    } catch (error) { console.error(error); alert('Não foi possível ler o arquivo.'); }
  };
  reader.readAsArrayBuffer(file);
}

/* ============================================================
   16. CARREGAMENTO DO FIREBASE
   ============================================================ */
function startFirebaseListeners() {
  clientesRef.on('value', snapshot => { clientesDB = snapshot.val() || {}; renderClientesList(); });
  itensRef.on('value', snapshot => { itensDB = snapshot.val() || {}; renderItemsList(); });
  pendenciasRef.on('value', snapshot => { pendencias = snapshot.val() || {}; calculateNextNumber(); populateFilterOptions(); updateDashboard(); updatePendenciasTable(); });
  usersRef.on('value', snapshot => {
    const stored = snapshot.val() || {};
    users = { ...usuariosIniciais, ...stored };
    if (currentUser && users[currentUser]) currentPermissions = users[currentUser].permissions || {};
    if (users[currentUser]?.role === 'admin') renderUsersList();
  });
}

/* ============================================================
   17. EVENTOS DA INTERFACE
   ============================================================ */
function bindEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('whatsapp-modal') && !$('whatsapp-modal').classList.contains('hidden')) closeWhatsAppModal();
  });
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => navigateTo(item.dataset.page)));
  document.querySelectorAll('[data-page-target]').forEach(btn => btn.addEventListener('click', () => {
    const page = btn.dataset.pageTarget;
    if (page === 'nova-page') openNewPendencia(); else navigateTo(page);
  }));

  $('sidebar-toggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));
  $('logout-button').addEventListener('click', logout);
  $('account-logout').addEventListener('click', logout);

  $('login-form').addEventListener('submit', async e => { e.preventDefault(); await login($('login-username').value.trim(), $('login-password').value); });
  $('show-change-password').addEventListener('click', () => { $('login-form-wrap').classList.add('hidden'); $('change-password-form').classList.remove('hidden'); });
  $('cancel-change-password').addEventListener('click', () => { $('change-password-form').reset(); $('change-password-form').classList.add('hidden'); $('login-form-wrap').classList.remove('hidden'); });
  $('change-password-form').addEventListener('submit', changeOwnPassword);

  $('pendencia-form').addEventListener('submit', savePendencia);
  $('cancel-button').addEventListener('click', () => navigateTo('pendencias-page'));
  $('add-item-btn').addEventListener('click', addItemToPendencia);
  $('tipo-servico-input').addEventListener('change', updateServiceDetailFields);
  updateServiceDetailFields();
  $('item-codigo-input').addEventListener('blur', () => fillItemByCode($('item-codigo-input').value));
  // Código do item: se existir no cadastro, a descrição é preenchida automaticamente.
  // Se não existir, a descrição continua livre para o usuário digitar.
  $('recolher-codigo-input')?.addEventListener('blur', e => fillServiceItemByCode(e.target.value, 'recolher'));
  $('recolher-codigo-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fillServiceItemByCode(e.target.value, 'recolher');
      $('recolher-descricao-input')?.focus();
    }
  });
  $('entregar-codigo-input')?.addEventListener('blur', e => fillServiceItemByCode(e.target.value, 'entregar'));
  $('entregar-codigo-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fillServiceItemByCode(e.target.value, 'entregar');
      $('entregar-descricao-input')?.focus();
    }
  });
  // Descrições permanecem livres para edição manual, inclusive depois do preenchimento automático.
  $('recolher-descricao-input')?.addEventListener('input', e => {
    currentRecolherItem.descricao = e.target.value;
  });
  $('entregar-descricao-input')?.addEventListener('input', e => {
    currentEntregarItem.descricao = e.target.value;
  });
  $('numero-pendencia-input')?.addEventListener('input', e => {
    e.target.readOnly = false;
  });
  $('cliente-codigo').addEventListener('blur', () => {
    const code = $('cliente-codigo').value.trim();
    if (code && !fillClientByCode(code)) $('cliente-nome').focus();
  });
  $('item-codigo-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('item-descricao-input').focus(); } });
  $('item-descricao-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('item-quantidade-input').focus(); } });
  $('item-quantidade-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItemToPendencia(); } });

  // Enter navega entre campos de texto/selects em vez de submeter o formulário.
  $('pendencia-form').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.id === 'item-quantidade-input') return;
    if (e.target.type === 'submit' || e.target.type === 'button') return;
    const fields = [...$('pendencia-form').querySelectorAll('input:not([type="hidden"]), select, textarea')]
      .filter(field => !field.disabled && !field.readOnly && field.offsetParent !== null);
    const index = fields.indexOf(e.target);
    if (index >= 0 && fields[index + 1]) {
      e.preventDefault();
      fields[index + 1].focus();
    }
  });

  $('search-input').addEventListener('input', updatePendenciasTable);
  $('status-filter').addEventListener('change', updatePendenciasTable);


  // Os indicadores do Dashboard funcionam como atalhos de filtro.
  document.querySelectorAll('[data-age-filter]').forEach(button => {
    button.addEventListener('click', () => {
      const age = button.dataset.ageFilter;
      $('filter-age').value = age;
      navigateTo('pendencias-page');
      updatePendenciasTable();
    });
  });

  [
    'filter-date-start', 'filter-date-end', 'filter-city', 'filter-route',
    'filter-number', 'filter-client', 'filter-reason', 'filter-responsible',
    'filter-service', 'filter-age'
  ].forEach(id => {
    const element = $(id);
    if (!element) return;
    element.addEventListener('input', updatePendenciasTable);
    element.addEventListener('change', updatePendenciasTable);
  });
  if ($('sort-pendencias')) $('sort-pendencias').addEventListener('change', updatePendenciasTable);

  $('clear-filters-btn').addEventListener('click', () => {
    [
      'filter-date-start', 'filter-date-end', 'filter-city', 'filter-route',
      'filter-number', 'filter-client'
    ].forEach(id => { if ($(id)) $(id).value = ''; });

    $('filter-reason').value = '';
    $('filter-responsible').value = '';
    $('filter-service').value = '';
    $('filter-age').value = '';
    if ($('sort-pendencias')) $('sort-pendencias').value = 'data-desc';
    $('search-input').value = '';
    $('status-filter').value = 'todos';
    updatePendenciasTable();
  });
  $('header-checkbox').addEventListener('change', e => { document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = e.target.checked; if (e.target.checked) selectedItems.add(cb.dataset.id); else selectedItems.delete(cb.dataset.id); }); updateSelectedCount(); });
  $('select-all-btn').addEventListener('click', () => { document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked=true; selectedItems.add(cb.dataset.id); }); updateSelectedCount(); });
  $('deselect-all-btn').addEventListener('click', () => { document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked=false); selectedItems.clear(); updateSelectedCount(); });
  $('delete-selected-btn').addEventListener('click', deleteSelected);
  $('delete-all-btn').addEventListener('click', deleteAllPendencias);
  $('export-button').addEventListener('click', exportCSV);
  $('print-selected-btn').addEventListener('click', printSelected);
  $('btn-baixar-pendencia').addEventListener('click', baixarPendencia);

  $('clientes-search').addEventListener('input', renderClientesList);
  $('itens-search').addEventListener('input', renderItemsList);
  $('delete-all-clientes-btn').addEventListener('click', deleteAllClientes);
  $('delete-all-itens-btn').addEventListener('click', deleteAllItens);
  $('create-user-form').addEventListener('submit', createUser);

  $('create-backup-btn').addEventListener('click', createFullBackup);
  $('restore-backup-btn').addEventListener('click', restoreFullBackup);

  $('import-clientes-btn').addEventListener('click', () => { const file=$('client-file').files[0]; if(file) importClientes(file); else alert('Selecione uma planilha de clientes.'); });
  $('import-itens-btn').addEventListener('click', () => { const file=$('item-file').files[0]; if(file) importItens(file); else alert('Selecione uma planilha de itens.'); });
}

/* ============================================================
   18. INICIALIZAÇÃO
   ============================================================ */
(async function init() {
  bindEvents();
  updateSelects();
  populateFilterOptions();
  resetPendenciaForm();
  startFirebaseListeners();
  await loadDynamicLists();
  checkAutoLogin();
})();

