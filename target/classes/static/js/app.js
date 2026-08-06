const state = {
  graph: { nodes: [], edges: [], warnings: [] },
  selected: null,
  positions: new Map(),
  expanded: new Set(),
  transform: { x: 0, y: 0, k: 1 },
  pathStart: null,
  path: [],
  pathEdges: new Set(),
  draggingNode: null,
  panning: false,
  movedDuringPointer: false,
  pointerStart: null,
  analysisController: null,
  analysisTimer: null,
  analysisStartedAt: 0,
  entryPoint: null,
  depth: 1,
  showFullGraph: false,
  enabledEdgeTypes: new Set(),
  focusRoot: null,
  focusHistory: [],
  animationFrame: null,
  rootOnly: true,
  navigationHistory: [],
  threeD: false,
  threeDBackground: readCookie('sge-3d-background') || 'neutral',
  rotation: { x: 0, y: 0 },
  rotating: false,
  graph3d: null,
  contextNodeId: null,
  contextSelection: new Set(),
  last3dClick: { id: null, at: 0 },
  clickTimer: null,
  activeView: 'graph',
  functionalFlow: { nodes: [], edges: [] },
  flowRoot: null,
  flowHistory: [],
  flowTree: null,
  flowVisibleTypes: new Set(),
  flowBuildTimer: null,
  graphWindow: null,
  standaloneGraphWindow: new URLSearchParams(window.location.search).get('graphWindow') === '1',
  chatMessages: [],
  chatBusy: false,
  chatTraceStartedAt: 0,
  chatController: null,
  chatRequestId: null,
  chatStopRequested: false,
  ragIndexBuilding: false,
  ragIndexCancelling: false,
  ragIndexPollTimer: null
};

const svg = document.querySelector('#graph');
const ns = 'http://www.w3.org/2000/svg';
const byId = id => document.getElementById(id);
const graphStage = byId('graphStage');
const graphPanel = graphStage.closest('.graph-panel');

const viewport = document.createElementNS(ns, 'g');
viewport.setAttribute('id', 'graphViewport');
svg.append(viewport);

byId('analyzeButton').addEventListener('click', analyzeProject);
byId('searchInput').addEventListener('input', () => { state.expanded.clear(); render(); });
byId('focusToggle').addEventListener('change', render);
byId('resetButton').addEventListener('click', resetView);
byId('fitButton').addEventListener('click', () => fitGraphAnimated());
byId('zoomInButton').addEventListener('click', () => zoomAtCenter(1.25));
byId('zoomOutButton').addEventListener('click', () => zoomAtCenter(0.8));
byId('setPathStartButton').addEventListener('click', setPathStart);
byId('findPathButton').addEventListener('click', findPathToSelected);
byId('clearPathButton').addEventListener('click', clearPath);
byId('pathDirection').addEventListener('change', () => { if (state.path.length) findPathToSelected(); });
byId('cancelAnalysisButton').addEventListener('click', cancelAnalysis);
byId('entryPointSelect').addEventListener('change', onEntryPointChange);
byId('depthSelect').addEventListener('change', onDepthChange);
byId('focusBackButton').addEventListener('click', focusBack);
byId('focusHomeButton').addEventListener('click', focusHome);
byId('openGraphWindowButton').addEventListener('click', openGraphWindow);
byId('fullscreenButton').addEventListener('click', toggleFullscreen);
byId('threeDButton').addEventListener('click', toggleThreeD);
byId('resetRotationButton').addEventListener('click', resetRotation);
byId('reset3DPositionsButton').addEventListener('click', reset3DPositions);
byId('threeDBackground').value = state.threeDBackground;
byId('threeDBackground').addEventListener('change', event => {
  state.threeDBackground = event.target.value;
  writeCookie('sge-3d-background', state.threeDBackground, 365);
  draw3DScene();
});
byId('contextMenuClose').addEventListener('click', closeContextMenu);
byId('contextSelectAll').addEventListener('click', () => setContextSelection(true));
byId('contextSelectNone').addEventListener('click', () => setContextSelection(false));
byId('contextApply').addEventListener('click', applyContextSelection);
document.addEventListener('pointerdown', event => { if (!event.target.closest('#contextMenu')) closeContextMenu(); });
window.addEventListener('resize', () => { if (state.threeD) resize3DGraph(); });
byId('detailsToggleButton').addEventListener('click', () => setDetailsCollapsed(true));
byId('detailsOpenButton').addEventListener('click', () => setDetailsCollapsed(false));
byId('graphViewButton').addEventListener('click', () => setActiveView('graph'));
byId('flowViewButton').addEventListener('click', () => { setActiveView('flow'); buildFunctionalFlow(state.flowRoot || state.selected || state.focusRoot || state.entryPoint, true); });
byId('chatViewButton').addEventListener('click', () => { setActiveView('chat'); refreshChatContextLabel(); loadRagIndexStatus(); });
byId('refreshModelsButton').addEventListener('click', loadOllamaStatus);
byId('buildRagIndexButton').addEventListener('click', buildRagIndex);
byId('cancelRagIndexButton').addEventListener('click', cancelRagIndexBuild);
byId('clearChatButton').addEventListener('click', clearChat);
byId('exportChatButton').addEventListener('click', exportChatMarkdown);
byId('chatForm').addEventListener('submit', sendChatQuestion);
byId('stopChatButton').addEventListener('click', stopChatResponse);
byId('chatQuestion').addEventListener('keydown', event => { if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); byId('chatForm').requestSubmit(); } });
byId('refreshFlowButton').addEventListener('click', () => buildFunctionalFlow(state.flowRoot || state.selected || state.focusRoot || state.entryPoint, true));
byId('flowBackButton').addEventListener('click', flowBack);
byId('flowHomeButton').addEventListener('click', flowHome);
byId('printFlowButton').addEventListener('click', printFunctionalFlow);
byId('downloadMarkdownButton').addEventListener('click', downloadFunctionalFlowMarkdown);
setDetailsCollapsed(readCookie('sge-details-collapsed') === 'true', false);
loadOllamaStatus();
['showSelectors','showDomNodes','showAccessors'].forEach(id => {
  const input = byId(id);
  input.checked = readCookie(`sge-${id}`) === 'true';
  input.addEventListener('change', () => { writeCookie(`sge-${id}`, String(input.checked), 365); render(); });
});

svg.addEventListener('wheel', onWheel, { passive: false });
svg.addEventListener('pointerdown', onCanvasPointerDown);
svg.addEventListener('pointermove', onPointerMove);
svg.addEventListener('pointerup', onPointerUp);
svg.addEventListener('pointercancel', onPointerUp);


function createGraphWindowSnapshot() {
  return {
    graph: state.graph,
    selected: state.selected,
    positions: [...state.positions.entries()],
    expanded: [...state.expanded],
    transform: state.transform,
    pathStart: state.pathStart,
    path: state.path,
    pathEdges: [...state.pathEdges],
    entryPoint: state.entryPoint,
    depth: Number.isFinite(state.depth) ? state.depth : 'all',
    showFullGraph: state.showFullGraph,
    enabledEdgeTypes: [...state.enabledEdgeTypes],
    focusRoot: state.focusRoot,
    focusHistory: state.focusHistory,
    rootOnly: state.rootOnly,
    navigationHistory: state.navigationHistory,
    threeD: state.threeD,
    rotation: state.rotation,
    showSelectors: byId('showSelectors').checked,
    showDomNodes: byId('showDomNodes').checked,
    showAccessors: byId('showAccessors').checked,
    focusOnly: byId('focusToggle').checked
  };
}

function openGraphWindow() {
  if (!state.graph.nodes.length) {
    setStatus('Először elemezz egy projektet.', true);
    return;
  }
  if (state.graphWindow && !state.graphWindow.closed) {
    state.graphWindow.focus();
    state.graphWindow.postMessage({ type: 'sge-graph-snapshot', snapshot: createGraphWindowSnapshot() }, window.location.origin);
    return;
  }
  state.graphWindow = window.open('/?graphWindow=1', 'sourceGraphExplorerGraph', 'popup=yes,width=1500,height=950,resizable=yes,scrollbars=no');
  if (!state.graphWindow) {
    setStatus('A böngésző letiltotta a külön ablak megnyitását. Engedélyezd a felugró ablakokat ehhez az oldalhoz.', true);
  }
}

function applyGraphWindowSnapshot(snapshot) {
  state.graph = snapshot.graph || { nodes: [], edges: [], warnings: [] };
  state.positions = new Map(snapshot.positions || []);
  state.expanded = new Set(snapshot.expanded || []);
  state.pathEdges = new Set(snapshot.pathEdges || []);
  state.enabledEdgeTypes = new Set(snapshot.enabledEdgeTypes || []);
  state.selected = snapshot.selected || null;
  state.transform = snapshot.transform || { x: 0, y: 0, k: 1 };
  state.pathStart = snapshot.pathStart || null;
  state.path = snapshot.path || [];
  state.entryPoint = snapshot.entryPoint || null;
  state.depth = snapshot.depth === 'all' ? Infinity : Number(snapshot.depth || 1);
  state.showFullGraph = Boolean(snapshot.showFullGraph);
  state.focusRoot = snapshot.focusRoot || null;
  state.focusHistory = snapshot.focusHistory || [];
  state.rootOnly = Boolean(snapshot.rootOnly);
  state.navigationHistory = snapshot.navigationHistory || [];
  state.rotation = snapshot.rotation || { x: 0, y: 0 };

  byId('showSelectors').checked = Boolean(snapshot.showSelectors);
  byId('showDomNodes').checked = Boolean(snapshot.showDomNodes);
  byId('showAccessors').checked = Boolean(snapshot.showAccessors);
  byId('focusToggle').checked = Boolean(snapshot.focusOnly);
  byId('depthSelect').value = snapshot.depth === 'all' ? 'all' : String(snapshot.depth || 1);

  fillEdgeTypes();
  document.querySelectorAll('#edgeTypeFilters input[type=checkbox]').forEach(input => {
    input.checked = state.enabledEdgeTypes.has(input.value);
  });
  initializeEntryPoint();
  state.entryPoint = snapshot.entryPoint || state.entryPoint;
  state.focusRoot = snapshot.focusRoot || state.entryPoint;
  state.selected = snapshot.selected || state.focusRoot;
  state.rootOnly = Boolean(snapshot.rootOnly);
  state.showFullGraph = Boolean(snapshot.showFullGraph);
  state.expanded = new Set(snapshot.expanded || []);
  state.positions = new Map(snapshot.positions || []);
  state.transform = snapshot.transform || state.transform;
  state.enabledEdgeTypes = new Set(snapshot.enabledEdgeTypes || state.enabledEdgeTypes);
  byId('entryPointSelect').value = state.entryPoint || '';
  renderEdgeLegend();
  renderWarnings();
  showDetails(findNode(state.selected));
  setActiveView('graph');

  if (state.threeD) {
    state.threeD = false;
  }
  render();
  if (snapshot.threeD) toggleThreeD();
  else requestAnimationFrame(() => fitGraphAnimated(240));
  setStatus('A gráf külön ablakban megnyitva. Ez a nézet önállóan mozgatható és teljes képernyőre nagyítható.');
}

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'sge-graph-window-ready' && !state.standaloneGraphWindow) {
    event.source?.postMessage({ type: 'sge-graph-snapshot', snapshot: createGraphWindowSnapshot() }, event.origin);
  }
  if (event.data?.type === 'sge-graph-snapshot' && state.standaloneGraphWindow) {
    applyGraphWindowSnapshot(event.data.snapshot || {});
  }
});

function initializeStandaloneGraphWindow() {
  if (!state.standaloneGraphWindow) return;
  document.body.classList.add('graph-window-mode');
  document.title = 'Source Graph Explorer – Gráf';
  byId('openGraphWindowButton').hidden = true;
  setActiveView('graph');
  setDetailsCollapsed(true, false);
  if (window.opener) {
    window.opener.postMessage({ type: 'sge-graph-window-ready' }, window.location.origin);
  } else {
    setStatus('Ez a külön gráfablak a főablakból nyitható meg.');
  }
}

initializeStandaloneGraphWindow();

async function analyzeProject() {
  const file = byId('projectFile').files[0];
  if (!file) return setStatus('Válassz ki egy ZIP állományt.', true);
  const form = new FormData();
  form.append('file', file);
  state.analysisController = new AbortController();
  byId('analyzeButton').disabled = true;
  openAnalysisDialog(file);
  setStatus('A projekt elemzése folyamatban…');
  try {
    const response = await fetch('/api/analysis/zip', {
      method: 'POST',
      body: form,
      signal: state.analysisController.signal
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.detail || `HTTP ${response.status}`);
    }
    setAnalysisStage(3, 'A kapcsolati gráf megjelenítése…', 96);
    state.graph = await response.json();
    updateRagIndexStatus({ ready: false, building: false, model: 'qwen3-embedding:0.6b', documentCount: 0 });
    state.selected = null;
    state.positions.clear();
    state.expanded.clear();
    clearPathState();
    fillEdgeTypes();
    renderEdgeLegend();
    initializeEntryPoint();
    state.flowRoot = state.entryPoint;
    state.flowHistory = [];
    state.chatMessages = [];
    renderChatMessages();
    refreshChatContextLabel();
    render();
    buildFunctionalFlow();
    renderWarnings();
    requestAnimationFrame(fitGraph);
    const entry = findNode(state.entryPoint);
    setStatus(entry ? `Az elemzés elkészült: ${file.name} · belépési pont: ${entry.name} · mélység: ${state.depth}` : `Az elemzés elkészült: ${file.name}`);
    closeAnalysisDialog();
  } catch (error) {
    closeAnalysisDialog();
    if (error.name === 'AbortError') {
      setStatus('Az elemzést megszakítottad.');
    } else {
      setStatus(error.message, true);
    }
  } finally {
    state.analysisController = null;
    byId('analyzeButton').disabled = false;
  }
}

function openAnalysisDialog(file) {
  const dialog = byId('analysisDialog');
  byId('analysisFileName').textContent = `${file.name} · ${formatFileSize(file.size)}`;
  state.analysisStartedAt = Date.now();
  setAnalysisStage(0, 'Projekt feltöltése és kicsomagolása…', 12);
  clearInterval(state.analysisTimer);
  state.analysisTimer = window.setInterval(updateAnalysisProgress, 500);
  if (!dialog.open) dialog.showModal();
}

function updateAnalysisProgress() {
  const seconds = Math.floor((Date.now() - state.analysisStartedAt) / 1000);
  byId('analysisElapsed').textContent = `${seconds} mp`;
  if (seconds >= 2 && seconds < 6) setAnalysisStage(1, 'Forrásfájlok és nyelvi szintek felismerése…', Math.min(42, 22 + seconds * 3));
  else if (seconds >= 6 && seconds < 14) setAnalysisStage(2, 'Kapcsolatok, endpointok és selectorok feloldása…', Math.min(78, 43 + seconds * 2.4));
  else if (seconds >= 14) setAnalysisStage(2, 'A forrásgráf összeállítása…', Math.min(91, 76 + (seconds - 14) * .7));
}

function setAnalysisStage(index, label, progress) {
  byId('analysisStage').textContent = label;
  byId('analysisProgressBar').style.width = `${progress}%`;
  document.querySelectorAll('.analysis-steps i').forEach((step, stepIndex) => {
    step.classList.toggle('active', stepIndex <= index);
  });
}

function closeAnalysisDialog() {
  clearInterval(state.analysisTimer);
  state.analysisTimer = null;
  const dialog = byId('analysisDialog');
  if (dialog.open) dialog.close();
}

function cancelAnalysis() {
  if (!state.analysisController) return;
  byId('cancelAnalysisButton').disabled = true;
  byId('analysisStage').textContent = 'Az elemzés megszakítása…';
  state.analysisController.abort();
  window.setTimeout(() => { byId('cancelAnalysisButton').disabled = false; }, 300);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function initializeEntryPoint() {
  const select = byId('entryPointSelect');
  select.replaceChildren();
  const candidates = entryPointCandidates();
  candidates.forEach((node, index) => {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = `${index === 0 ? '★ ' : ''}${node.name} · ${node.type}`;
    select.append(option);
  });
  if (!candidates.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nem található belépési pont';
    select.append(option);
    state.entryPoint = null;
    state.showFullGraph = true;
    return;
  }
  state.entryPoint = candidates[0].id;
  state.focusRoot = state.entryPoint;
  state.focusHistory = [];
  state.navigationHistory = [];
  state.rootOnly = true;
  state.depth = Number(byId('depthSelect').value) || 1;
  state.showFullGraph = false;
  select.value = state.entryPoint;
  state.selected = state.entryPoint;
  showDetails(candidates[0]);
  setStatus(`Belépési pont: ${candidates[0].name}. Megjelenített mélység: ${state.depth}.`);
}

function entryPointCandidates() {
  const score = node => {
    const name = (node.name || '').toLowerCase();
    const path = (node.path || '').toLowerCase();
    if (node.type === 'JAVA_APPLICATION_ENTRY') return 100;
    if (node.type === 'SOURCE_FILE' && /(^|\/)index\.html$/.test(path)) return 90;
    if (node.type === 'SOURCE_FILE' && /(^|\/)(main|app)\.(js|ts|tsx)$/.test(path)) return 80;
    if (node.type === 'REST_ENDPOINT') return 75;
    if (node.type === 'JAVA_CONTROLLER') return 65;
    if (node.type === 'JAVA_CLASS' && /(application|main)$/.test(name)) return 70;
    if (node.type === 'HTML_PAGE') return 55;
    if (node.type === 'SOURCE_FILE' && /\.html?$/.test(path)) return 50;
    return 0;
  };
  return state.graph.nodes
    .map(node => ({ node, score: score(node) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name))
    .map(item => item.node);
}

function onEntryPointChange() {
  state.entryPoint = byId('entryPointSelect').value || null;
  state.focusRoot = state.entryPoint;
  state.focusHistory = [];
  state.showFullGraph = !state.entryPoint;
  state.selected = state.entryPoint;
  state.expanded.clear();
  state.navigationHistory = [];
  state.rootOnly = true;
  clearPathState();
  showDetails(findNode(state.entryPoint));
  render();
  fitGraph();
}

function onDepthChange() {
  const value = byId('depthSelect').value;
  state.depth = value === 'all' ? Infinity : Number(value);
  state.showFullGraph = false;
  state.rootOnly = false;
  state.expanded.clear();
  render();
  fitGraph();
}

function reachableFrom(startId, maxDepth) {
  if (!startId) return new Set();
  const visited = new Set([startId]);
  const queue = [{ id: startId, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    state.graph.edges.forEach(edge => {
      if (state.enabledEdgeTypes.size && !state.enabledEdgeTypes.has(edge.type)) return;
      let next = null;
      if (edge.source === current.id) next = edge.target;
      else if (edge.target === current.id) next = edge.source;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push({ id: next, depth: current.depth + 1 });
      }
    });
  }
  return visited;
}

function fillEdgeTypes() {
  const container = byId('edgeTypeFilters');
  container.replaceChildren();
  const saved = readCookie('sge-edge-types');
  const known = [...new Set(state.graph.edges.map(edge => edge.type))].sort();
  const savedTypes = saved ? new Set(saved.split(',').filter(Boolean)) : null;
  const noisyDefaults = new Set(['USES_SELECTOR', 'SELECTS_ELEMENT']);
  state.enabledEdgeTypes = new Set(known.filter(type => savedTypes ? savedTypes.has(type) : !noisyDefaults.has(type)));
  known.forEach(type => {
    const label = document.createElement('label');
    label.className = 'edge-filter-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = type;
    input.checked = state.enabledEdgeTypes.has(type);
    input.addEventListener('change', () => {
      if (input.checked) state.enabledEdgeTypes.add(type);
      else state.enabledEdgeTypes.delete(type);
      writeCookie('sge-edge-types', [...state.enabledEdgeTypes].join(','), 365);
      render();
    });
    const text = document.createElement('span');
    text.textContent = humanEdgeType(type);
    label.append(input, text);
    container.append(label);
  });
}

function humanEdgeType(type) {
  const labels = {
    CALLS_ENDPOINT: 'Frontend → API', EXPOSED_BY: 'API → Controller', CALLS: 'Metódushívás',
    CALLS_COMPONENT: 'Komponenshívás', INJECTS: 'Injektálás', USES_ENTITY: 'Repository → Entity',
    DECLARES: 'Tartalmaz', IMPORTS: 'Import', LOADS_SCRIPT: 'HTML → JS', LOADS_STYLESHEET: 'HTML → CSS',
    USES_SELECTOR: 'Selector', SELECTS_ELEMENT: 'DOM', EXTENDS: 'Öröklés', IMPLEMENTS: 'Interfész',
    CREATES: 'Létrehoz', SAME_ENDPOINT: 'Azonos API', SCANS_COMPONENT: 'Alkalmazás → Controller'
  };
  return labels[type] || type;
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const raw = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || '';
  return raw ? decodeURIComponent(raw) : '';
}

function writeCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function render() {
  viewport.replaceChildren();
  applyTransform();

  const query = byId('searchInput').value.trim().toLowerCase();
  const focus = byId('focusToggle').checked;
  const connected = directConnections(state.selected);

  const activeRoot = state.focusRoot || state.entryPoint;
  const scopeIds = state.rootOnly && activeRoot
    ? new Set([activeRoot])
    : state.showFullGraph || !activeRoot
      ? new Set(state.graph.nodes.map(node => node.id))
      : reachableFrom(activeRoot, state.depth);
  const baseIds = new Set();
  state.graph.nodes.forEach(node => {
    const text = `${node.name} ${node.type} ${node.path || ''}`.toLowerCase();
    const searchMatch = !query || text.includes(query);
    if (scopeIds.has(node.id) && searchMatch && isNodeVisibleByNoiseFilter(node)) baseIds.add(node.id);
  });

  const allowedIds = new Set(baseIds);
  state.expanded.forEach(id => allowedIds.add(id));
  state.path.forEach(id => allowedIds.add(id));

  let visibleNodes = state.graph.nodes.filter(node => allowedIds.has(node.id));
  if (focus && state.selected) {
    visibleNodes = visibleNodes.filter(node => connected.has(node.id) || state.path.includes(node.id));
  }

  const visibleIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = state.graph.edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target) && state.enabledEdgeTypes.has(e.type));
  ensurePositions(visibleNodes);

  visibleEdges.forEach((edge, index) => {
    const a = state.positions.get(edge.source), b = state.positions.get(edge.target);
    if (!a || !b) return;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    const edgeKey = `${edge.source}|${edge.target}|${edge.type}`;
    const reverseKey = `${edge.target}|${edge.source}|${edge.type}`;
    const active = edge.source === state.selected || edge.target === state.selected;
    const onPath = state.pathEdges.has(edgeKey) || state.pathEdges.has(reverseKey);
    line.setAttribute('class', `edge edge-${edgeCategory(edge.type)}${active ? ' active' : ''}${onPath ? ' path-edge' : ''}`);
    line.dataset.edgeIndex = String(index);
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${edge.type}: ${edge.detail || ''}`;
    line.append(title);
    viewport.append(line);
  });

  visibleNodes.forEach(node => {
    const p = state.positions.get(node.id);
    const g = document.createElementNS(ns, 'g');
    const nodeCategory = categoryForNode(node);
    const onPath = state.path.includes(node.id);
    g.setAttribute('class', `node node-${nodeCategory}${node.id === state.selected ? ' active' : ''}${onPath ? ' path-node' : ''}`);
    g.setAttribute('transform', `translate(${p.x} ${p.y})`);
    g.dataset.nodeId = node.id;

    const shape = createNodeShape(node, nodeCategory);
    const icon = document.createElementNS(ns, 'text');
    icon.setAttribute('class', 'node-icon');
    icon.setAttribute('y', String(-radius(node) * 0.30));
    icon.textContent = nodeIcon(node);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('class', 'node-label');
    const lines = wrapNodeLabel(node.name, 20, 3);
    const startY = lines.length === 1 ? 8 : (lines.length === 2 ? 4 : 0);
    lines.forEach((lineText, lineIndex) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', '0');
      tspan.setAttribute('dy', lineIndex === 0 ? String(startY) : '13');
      tspan.textContent = lineText;
      label.append(tspan);
    });
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${node.name}\n${node.type}\n${node.path || ''}\nDupla kattintás: kapcsolatok hozzáadása\nJobb kattintás: kapcsolati szűrőmenü`;
    g.append(shape, icon, label, title);

    g.addEventListener('click', event => {
      event.stopPropagation();
      if (state.movedDuringPointer) {
        state.movedDuringPointer = false;
        return;
      }
      clearTimeout(state.clickTimer);
      state.clickTimer = window.setTimeout(() => selectNode(node), 230);
    });
    g.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(state.clickTimer);
      state.clickTimer = null;
      selectNode(node);
      expandConnections(node.id);
    });
    g.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      selectNode(node);
      openContextMenu(node, event.clientX, event.clientY);
    });
    g.addEventListener('pointerdown', event => onNodePointerDown(event, node.id));
    viewport.append(g);
  });

  if (state.threeD) render3DGraph(visibleNodes, visibleEdges);

  byId('nodeCount').textContent = state.graph.nodes.length;
  byId('edgeCount').textContent = state.graph.edges.length;
  byId('visibleCount').textContent = visibleNodes.length;
  updatePathStatus();
  updateFocusNavigation();
}

function drillInto(node) {
  if (!node) return;
  const currentRoot = state.focusRoot || state.entryPoint;
  if (currentRoot && currentRoot !== node.id) state.focusHistory.push(currentRoot);
  state.focusRoot = node.id;
  state.selected = node.id;
  state.showFullGraph = false;
  state.rootOnly = false;
  state.expanded.clear();
  clearPathState();
  showDetails(node);

  const position = state.positions.get(node.id);
  if (position) {
    animateTransform({
      x: 600 - position.x * 2.15,
      y: 380 - position.y * 2.15,
      k: 2.15
    }, 280, () => {
      render();
      requestAnimationFrame(() => fitGraphAnimated(430));
    });
  } else {
    render();
    requestAnimationFrame(() => fitGraphAnimated(430));
  }
  setStatus(`${node.name} fókuszban. Dupla kattintással tovább mélyíthetsz, a Vissza gombbal pedig feljebb léphetsz.`);
}

function focusBack() {
  const previousSelection = state.navigationHistory.pop();
  if (previousSelection) {
    state.focusRoot = previousSelection;
    state.selected = previousSelection;
    state.rootOnly = false;
    state.showFullGraph = false;
    state.expanded.clear();
    showDetails(findNode(previousSelection));
    render();
    requestAnimationFrame(() => fitGraphAnimated(360));
    return;
  }
  if (state.focusHistory.length) {
    state.focusRoot = state.focusHistory.pop();
    state.selected = state.focusRoot;
    state.rootOnly = false;
    state.showFullGraph = false;
    state.expanded.clear();
    showDetails(findNode(state.focusRoot));
    render();
    requestAnimationFrame(() => fitGraphAnimated(360));
    return;
  }
  focusHome();
}

function focusHome() {
  state.focusHistory = [];
  state.navigationHistory = [];
  state.rootOnly = true;
  state.focusRoot = state.entryPoint;
  state.selected = state.entryPoint;
  state.showFullGraph = !state.entryPoint;
  state.expanded.clear();
  showDetails(findNode(state.entryPoint));
  render();
  requestAnimationFrame(() => fitGraphAnimated(430));
}

function updateFocusNavigation() {
  const node = findNode(state.focusRoot || state.entryPoint);
  byId('focusBackButton').disabled = !state.focusHistory.length && !state.navigationHistory.length;
  byId('focusBreadcrumb').textContent = node ? `Fókusz: ${node.name} · ${Number.isFinite(state.depth) ? state.depth + ' szint' : 'teljes mélység'}` : 'Fókusz: teljes gráf';
}

function fitGraphAnimated(duration = 360) {
  const visible = [...viewport.querySelectorAll('.node')].map(g => state.positions.get(g.dataset.nodeId)).filter(Boolean);
  if (!visible.length) return;
  const xs = visible.map(p => p.x), ys = visible.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(100, maxX - minX + 180);
  const height = Math.max(100, maxY - minY + 180);
  const k = Math.max(0.25, Math.min(3.4, Math.min(1200 / width, 760 / height)));
  animateTransform({
    k,
    x: 600 - ((minX + maxX) / 2) * k,
    y: 380 - ((minY + maxY) / 2) * k
  }, duration);
}

function animateTransform(target, duration = 360, done) {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  const start = { ...state.transform };
  const started = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const progress = Math.min(1, (now - started) / duration);
    const value = ease(progress);
    state.transform = {
      x: start.x + (target.x - start.x) * value,
      y: start.y + (target.y - start.y) * value,
      k: start.k + (target.k - start.k) * value
    };
    applyTransform();
    if (progress < 1) state.animationFrame = requestAnimationFrame(step);
    else {
      state.animationFrame = null;
      if (done) done();
    }
  };
  state.animationFrame = requestAnimationFrame(step);
}

function ensurePositions(nodes) {
  const missing = nodes.filter(node => !state.positions.has(node.id));
  if (!missing.length) return;

  const width = 1200, height = 760;
  const groups = new Map();
  missing.forEach(node => {
    const key = categoryForNode(node);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  });

  const categories = [...groups.keys()];
  categories.forEach((categoryName, groupIndex) => {
    const items = groups.get(categoryName);
    const ring = 130 + groupIndex * Math.min(105, 480 / Math.max(1, categories.length - 1));
    items.forEach((node, index) => {
      const angle = (Math.PI * 2 * index / Math.max(items.length, 1)) + groupIndex * 0.52;
      const jitter = (hash(node.id) % 31) - 15;
      state.positions.set(node.id, {
        x: width / 2 + Math.cos(angle) * (ring + jitter),
        y: height / 2 + Math.sin(angle) * (ring + jitter)
      });
    });
  });
  relaxPositions(nodes);
}

function relaxPositions(nodes) {
  const minGap = 92;
  for (let pass = 0; pass < 18; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = state.positions.get(nodes[i].id), b = state.positions.get(nodes[j].id);
        if (!a || !b) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const needed = Math.max(minGap, radius(nodes[i]) + radius(nodes[j]) + 34);
        if (distance >= needed) continue;
        if (distance < 0.1) { dx = 1; dy = 0.4; distance = Math.hypot(dx, dy); }
        const push = (needed - distance) / 2;
        const ux = dx / distance, uy = dy / distance;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function isNodeVisibleByNoiseFilter(node) {
  const type = node.type || '';
  const name = node.name || '';
  if (!byId('showSelectors').checked && type === 'CSS_SELECTOR') return false;
  if (!byId('showDomNodes').checked && (type.includes('DOM') || type === 'HTML_ID' || type === 'HTML_CLASS')) return false;
  if (!byId('showAccessors').checked && isAccessorNode(node)) return false;
  return true;
}

function isAccessorNode(node) {
  if (!(node.type || '').includes('METHOD')) return false;
  return /^(get|set|is)[A-Z_].*/.test(node.name || '');
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await graphPanel.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) {
    setStatus(`A teljes képernyős mód nem indítható: ${error.message}`, true);
  }
}

document.addEventListener('fullscreenchange', () => {
  byId('fullscreenButton').textContent = document.fullscreenElement ? '⤢ Kilépés' : '⛶ Teljes képernyő';
  requestAnimationFrame(() => fitGraphAnimated(240));
});

function toggleThreeD() {
  state.threeD = !state.threeD;
  byId('threeDButton').setAttribute('aria-pressed', String(state.threeD));
  byId('threeDButton').textContent = state.threeD ? '☄ 3D aktív' : '☄ 3D csillagrendszer';
  byId('resetRotationButton').hidden = !state.threeD;
  byId('reset3DPositionsButton').hidden = !state.threeD;
  byId('threeDBackgroundControl').hidden = !state.threeD;
  graphStage.classList.toggle('mode-3d', state.threeD);
  svg.hidden = state.threeD;
  svg.style.display = state.threeD ? 'none' : 'block';
  byId('graph3d').hidden = !state.threeD;
  byId('graph3d').style.display = state.threeD ? 'block' : 'none';
  if (state.threeD) {
    render();
    resize3DGraph();
    start3DIntroRotation();
    setStatus('3D nézet aktív. Bal húzás: kameraforgatás; Shift+húzás csomóponton: pozicionálás; Shift+Alt+húzás: mélység.');
  } else {
    stop3DIntroRotation();
    closeContextMenu();
    render();
    requestAnimationFrame(() => fitGraphAnimated(260));
  }
}

function resetRotation() {
  if (!state.graph3d) return;
  state.graph3d.camera.yaw = 0;
  state.graph3d.camera.pitch = 0;
  state.graph3d.camera.distance = 780;
  state.graph3d.camera.panX = 0;
  state.graph3d.camera.panY = 0;
  draw3DScene();
}

function reset3DPositions() {
  if (!state.graph3d) return;
  state.graph3d.points.clear();
  const visible = currentVisibleGraphElements();
  render3DGraph(visible.nodes, visible.edges);
  setStatus('A kézzel módosított 3D csomópontpozíciók visszaálltak az automatikus térbeli elrendezésre.');
}

function currentVisibleGraphElements() {
  const ids = new Set([...viewport.querySelectorAll('.node')].map(element => element.dataset.nodeId));
  if (!ids.size) {
    const root = state.focusRoot || state.entryPoint;
    const scope = state.rootOnly && root ? new Set([root]) : (state.showFullGraph || !root ? new Set(state.graph.nodes.map(node => node.id)) : reachableFrom(root, state.depth));
    state.graph.nodes.filter(node => scope.has(node.id) && isNodeVisibleByNoiseFilter(node)).forEach(node => ids.add(node.id));
    state.expanded.forEach(id => ids.add(id));
  }
  const nodes = state.graph.nodes.filter(node => ids.has(node.id));
  const edges = state.graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target) && state.enabledEdgeTypes.has(edge.type));
  return { nodes, edges };
}

function resize3DGraph() {
  if (!state.graph3d) return;
  const host = byId('graph3d');
  const canvas = state.graph3d.canvas;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(320, host.clientWidth);
  const height = Math.max(420, host.clientHeight);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  state.graph3d.pixelRatio = ratio;
  draw3DScene();
}

function render3DGraph(nodes, edges) {
  ensure3DRenderer();
  const visibleIds = new Set(nodes.map(node => node.id));
  const previous = state.graph3d.points || new Map();
  const points = new Map();
  const count = Math.max(nodes.length, 1);
  nodes.forEach((node, index) => {
    const old = previous.get(node.id);
    if (old) {
      points.set(node.id, { ...old, node });
      return;
    }
    const phi = Math.acos(1 - 2 * (index + 0.5) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * index;
    const shell = 120 + Math.min(360, Math.sqrt(count) * 28) + (hash(node.id) % 70);
    points.set(node.id, {
      node,
      x: Math.cos(theta) * Math.sin(phi) * shell,
      y: Math.cos(phi) * shell,
      z: Math.sin(theta) * Math.sin(phi) * shell,
      fixed: false
    });
  });
  state.graph3d.points = points;
  state.graph3d.edges = edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  settle3DLayout(40);
  draw3DScene();
}

function ensure3DRenderer() {
  if (state.graph3d?.canvas) return;
  const host = byId('graph3d');
  host.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.className = 'graph3d-canvas';
  canvas.setAttribute('aria-label', 'Térbeli forráskód gráf');
  host.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });
  state.graph3d = {
    canvas,
    ctx,
    points: new Map(),
    edges: [],
    projected: [],
    pixelRatio: 1,
    camera: { yaw: 0, pitch: 0, distance: 780, panX: 0, panY: 0 },
    pointer: null,
    introFrame: null,
    draggingNode: null,
    hoverId: null
  };
  canvas.addEventListener('pointerdown', on3DPointerDown);
  canvas.addEventListener('pointermove', on3DPointerMove);
  canvas.addEventListener('pointerup', on3DPointerUp);
  canvas.addEventListener('pointercancel', on3DPointerUp);
  canvas.addEventListener('wheel', on3DWheel, { passive: false });
  canvas.addEventListener('dblclick', on3DDoubleClick);
  canvas.addEventListener('contextmenu', on3DContextMenu);
  canvas.addEventListener('click', on3DClick);
  resize3DGraph();
}

function settle3DLayout(iterations) {
  const graph = state.graph3d;
  if (!graph || graph.points.size > 450) return;
  const points = [...graph.points.values()];
  const linked = new Map();
  graph.edges.forEach(edge => {
    if (!linked.has(edge.source)) linked.set(edge.source, new Set());
    if (!linked.has(edge.target)) linked.set(edge.target, new Set());
    linked.get(edge.source).add(edge.target);
    linked.get(edge.target).add(edge.source);
  });
  for (let step = 0; step < iterations; step++) {
    const forces = new Map(points.map(point => [point.node.id, { x: 0, y: 0, z: 0 }]));
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      for (let j = i + 1; j < points.length; j++) {
        const b = points[j];
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        const d2 = Math.max(180, dx * dx + dy * dy + dz * dz);
        const d = Math.sqrt(d2);
        const strength = 9000 / d2;
        dx /= d; dy /= d; dz /= d;
        const fa = forces.get(a.node.id), fb = forces.get(b.node.id);
        fa.x += dx * strength; fa.y += dy * strength; fa.z += dz * strength;
        fb.x -= dx * strength; fb.y -= dy * strength; fb.z -= dz * strength;
      }
    }
    graph.edges.forEach(edge => {
      const a = graph.points.get(edge.source), b = graph.points.get(edge.target);
      if (!a || !b) return;
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const pull = (d - 115) * 0.0025;
      dx /= d; dy /= d; dz /= d;
      const fa = forces.get(a.node.id), fb = forces.get(b.node.id);
      fa.x += dx * pull; fa.y += dy * pull; fa.z += dz * pull;
      fb.x -= dx * pull; fb.y -= dy * pull; fb.z -= dz * pull;
    });
    points.forEach(point => {
      if (point.fixed) return;
      const force = forces.get(point.node.id);
      point.x += Math.max(-9, Math.min(9, force.x));
      point.y += Math.max(-9, Math.min(9, force.y));
      point.z += Math.max(-9, Math.min(9, force.z));
    });
  }
}

function rotate3D(point) {
  const camera = state.graph3d.camera;
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  const x1 = point.x * cy - point.z * sy;
  const z1 = point.x * sy + point.z * cy;
  const y2 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
}

function project3D(point, width, height) {
  const rotated = rotate3D(point);
  const camera = state.graph3d.camera;
  const depth = Math.max(80, camera.distance + rotated.z);
  const scale = Math.min(width, height) * 0.9 / depth;
  return {
    x: width / 2 + camera.panX + rotated.x * scale,
    y: height / 2 + camera.panY - rotated.y * scale,
    z: rotated.z,
    scale,
    depth
  };
}

function draw3DScene() {
  const graph = state.graph3d;
  if (!graph?.ctx || !state.threeD) return;
  const { canvas, ctx, pixelRatio } = graph;
  const width = canvas.width / pixelRatio;
  const height = canvas.height / pixelRatio;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  draw3DBackground(ctx, width, height);

  const projectedById = new Map();
  graph.points.forEach(point => projectedById.set(point.node.id, project3D(point, width, height)));
  graph.edges.forEach(edge => {
    const a = projectedById.get(edge.source), b = projectedById.get(edge.target);
    if (!a || !b) return;
    ctx.save();
    ctx.strokeStyle = edgeColor(edgeCategory(edge.type));
    ctx.globalAlpha = 0.28 + Math.min(0.48, 180 / Math.max(a.depth, b.depth));
    ctx.lineWidth = ['CALLS_ENDPOINT','EXPOSED_BY','USES_ENTITY'].includes(edge.type) ? 2 : 1;
    const dash = edgeDash(edge.type);
    ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  });

  const projected = [...graph.points.values()].map(point => ({ point, screen: projectedById.get(point.node.id) }))
    .sort((a, b) => b.screen.depth - a.screen.depth);
  const labelBoxes = [];
  projected.forEach(item => {
    const { point, screen } = item;
    const selected = point.node.id === state.selected;
    const hovered = point.node.id === graph.hoverId;
    const r = Math.max(4, Math.min(15, (selected ? 13 : 9) * screen.scale * 8));
    draw3DNodeSymbol(ctx, point.node, screen.x, screen.y, r, selected, hovered);
    item.radius = r;
    if (selected || hovered || screen.depth < graph.camera.distance + 55) {
      draw3DLabel(ctx, point.node.name, screen.x, screen.y - r - 7, labelBoxes, selected);
    }
  });
  graph.projected = projected;
}


function draw3DBackground(ctx, width, height) {
  const mode = state.threeDBackground || 'neutral';
  if (mode === 'none') {
    ctx.fillStyle = '#141922';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.42, 20, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
  gradient.addColorStop(0, mode === 'stars' ? '#17243a' : '#202936');
  gradient.addColorStop(0.55, '#111822');
  gradient.addColorStop(1, '#080c12');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (mode === 'stars' || mode === 'neutral') draw3DStars(ctx, width, height, mode === 'stars' ? 160 : 45);
  if (mode === 'grid' || mode === 'neutral') draw3DReferenceGrid(ctx, width, height);
  draw3DAxes(ctx, width, height);
  draw3DOrientation(ctx, width, height);
}

function draw3DStars(ctx, width, height, count) {
  ctx.save();
  for (let index = 0; index < count; index++) {
    const seed = hash(`star-${index}`);
    const x = (seed % 10000) / 10000 * width;
    const y = ((seed * 37) % 10000) / 10000 * height;
    const radius = 0.45 + ((seed >> 5) % 15) / 14;
    const alpha = 0.12 + ((seed >> 9) % 45) / 100;
    ctx.fillStyle = `rgba(188,210,239,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw3DReferenceGrid(ctx, width, height) {
  const extent = 620;
  const step = 80;
  ctx.save();
  ctx.lineWidth = 1;
  for (let value = -extent; value <= extent; value += step) {
    drawProjectedGuide(ctx, { x: value, y: -260, z: -extent }, { x: value, y: -260, z: extent }, width, height, value === 0 ? 0.28 : 0.10);
    drawProjectedGuide(ctx, { x: -extent, y: -260, z: value }, { x: extent, y: -260, z: value }, width, height, value === 0 ? 0.28 : 0.10);
  }
  const selected = state.graph3d?.points?.get(state.selected);
  if (selected) {
    const base = project3D({ x: selected.x, y: -260, z: selected.z }, width, height);
    const top = project3D(selected, width, height);
    ctx.strokeStyle = 'rgba(98,168,255,.42)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(98,168,255,.62)';
    ctx.beginPath(); ctx.ellipse(base.x, base.y, 18, 7, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawProjectedGuide(ctx, start, end, width, height, alpha) {
  const a = project3D(start, width, height);
  const b = project3D(end, width, height);
  ctx.strokeStyle = `rgba(115,143,178,${alpha})`;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

function draw3DAxes(ctx, width, height) {
  const origin = { x: -520, y: -255, z: -520 };
  const axes = [
    { end: { x: -350, y: -255, z: -520 }, label: 'X', color: 'rgba(232,102,112,.8)' },
    { end: { x: -520, y: -85, z: -520 }, label: 'Y', color: 'rgba(103,190,130,.8)' },
    { end: { x: -520, y: -255, z: -350 }, label: 'Z', color: 'rgba(98,168,255,.8)' }
  ];
  const start = project3D(origin, width, height);
  ctx.save();
  ctx.font = '700 11px system-ui';
  axes.forEach(axis => {
    const end = project3D(axis.end, width, height);
    ctx.strokeStyle = axis.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.fillStyle = axis.color; ctx.fillText(axis.label, end.x + 5, end.y - 4);
  });
  ctx.restore();
}

function draw3DOrientation(ctx, width, height) {
  const camera = state.graph3d.camera;
  const cx = width - 58, cy = height - 58, size = 26;
  const axes = [
    { point: rotate3D({ x: 1, y: 0, z: 0 }), label: 'X', color: '#e86670' },
    { point: rotate3D({ x: 0, y: 1, z: 0 }), label: 'Y', color: '#67be82' },
    { point: rotate3D({ x: 0, y: 0, z: 1 }), label: 'Z', color: '#62a8ff' }
  ];
  ctx.save();
  ctx.fillStyle = 'rgba(10,15,22,.72)';
  ctx.strokeStyle = 'rgba(124,145,171,.45)';
  ctx.beginPath(); ctx.roundRect(cx - 42, cy - 42, 84, 84, 12); ctx.fill(); ctx.stroke();
  ctx.font = '700 10px system-ui';
  axes.sort((a,b) => a.point.z - b.point.z).forEach(axis => {
    const x = cx + axis.point.x * size;
    const y = cy - axis.point.y * size;
    ctx.strokeStyle = axis.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = axis.color; ctx.fillText(axis.label, x + 3, y - 3);
  });
  ctx.fillStyle = 'rgba(220,230,242,.66)';
  ctx.font = '10px system-ui';
  ctx.fillText(`${Math.round(camera.yaw * 180 / Math.PI)}°`, cx - 9, cy + 36);
  ctx.restore();
}

function edgeDash(type) {
  if (['IMPORTS','EXTENDS','IMPLEMENTS'].includes(type)) return [8, 5];
  if (['INJECTS','DECLARES','CONTAINS','SCANS_COMPONENT'].includes(type)) return [2, 5];
  if (['CREATES','LOADS_STYLESHEET','USES_SELECTOR','SELECTS_ELEMENT'].includes(type)) return [8, 3, 2, 3];
  return [];
}

function draw3DNodeSymbol(ctx, node, x, y, r, selected, hovered) {
  ctx.save();
  ctx.fillStyle = nodeColor(categoryForNode(node));
  ctx.strokeStyle = selected ? '#ffffff' : hovered ? '#9fd0ff' : '#596579';
  ctx.lineWidth = selected ? 3 : hovered ? 2.5 : 1.3;
  ctx.beginPath();
  const shape = nodeShape(node);
  if (shape === 'rect') {
    ctx.roundRect(x - r * 1.35, y - r, r * 2.7, r * 2, Math.max(3, r * 0.3));
  } else if (shape === 'diamond') {
    ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.25, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.25, y); ctx.closePath();
  } else {
    const count = shape === 'oct' ? 8 : shape === 'hex' ? 6 : 18;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + Math.PI * 2 * i / count;
      const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f6f8fb';
  ctx.font = `700 ${Math.max(8, r * 0.82)}px system-ui`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(nodeIcon(node), x, y + 0.5);
  ctx.restore();
}

function draw3DLabel(ctx, text, x, y, boxes, selected) {
  const label = shorten(String(text || ''), 38);
  ctx.save();
  ctx.font = `${selected ? '700' : '600'} 12px system-ui`;
  const width = ctx.measureText(label).width + 12;
  const height = 20;
  let box = { x: x - width / 2, y: y - height, width, height };
  let attempts = 0;
  while (boxes.some(other => boxesOverlap(box, other)) && attempts < 7) {
    box.y -= 22;
    attempts++;
  }
  if (attempts >= 7 && !selected) { ctx.restore(); return; }
  boxes.push(box);
  ctx.fillStyle = 'rgba(8,12,18,.86)';
  ctx.strokeStyle = selected ? '#62a8ff' : 'rgba(90,104,124,.75)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.width, box.height, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f5f7fb'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2 + 0.5);
  ctx.restore();
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function hit3DNode(clientX, clientY) {
  const graph = state.graph3d;
  if (!graph) return null;
  const rect = graph.canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  return [...graph.projected].reverse().find(item => Math.hypot(item.screen.x - x, item.screen.y - y) <= Math.max(9, item.radius + 4)) || null;
}

function cameraScreenBasis() {
  const camera = state.graph3d.camera;
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  return {
    right: { x: cy, y: 0, z: -sy },
    up: { x: -sp * sy, y: cp, z: -sp * cy }
  };
}

function cameraForwardVector() {
  const camera = state.graph3d.camera;
  const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  return { x: cp * sy, y: sp, z: cp * cy };
}

function on3DPointerDown(event) {
  if (event.button !== 0 && event.button !== 1) return;
  event.preventDefault();
  stop3DIntroRotation();
  const hit = hit3DNode(event.clientX, event.clientY);
  const graph = state.graph3d;
  const mode = event.button === 1 ? 'pan' : (event.shiftKey && hit ? (event.altKey ? 'node-depth' : 'node') : 'rotate');
  graph.pointer = {
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    yaw: graph.camera.yaw,
    pitch: graph.camera.pitch,
    panX: graph.camera.panX,
    panY: graph.camera.panY,
    moved: false,
    mode
  };
  graph.draggingNode = (mode === 'node' || mode === 'node-depth') ? hit?.point || null : null;
  if (graph.draggingNode) graph.draggingNode.fixed = true;
  graph.canvas.style.cursor = mode === 'rotate' ? 'grabbing' : mode === 'pan' ? 'move' : mode === 'node-depth' ? 'ns-resize' : 'crosshair';
  graph.canvas.setPointerCapture(event.pointerId);
}

function on3DPointerMove(event) {
  const graph = state.graph3d;
  const hit = hit3DNode(event.clientX, event.clientY);
  graph.hoverId = hit?.point.node.id || null;
  if (!graph.pointer) {
    graph.canvas.style.cursor = hit ? 'pointer' : 'grab';
    draw3DScene();
    return;
  }
  event.preventDefault();
  const dx = event.clientX - graph.pointer.startX;
  const dy = event.clientY - graph.pointer.startY;
  if (Math.abs(dx) + Math.abs(dy) > 3) graph.pointer.moved = true;
  if ((graph.pointer.mode === 'node' || graph.pointer.mode === 'node-depth') && graph.draggingNode) {
    const factor = graph.camera.distance / Math.max(320, Math.min(graph.canvas.clientWidth, graph.canvas.clientHeight));
    const stepX = event.clientX - graph.pointer.x;
    const stepY = event.clientY - graph.pointer.y;
    if (graph.pointer.mode === 'node-depth') {
      const forward = cameraForwardVector();
      const amount = -stepY * factor * 1.2;
      graph.draggingNode.x += forward.x * amount;
      graph.draggingNode.y += forward.y * amount;
      graph.draggingNode.z += forward.z * amount;
    } else {
      const basis = cameraScreenBasis();
      const horizontal = stepX * factor * 0.9;
      const vertical = -stepY * factor * 0.9;
      graph.draggingNode.x += basis.right.x * horizontal + basis.up.x * vertical;
      graph.draggingNode.y += basis.right.y * horizontal + basis.up.y * vertical;
      graph.draggingNode.z += basis.right.z * horizontal + basis.up.z * vertical;
    }
    graph.pointer.x = event.clientX;
    graph.pointer.y = event.clientY;
  } else if (graph.pointer.mode === 'pan') {
    graph.camera.panX = graph.pointer.panX + dx;
    graph.camera.panY = graph.pointer.panY + dy;
  } else {
    graph.camera.yaw = graph.pointer.yaw + dx * 0.009;
    graph.camera.pitch = Math.max(-1.45, Math.min(1.45, graph.pointer.pitch + dy * 0.009));
  }
  draw3DScene();
}

function on3DPointerUp(event) {
  const graph = state.graph3d;
  graph.lastPointerMoved = Boolean(graph.pointer?.moved);
  graph.draggingNode = null;
  graph.pointer = null;
  graph.canvas.style.cursor = graph.hoverId ? 'pointer' : 'grab';
  if (graph.canvas.hasPointerCapture(event.pointerId)) graph.canvas.releasePointerCapture(event.pointerId);
}

function on3DWheel(event) {
  event.preventDefault();
  const graph = state.graph3d;
  const hit = hit3DNode(event.clientX, event.clientY);
  if (event.shiftKey && hit?.point) {
    const forward = cameraForwardVector();
    const amount = Math.sign(event.deltaY) * Math.max(8, graph.camera.distance * 0.025);
    hit.point.x += forward.x * amount;
    hit.point.y += forward.y * amount;
    hit.point.z += forward.z * amount;
    hit.point.fixed = true;
    state.selected = hit.point.node.id;
    showDetails(hit.point.node);
  } else {
    const camera = graph.camera;
    camera.distance = Math.max(180, Math.min(2400, camera.distance * (event.deltaY < 0 ? 0.88 : 1.13)));
  }
  draw3DScene();
}

function on3DClick(event) {
  if (state.graph3d.lastPointerMoved) { state.graph3d.lastPointerMoved = false; return; }
  const hit = hit3DNode(event.clientX, event.clientY);
  if (hit) selectNode(findNode(hit.point.node.id));
}

function on3DDoubleClick(event) {
  event.preventDefault();
  const hit = hit3DNode(event.clientX, event.clientY);
  if (!hit) return;
  selectNode(findNode(hit.point.node.id));
  expandConnections(hit.point.node.id);
}

function on3DContextMenu(event) {
  event.preventDefault();
  const hit = hit3DNode(event.clientX, event.clientY);
  if (!hit) return;
  const node = findNode(hit.point.node.id);
  selectNode(node);
  openContextMenu(node, event.clientX, event.clientY);
}


function start3DIntroRotation() {
  const graph = state.graph3d;
  if (!graph) return;
  stop3DIntroRotation();
  const started = performance.now();
  const initialYaw = graph.camera.yaw;
  const animate = now => {
    if (!state.threeD || graph.pointer) return;
    const elapsed = now - started;
    const progress = Math.min(1, elapsed / 1400);
    graph.camera.yaw = initialYaw + progress * 0.55;
    graph.camera.pitch = -0.18 + Math.sin(progress * Math.PI) * 0.12;
    draw3DScene();
    if (progress < 1) graph.introFrame = requestAnimationFrame(animate);
    else graph.introFrame = null;
  };
  graph.introFrame = requestAnimationFrame(animate);
}

function stop3DIntroRotation() {
  const graph = state.graph3d;
  if (graph?.introFrame) cancelAnimationFrame(graph.introFrame);
  if (graph) graph.introFrame = null;
}

function edgeColor(categoryName) {
  const variable = {
    call:'--edge-call', api:'--edge-api', import:'--edge-import', inject:'--edge-inject', data:'--edge-data',
    inheritance:'--edge-inheritance', script:'--edge-script', style:'--edge-style', containment:'--edge-containment', creates:'--edge-creates'
  }[categoryName] || '--muted';
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#687485';
}

function openContextMenu(node, clientX, clientY) {
  if (!node) return;
  state.contextNodeId = node.id;
  const related = state.graph.edges
    .filter(edge => edge.source === node.id || edge.target === node.id)
    .map(edge => {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      return { edge, other: findNode(otherId) };
    })
    .filter(item => item.other && isNodeVisibleByNoiseFilter(item.other));
  state.contextSelection = new Set(related.map(item => item.other.id));
  byId('contextMenuTitle').textContent = `${node.name} kapcsolatai`;
  const list = byId('contextMenuList');
  list.replaceChildren();
  const grouped = new Map();
  related.forEach(item => {
    const key = humanEdgeType(item.edge.type);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  [...grouped.entries()].sort(([a],[b]) => a.localeCompare(b)).forEach(([label, items]) => {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    const legendLabel = document.createElement('span');
    legendLabel.textContent = `${label} (${items.length})`;
    const legendActions = document.createElement('span');
    legendActions.className = 'context-group-actions';

    const selectAllButton = document.createElement('button');
    selectAllButton.type = 'button';
    selectAllButton.className = 'context-group-action';
    selectAllButton.textContent = '✓';
    selectAllButton.title = 'A csoport összes elemének kijelölése';
    selectAllButton.setAttribute('aria-label', `${label}: összes kijelölése`);

    const selectNoneButton = document.createElement('button');
    selectNoneButton.type = 'button';
    selectNoneButton.className = 'context-group-action';
    selectNoneButton.textContent = '∅';
    selectNoneButton.title = 'A csoport kijelölésének törlése';
    selectNoneButton.setAttribute('aria-label', `${label}: egyik sem`);

    legendActions.append(selectAllButton, selectNoneButton);
    legend.append(legendLabel, legendActions);
    group.append(legend);

    const groupCheckboxes = [];
    items.sort((a,b) => a.other.name.localeCompare(b.other.name)).forEach(item => {
      const row = document.createElement('label');
      row.className = 'context-filter-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.dataset.nodeId = item.other.id;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.contextSelection.add(item.other.id);
        else state.contextSelection.delete(item.other.id);
      });
      groupCheckboxes.push(checkbox);
      const copy = document.createElement('span');
      copy.innerHTML = `<strong>${escapeHtml(item.other.name)}</strong><small>${escapeHtml(compactType(item.other.type))}</small>`;
      row.append(checkbox, copy);
      group.append(row);
    });

    selectAllButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setContextGroupSelection(groupCheckboxes, true);
    });
    selectNoneButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setContextGroupSelection(groupCheckboxes, false);
    });
    list.append(group);
  });
  if (!related.length) list.textContent = 'Nincs megjeleníthető kapcsolat.';
  const menu = byId('contextMenu');
  menu.hidden = false;
  const width = 360, height = Math.min(520, window.innerHeight - 30);
  menu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - height - 8))}px`;
}


function setContextGroupSelection(checkboxes, selected) {
  checkboxes.forEach(input => {
    input.checked = selected;
    if (selected) state.contextSelection.add(input.dataset.nodeId);
    else state.contextSelection.delete(input.dataset.nodeId);
  });
}

function closeContextMenu() {
  byId('contextMenu').hidden = true;
  state.contextNodeId = null;
}

function setContextSelection(selected) {
  const checkboxes = byId('contextMenuList').querySelectorAll('input[type="checkbox"]');
  state.contextSelection.clear();
  checkboxes.forEach(input => {
    input.checked = selected;
    if (selected) state.contextSelection.add(input.dataset.nodeId);
  });
}

function applyContextSelection() {
  if (!state.contextNodeId) return;
  state.rootOnly = false;
  state.expanded.add(state.contextNodeId);
  state.contextSelection.forEach(id => state.expanded.add(id));
  closeContextMenu();
  render();
  if (!state.threeD) requestAnimationFrame(() => fitGraphAnimated(280));
}

function categoryForNode(node) {
  if (node.type === 'SOURCE_FILE') {
    const value = `${node.name || ''} ${node.path || ''}`.toLowerCase();
    if (/\.(java)$/.test(value)) return 'java';
    if (/\.(js|mjs|cjs|ts|tsx|jsx)$/.test(value)) return 'javascript';
    if (/\.(html|htm|jsp|ftl|thymeleaf)$/.test(value)) return 'html';
    if (/\.(css|scss|sass|less)$/.test(value)) return 'css';
    if (/\.(yml|yaml|properties|toml|ini|xml|json)$/.test(value) || /pom\.xml|build\.gradle|settings\.gradle/.test(value)) return 'config';
    if (/\.(sql)$/.test(value)) return 'data';
    return 'file';
  }
  return category(node.type);
}

function nodeColor(nodeCategory) {
  const variable = {
    file: '--file', java: '--java', 'java-class': '--java-class', 'java-interface': '--java-interface', 'java-enum': '--java-enum', 'java-record': '--java-record', 'java-method': '--java-method',
    javascript: '--javascript', 'js-function': '--js-function', html: '--html',
    controller: '--html', service: '--java', repository: '--data', entity: '--config',
    css: '--css', dom: '--dom', endpoint: '--endpoint', config: '--config',
    data: '--data', other: '--other'
  }[nodeCategory] || '--other';
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#7e8998';
}

function category(type) {
  if (type === 'JAVA_CONTROLLER') return 'controller';
  if (type === 'JAVA_SERVICE') return 'service';
  if (type === 'JAVA_REPOSITORY') return 'repository';
  if (type === 'JAVA_ENTITY') return 'entity';
  if (type === 'SOURCE_FILE') return 'file';
  if (type === 'JAVA_APPLICATION_ENTRY') return 'java';
  if (type.includes('INTERFACE')) return 'java-interface';
  if (type.includes('ENUM')) return 'java-enum';
  if (type.includes('RECORD')) return 'java-record';
  if (type.includes('CLASS')) return 'java-class';
  if (type.startsWith('JAVA_METHOD') || type === 'JAVA_CONSTRUCTOR') return 'java-method';
  if (type.startsWith('JAVA')) return 'java';
  if (type.startsWith('JS_FUNCTION')) return 'js-function';
  if (type.startsWith('JS') || type.startsWith('TS')) return 'javascript';
  if (type.includes('HTML')) return 'html';
  if (type.includes('CSS')) return 'css';
  if (type.includes('DOM')) return 'dom';
  if (type.includes('ENDPOINT')) return 'endpoint';
  if (type.includes('CONFIG')) return 'config';
  if (type.includes('SQL') || type.includes('ENTITY')) return 'data';
  return 'other';
}

function edgeCategory(type) {
  if (type === 'IMPORTS') return 'import';
  if (type === 'CALLS' || type === 'CALLS_COMPONENT') return 'call';
  if (type === 'CALLS_ENDPOINT' || type === 'EXPOSED_BY' || type === 'SAME_ENDPOINT') return 'api';
  if (type === 'INJECTS') return 'inject';
  if (type === 'USES_ENTITY') return 'data';
  if (type === 'EXTENDS' || type === 'IMPLEMENTS') return 'inheritance';
  if (type === 'LOADS_SCRIPT') return 'script';
  if (type === 'LOADS_STYLESHEET' || type === 'USES_SELECTOR' || type === 'SELECTS_ELEMENT') return 'style';
  if (type === 'DECLARES' || type === 'CONTAINS' || type === 'SCANS_COMPONENT') return 'containment';
  if (type === 'CREATES') return 'creates';
  return 'default';
}

function directConnections(id) {
  const result = new Set(id ? [id] : []);
  if (!id) return result;
  state.graph.edges.forEach(edge => {
    if (edge.source === id) result.add(edge.target);
    if (edge.target === id) result.add(edge.source);
  });
  return result;
}

function expandConnections(id) {
  state.rootOnly = false;
  const ids = directConnections(id);
  ids.forEach(value => state.expanded.add(value));
  setStatus(`${findNode(id)?.name || id} közvetlen kapcsolatai kibontva. Jobb kattintással tovább követhető.`);
  render();
}

function selectNode(node, remember = true) {
  if (!node) return;
  if (remember && state.selected && state.selected !== node.id) {
    const last = state.navigationHistory[state.navigationHistory.length - 1];
    if (last !== state.selected) state.navigationHistory.push(state.selected);
  }
  state.selected = node.id;
  showDetails(node);
  render();
}

function onNodePointerDown(event, nodeId) {
  if (event.button !== 0) return;
  event.stopPropagation();
  const point = clientToGraph(event.clientX, event.clientY);
  const position = state.positions.get(nodeId);
  state.movedDuringPointer = false;
  state.draggingNode = {
    id: nodeId,
    dx: point.x - position.x,
    dy: point.y - position.y
  };
  svg.setPointerCapture(event.pointerId);
}

function onCanvasPointerDown(event) {
  if (event.button !== 0 || event.target.closest('.node')) return;
  state.panning = true;
  state.pointerStart = { x: event.clientX, y: event.clientY, tx: state.transform.x, ty: state.transform.y };
  svg.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (state.draggingNode) {
    state.movedDuringPointer = true;
    const point = clientToGraph(event.clientX, event.clientY);
    state.positions.set(state.draggingNode.id, {
      x: point.x - state.draggingNode.dx,
      y: point.y - state.draggingNode.dy
    });
    render();
    return;
  }
  if (state.panning && state.pointerStart) {
    state.movedDuringPointer = true;
    state.transform.x = state.pointerStart.tx + event.clientX - state.pointerStart.x;
    state.transform.y = state.pointerStart.ty + event.clientY - state.pointerStart.y;
    applyTransform();
  }
}

function onPointerUp(event) {
  state.draggingNode = null;
  state.panning = false;
  state.rotating = false;
  state.pointerStart = null;
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
}

function zoomAtCenter(factor) {
  const sx = 600;
  const sy = 380;
  const oldK = state.transform.k;
  const newK = Math.max(0.2, Math.min(5, oldK * factor));
  state.transform.x = sx - ((sx - state.transform.x) / oldK) * newK;
  state.transform.y = sy - ((sy - state.transform.y) / oldK) * newK;
  state.transform.k = newK;
  applyTransform();
}

function onWheel(event) {
  event.preventDefault();
  const rect = svg.getBoundingClientRect();
  const sx = (event.clientX - rect.left) * (1200 / rect.width);
  const sy = (event.clientY - rect.top) * (760 / rect.height);
  const oldK = state.transform.k;
  const factor = event.deltaY < 0 ? 1.12 : 0.89;
  const newK = Math.max(0.2, Math.min(5, oldK * factor));
  state.transform.x = sx - ((sx - state.transform.x) / oldK) * newK;
  state.transform.y = sy - ((sy - state.transform.y) / oldK) * newK;
  state.transform.k = newK;
  applyTransform();
}

function applyTransform() {
  viewport.setAttribute('transform', `translate(${state.transform.x} ${state.transform.y}) scale(${state.transform.k})`);
}

function clientToGraph(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const sx = (clientX - rect.left) * (1200 / rect.width);
  const sy = (clientY - rect.top) * (760 / rect.height);
  return {
    x: (sx - state.transform.x) / state.transform.k,
    y: (sy - state.transform.y) / state.transform.k
  };
}

function fitGraph() {
  const visible = [...viewport.querySelectorAll('.node')].map(g => state.positions.get(g.dataset.nodeId)).filter(Boolean);
  if (!visible.length) return;
  const xs = visible.map(p => p.x), ys = visible.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(100, maxX - minX + 140);
  const height = Math.max(100, maxY - minY + 140);
  const k = Math.max(0.2, Math.min(2.5, Math.min(1200 / width, 760 / height)));
  state.transform.k = k;
  state.transform.x = 600 - ((minX + maxX) / 2) * k;
  state.transform.y = 380 - ((minY + maxY) / 2) * k;
  applyTransform();
}

function resetView() {
  state.showFullGraph = true;
  state.rootOnly = false;
  state.focusRoot = null;
  state.focusHistory = [];
  state.selected = null;
  state.expanded.clear();
  state.transform = { x: 0, y: 0, k: 1 };
  clearPathState();
  showDetails(null);
  setStatus('A teljes projektgráf megjelenítve. A belépési pont vagy mélység módosításával visszatérhetsz a fókuszált nézethez.');
  render();
  fitGraph();
}

function setPathStart() {
  if (!state.selected) return setStatus('Először válassz ki egy csomópontot.', true);
  state.pathStart = state.selected;
  state.path = [state.selected];
  state.pathEdges.clear();
  state.expanded.add(state.selected);
  setStatus(`Útvonal kezdőpontja: ${findNode(state.selected)?.name || state.selected}. Válassz célpontot.`);
  render();
}

function findPathToSelected() {
  if (!state.pathStart) return setStatus('Először állíts be kezdőpontot.', true);
  if (!state.selected || state.selected === state.pathStart) return setStatus('Válassz a kezdőponttól eltérő célpontot.', true);
  const directed = byId('pathDirection').value === 'directed';
  const path = shortestPath(state.pathStart, state.selected, directed);
  if (!path.length) {
    state.path = [];
    state.pathEdges.clear();
    render();
    return setStatus('A két elem között nem található útvonal a megadott irányban.', true);
  }
  state.path = path;
  state.pathEdges.clear();
  for (let i = 0; i < path.length - 1; i++) {
    const edge = state.graph.edges.find(e =>
      (e.source === path[i] && e.target === path[i + 1]) ||
      (!directed && e.target === path[i] && e.source === path[i + 1])
    );
    if (edge) state.pathEdges.add(`${edge.source}|${edge.target}|${edge.type}`);
  }
  path.forEach(id => state.expanded.add(id));
  setStatus(`Útvonal megtalálva: ${path.length - 1} kapcsolat.`);
  render();
  fitGraph();
}

function shortestPath(start, target, directed) {
  const queue = [start];
  const previous = new Map([[start, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === target) break;
    state.graph.edges.forEach(edge => {
      if (state.enabledEdgeTypes.size && !state.enabledEdgeTypes.has(edge.type)) return;
      let next = null;
      if (edge.source === current) next = edge.target;
      else if (!directed && edge.target === current) next = edge.source;
      if (next && !previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    });
  }
  if (!previous.has(target)) return [];
  const path = [];
  for (let at = target; at !== null; at = previous.get(at)) path.push(at);
  return path.reverse();
}

function clearPathState() {
  state.pathStart = null;
  state.path = [];
  state.pathEdges.clear();
  updatePathStatus();
}

function clearPath() {
  clearPathState();
  if (viewport) renderPathOnlySafe();
}

function renderPathOnlySafe() {
  if (state.graph.nodes.length) render();
}

function updatePathStatus() {
  const start = findNode(state.pathStart);
  byId('pathStatus').textContent = start
    ? `Kezdőpont: ${start.name}${state.path.length > 1 ? ` · útvonal: ${state.path.length - 1} él` : ''}`
    : 'Nincs útvonal-kezdőpont';
}

function findNode(id) {
  return state.graph.nodes.find(node => node.id === id);
}

function radius(node) {
  const nameBoost = Math.min(16, Math.max(0, String(node.name || '').length - 12) * 0.55);
  if (node.type === 'JAVA_APPLICATION_ENTRY') return 42 + nameBoost;
  if (node.type === 'SOURCE_FILE') return 36 + nameBoost;
  if (node.type.includes('METHOD') || node.type.includes('FUNCTION')) return 25 + nameBoost * 0.45;
  return 31 + nameBoost * 0.7;
}

function shorten(value, max) { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

function wrapNodeLabel(value, max, maxLines) {
  const normalized = String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._/\-]+/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max || !current) current = candidate;
    else { lines.push(current); current = word; }
  });
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const rest = lines.slice(maxLines - 1).join(' ');
    lines.splice(maxLines - 1, lines.length, rest.length > max ? `${rest.slice(0, max - 1)}…` : rest);
  }
  return lines.length ? lines : ['–'];
}

function createNodeShape(node, categoryName) {
  const r = radius(node);
  const shape = nodeShape(node);
  let element;
  if (shape === 'hex') {
    element = document.createElementNS(ns, 'polygon');
    element.setAttribute('points', polygonPoints(6, r * 1.13, Math.PI / 6));
  } else if (shape === 'oct') {
    element = document.createElementNS(ns, 'polygon');
    element.setAttribute('points', polygonPoints(8, r * 1.08, Math.PI / 8));
  } else if (shape === 'diamond') {
    element = document.createElementNS(ns, 'polygon');
    element.setAttribute('points', `0,${-r * 1.12} ${r * 1.22},0 0,${r * 1.12} ${-r * 1.22},0`);
  } else if (shape === 'rect') {
    element = document.createElementNS(ns, 'rect');
    element.setAttribute('x', String(-r * 1.35));
    element.setAttribute('y', String(-r));
    element.setAttribute('width', String(r * 2.7));
    element.setAttribute('height', String(r * 2));
    element.setAttribute('rx', '9');
  } else {
    element = document.createElementNS(ns, 'circle');
    element.setAttribute('r', String(r));
  }
  element.setAttribute('class', 'node-shape');
  element.setAttribute('fill', nodeColor(categoryName));
  return element;
}

function polygonPoints(count, radiusValue, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const angle = offset + Math.PI * 2 * index / count;
    return `${Math.cos(angle) * radiusValue},${Math.sin(angle) * radiusValue}`;
  }).join(' ');
}

function nodeShape(node) {
  const type = node.type || '';
  if (type.includes('METHOD') || type.includes('FUNCTION') || type.includes('CONSTRUCTOR')) return 'circle';
  if (type.includes('INTERFACE')) return 'diamond';
  if (type.includes('ENUM') || type.includes('RECORD')) return 'oct';
  if (type.includes('CONTROLLER') || type.includes('SERVICE') || type.includes('REPOSITORY') || type.includes('ENTITY') || type.includes('CLASS')) return 'hex';
  if (type === 'SOURCE_FILE' || type.includes('HTML_PAGE') || type.includes('CONFIG')) return 'rect';
  return 'circle';
}

function nodeIcon(node) {
  const type = node.type || '';
  if (type.includes('APPLICATION_ENTRY')) return '▶';
  if (type.includes('CONTROLLER') || type.includes('ENDPOINT')) return '⇄';
  if (type.includes('SERVICE')) return '⚙';
  if (type.includes('REPOSITORY')) return '▤';
  if (type.includes('ENTITY')) return '◆';
  if (type.includes('INTERFACE')) return '◇';
  if (type.includes('ENUM')) return '≡';
  if (type.includes('RECORD')) return '▦';
  if (type.includes('METHOD') || type.includes('FUNCTION')) return 'ƒ';
  if (type.includes('CONSTRUCTOR')) return '+';
  if (type === 'SOURCE_FILE') return '▱';
  if (type.includes('HTML')) return '</>';
  if (type.includes('CSS')) return '#';
  if (type.startsWith('JS') || type.startsWith('TS')) return 'JS';
  return '•';
}

function compactType(type) {
  return String(type || '').replace(/^JAVA_/, '').replace(/^JS_/, '').replaceAll('_', ' ').toLowerCase();
}

function hash(value) { let result = 0; for (let i = 0; i < value.length; i++) result = ((result << 5) - result + value.charCodeAt(i)) | 0; return Math.abs(result); }

function showDetails(node) {
  byId('detailName').textContent = node?.name || 'Nincs kiválasztott elem';
  byId('detailType').textContent = node?.type || '–';
  byId('detailPath').textContent = node?.path || '–';
  byId('detailLine').textContent = node?.line || '–';
  const metadata = byId('metadataList');
  metadata.replaceChildren();
  const list = byId('connectionList');
  list.replaceChildren();
  if (!node) return;

  const owners = state.graph.edges
    .filter(edge => edge.target === node.id && ['DECLARES', 'CONTAINS'].includes(edge.type))
    .map(edge => findNode(edge.source)).filter(Boolean);
  owners.forEach(owner => appendMetadata(metadata, 'Szülő', owner.name, () => selectNode(owner)));
  if (node.metadata) Object.entries(node.metadata).forEach(([key, value]) => appendMetadata(metadata, key, value));
  if (!metadata.children.length) metadata.textContent = 'Nincs további metaadat.';

  state.graph.edges.filter(e => e.source === node.id || e.target === node.id).forEach(edge => {
    const outgoing = edge.source === node.id;
    const otherId = outgoing ? edge.target : edge.source;
    const other = findNode(otherId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `connection-item edge-item-${edgeCategory(edge.type)}`;
    button.innerHTML = `<span class="connection-direction">${outgoing ? '→' : '←'}</span><span><strong>${escapeHtml(humanEdgeType(edge.type))}</strong><small>${escapeHtml(other?.name || otherId)} · ${escapeHtml(other?.type || '')}</small></span>`;
    button.title = edge.detail || edge.type;
    button.addEventListener('click', () => {
      state.expanded.add(otherId);
      selectNode(other);
    });
    button.addEventListener('contextmenu', event => {
      event.preventDefault();
      state.expanded.add(otherId);
      selectNode(other);
      expandConnections(otherId);
    });
    list.append(button);
  });
  if (!list.children.length) list.textContent = 'Nincs felismert kapcsolat.';
}

function appendMetadata(container, key, value, action) {
  const item = action ? document.createElement('button') : document.createElement('div');
  if (action) { item.type = 'button'; item.addEventListener('click', action); }
  item.className = 'metadata-item';
  const label = document.createElement('span'); label.textContent = key;
  const content = document.createElement('strong'); content.textContent = value == null ? '–' : String(value);
  item.append(label, content); container.append(item);
}

function setDetailsCollapsed(collapsed, persist = true) {
  document.querySelector('.workspace')?.classList.toggle('details-collapsed', collapsed);
  byId('detailsPanel').hidden = collapsed;
  byId('detailsOpenButton').hidden = !collapsed;
  if (persist) writeCookie('sge-details-collapsed', String(collapsed), 365);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}

function renderEdgeLegend() {
  const box = byId('edgeLegend');
  box.replaceChildren();
  [...new Set(state.graph.edges.map(edge => edge.type))].sort().forEach(type => {
    const item = document.createElement('span');
    item.className = `edge-legend-item edge-legend-${edgeCategory(type)}`;
    const line = document.createElement('i');
    const label = document.createElement('span'); label.textContent = humanEdgeType(type);
    item.append(line, label); box.append(item);
  });
}


function setActiveView(view) {
  state.activeView = view;
  const graphActive = view === 'graph';
  const flowActive = view === 'flow';
  const chatActive = view === 'chat';
  byId('graphWorkspace').hidden = !graphActive;
  byId('flowView').hidden = !flowActive;
  byId('chatView').hidden = !chatActive;
  byId('graphViewButton').classList.toggle('active', graphActive);
  byId('flowViewButton').classList.toggle('active', flowActive);
  byId('chatViewButton').classList.toggle('active', chatActive);
  byId('graphViewButton').setAttribute('aria-pressed', String(graphActive));
  byId('flowViewButton').setAttribute('aria-pressed', String(flowActive));
  byId('chatViewButton').setAttribute('aria-pressed', String(chatActive));
  if (graphActive && state.threeD) requestAnimationFrame(() => { resize3DGraph(); draw3DGraph(); });
}


function buildFunctionalFlow(requestedRoot, showProgress = false) {
  const execute = () => {
    try {
      buildFunctionalFlowCore(requestedRoot);
      if (showProgress) setFlowBuildProgress('A folyamatnézet megjelenítése…', 100);
    } finally {
      if (showProgress) window.setTimeout(closeFlowBuildDialog, 180);
    }
  };
  if (!showProgress) { execute(); return; }
  openFlowBuildDialog();
  window.setTimeout(() => {
    setFlowBuildProgress('Kapcsolatok és leágazások feldolgozása…', 36);
    window.setTimeout(() => {
      setFlowBuildProgress('Végrehajtási útvonal keresése…', 68);
      window.setTimeout(execute, 40);
    }, 40);
  }, 40);
}

function buildFunctionalFlowCore(requestedRoot) {
  if (!state.graph.nodes.length) {
    state.flowTree = null;
    renderFunctionalFlow([], []);
    renderFunctionalTree(null);
    fillFlowTypeFilters(null);
    return;
  }
  const startId = requestedRoot || state.flowRoot || state.selected || state.focusRoot || state.entryPoint;
  if (!startId) {
    renderFunctionalFlow([], []);
    renderFunctionalTree(null);
    fillFlowTypeFilters(null);
    return;
  }
  state.flowRoot = startId;
  const result = findBestFunctionalPath(startId);
  state.functionalFlow = result;
  state.flowTree = buildFunctionalTree(startId, 8, 140);
  fillFlowTypeFilters(state.flowTree);
  renderFunctionalFlow(result.nodes, result.edges);
  renderFunctionalTree(state.flowTree);
  updateFlowNavigation();
}

function openFlowBuildDialog() {
  const dialog = byId('flowBuildDialog');
  setFlowBuildProgress('A folyamatmodell előkészítése…', 12);
  if (dialog && !dialog.open) dialog.showModal();
}

function setFlowBuildProgress(label, progress) {
  if (byId('flowBuildStage')) byId('flowBuildStage').textContent = label;
  if (byId('flowBuildProgress')) byId('flowBuildProgress').style.width = `${progress}%`;
}

function closeFlowBuildDialog() {
  const dialog = byId('flowBuildDialog');
  if (dialog?.open) dialog.close();
}

function flowNavigateTo(nodeId) {
  if (!nodeId || nodeId === state.flowRoot) return;
  if (state.flowRoot) state.flowHistory.push(state.flowRoot);
  state.flowRoot = nodeId;
  buildFunctionalFlow(nodeId, true);
}

function flowBack() {
  const previous = state.flowHistory.pop();
  if (!previous) return;
  state.flowRoot = previous;
  buildFunctionalFlow(previous, true);
}

function flowHome() {
  state.flowHistory = [];
  state.flowRoot = state.entryPoint || state.focusRoot || state.selected;
  buildFunctionalFlow(state.flowRoot, true);
}

function updateFlowNavigation() {
  byId('flowBackButton').disabled = !state.flowHistory.length;
  const current = findNode(state.flowRoot);
  const trail = [...state.flowHistory, state.flowRoot]
    .map(findNode).filter(Boolean).map(node => node.name);
  byId('flowBreadcrumb').textContent = trail.length ? trail.join(' → ') : (current?.name || 'Kiindulópont');
}

function buildFunctionalTree(startId, maxDepth, maxNodes) {
  const visitedCount = new Map();
  let total = 0;
  const excluded = new Set(['USES_SELECTOR','SELECTS_ELEMENT','LOADS_STYLESHEET','IMPORTS','DECLARES','CONTAINS']);
  const walk = (nodeId, depth, ancestry) => {
    const node = findNode(nodeId);
    if (!node || total >= maxNodes) return null;
    total += 1;
    visitedCount.set(nodeId, (visitedCount.get(nodeId) || 0) + 1);
    const item = { node, edge: null, children: [], cycle: false, truncated: false };
    if (depth >= maxDepth) { item.truncated = true; return item; }
    const outgoing = state.graph.edges
      .filter(edge => edge.source === nodeId && state.enabledEdgeTypes.has(edge.type) && !excluded.has(edge.type))
      .sort((a,b) => (flowEdgeScore(b.type) + flowNodeScore(findNode(b.target))) - (flowEdgeScore(a.type) + flowNodeScore(findNode(a.target))));
    for (const edge of outgoing) {
      if (total >= maxNodes) { item.truncated = true; break; }
      const target = findNode(edge.target);
      if (!target || !isNodeVisibleByNoiseFilter(target)) continue;
      if (ancestry.has(edge.target)) {
        item.children.push({ node: target, edge, children: [], cycle: true, truncated: false });
        continue;
      }
      // Repeated shared nodes are allowed once per branch, but excessive fan-in is collapsed.
      if ((visitedCount.get(edge.target) || 0) >= 4) continue;
      const nextAncestry = new Set(ancestry); nextAncestry.add(edge.target);
      const child = walk(edge.target, depth + 1, nextAncestry);
      if (child) { child.edge = edge; item.children.push(child); }
    }
    return item;
  };
  return walk(startId, 0, new Set([startId]));
}

function collectFlowTypes(tree, result = new Set()) {
  if (!tree) return result;
  result.add(tree.node.type || 'OTHER');
  tree.children.forEach(child => collectFlowTypes(child, result));
  return result;
}

function fillFlowTypeFilters(tree) {
  const host = byId('flowTypeFilters');
  if (!host) return;
  const types = [...collectFlowTypes(tree)].sort((a, b) => humanNodeType(a).localeCompare(humanNodeType(b), 'hu'));
  const saved = readCookie('sge-flow-node-types');
  const savedSet = saved ? new Set(saved.split(',').filter(Boolean)) : null;
  if (!state.flowVisibleTypes.size || [...state.flowVisibleTypes].every(type => !types.includes(type))) {
    state.flowVisibleTypes = new Set(types.filter(type => savedSet ? savedSet.has(type) : !isDefaultHiddenFlowType(type)));
  } else {
    state.flowVisibleTypes = new Set([...state.flowVisibleTypes].filter(type => types.includes(type)));
    types.forEach(type => { if (!savedSet && !isDefaultHiddenFlowType(type)) state.flowVisibleTypes.add(type); });
  }
  host.replaceChildren();
  const allButton = document.createElement('button');
  allButton.type = 'button'; allButton.className = 'secondary compact-action'; allButton.textContent = 'Összes';
  allButton.addEventListener('click', () => { state.flowVisibleTypes = new Set(types); persistFlowTypeFilters(); fillFlowTypeFilters(tree); renderFunctionalTree(tree); });
  const noneButton = document.createElement('button');
  noneButton.type = 'button'; noneButton.className = 'secondary compact-action'; noneButton.textContent = 'Egyik sem';
  noneButton.addEventListener('click', () => { state.flowVisibleTypes = new Set([tree?.node?.type].filter(Boolean)); persistFlowTypeFilters(); fillFlowTypeFilters(tree); renderFunctionalTree(tree); });
  host.append(allButton, noneButton);
  types.forEach(type => {
    const label = document.createElement('label'); label.className = 'flow-type-check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = state.flowVisibleTypes.has(type);
    input.addEventListener('change', () => {
      if (input.checked) state.flowVisibleTypes.add(type); else state.flowVisibleTypes.delete(type);
      if (tree?.node?.type === type) state.flowVisibleTypes.add(type);
      persistFlowTypeFilters(); renderFunctionalTree(tree);
    });
    const swatch = document.createElement('i'); swatch.className = `node-type-swatch node-${category(type)}`;
    const text = document.createElement('span'); text.textContent = humanNodeType(type);
    label.append(input, swatch, text); host.append(label);
  });
}

function persistFlowTypeFilters() {
  writeCookie('sge-flow-node-types', [...state.flowVisibleTypes].join(','), 365);
}

function isDefaultHiddenFlowType(type) {
  return type === 'CSS_SELECTOR' || type === 'HTML_ID' || type === 'HTML_CLASS' || type.includes('DOM') || type.includes('GETTER') || type.includes('SETTER');
}

function humanNodeType(type) {
  return String(type || 'Egyéb').replace(/^JAVA_/, '').replace(/^JS_/, 'JavaScript ').replaceAll('_', ' ').toLowerCase().replace(/^./, value => value.toUpperCase());
}

function renderFunctionalTree(tree) {
  const host = byId('flowTree');
  host.replaceChildren();
  if (!tree) { host.textContent = 'Nincs megjeleníthető kapcsolati leágazás.'; return; }
  const rootList = document.createElement('ul');
  rootList.className = 'flow-tree-level flow-tree-root';
  rootList.append(renderFunctionalTreeItem(tree, 0));
  host.append(rootList);
}

function renderFunctionalTreeItem(item, depth) {
  const li = document.createElement('li');
  li.className = 'flow-tree-item';
  const row = document.createElement('div');
  row.className = `flow-tree-node node-${categoryForNode(item.node)}`;
  const relation = item.edge ? humanEdgeType(item.edge.type) : 'Kiindulópont';
  row.innerHTML = `<span class="flow-tree-relation">${escapeHtml(relation)}</span><strong>${escapeHtml(item.node.name)}</strong><small>${escapeHtml(formatSourceLocation(item.node))}</small>${item.cycle ? '<em>Körkörös kapcsolat</em>' : ''}${item.truncated ? '<em>További ágak elrejtve</em>' : ''}`;
  row.addEventListener('click', () => flowNavigateTo(item.node.id));
  row.addEventListener('dblclick', event => { event.preventDefault(); selectNode(item.node); setActiveView('graph'); });
  li.append(row);
  if (item.children.length) {
    const children = document.createElement('ul');
    children.className = 'flow-tree-level';
    item.children
      .filter(child => state.flowVisibleTypes.has(child.node.type || 'OTHER'))
      .forEach(child => children.append(renderFunctionalTreeItem(child, depth + 1)));
    if (children.children.length) li.append(children);
  }
  return li;
}

function findBestFunctionalPath(startId) {
  const preferredEdges = new Set(['LOADS_SCRIPT','CALLS_ENDPOINT','EXPOSED_BY','CALLS','CALLS_COMPONENT','INJECTS','USES_ENTITY','CREATES','SCANS_COMPONENT','DECLARES']);
  const outgoing = new Map();
  state.graph.edges.forEach(edge => {
    if (!state.enabledEdgeTypes.has(edge.type) || ['USES_SELECTOR','SELECTS_ELEMENT','LOADS_STYLESHEET'].includes(edge.type)) return;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
  });
  const queue = [{ id:startId, nodes:[startId], edges:[], score:0 }];
  const candidates = [];
  const bestSeen = new Map([[startId, 0]]);
  while (queue.length) {
    const current = queue.shift();
    const nextEdges = outgoing.get(current.id) || [];
    if (current.nodes.length > 1) candidates.push(current);
    if (current.nodes.length >= 11) continue;
    nextEdges.forEach(edge => {
      if (current.nodes.includes(edge.target)) return;
      const node = findNode(edge.target);
      if (!node || !isNodeVisibleByNoiseFilter(node)) return;
      const nextScore = current.score + flowEdgeScore(edge.type) + flowNodeScore(node);
      const depthKey = `${edge.target}:${current.nodes.length}`;
      if ((bestSeen.get(depthKey) ?? -Infinity) >= nextScore) return;
      bestSeen.set(depthKey, nextScore);
      queue.push({ id:edge.target, nodes:[...current.nodes, edge.target], edges:[...current.edges, edge], score:nextScore });
    });
  }
  if (!candidates.length) {
    const direct = state.graph.edges.filter(edge => edge.source === startId || edge.target === startId).slice(0, 8);
    const ids = [startId, ...direct.map(edge => edge.source === startId ? edge.target : edge.source)];
    return { nodes:[...new Set(ids)].map(findNode).filter(Boolean), edges:direct };
  }
  candidates.sort((a,b) => {
    const aTerminal = flowTerminalScore(findNode(a.id));
    const bTerminal = flowTerminalScore(findNode(b.id));
    return (b.score + bTerminal) - (a.score + aTerminal) || b.nodes.length - a.nodes.length;
  });
  const best = candidates[0];
  return { nodes:best.nodes.map(findNode).filter(Boolean), edges:best.edges };
}

function flowEdgeScore(type) {
  const scores = { LOADS_SCRIPT:9, CALLS_ENDPOINT:14, EXPOSED_BY:14, CALLS_COMPONENT:12, CALLS:10, INJECTS:8, USES_ENTITY:15, CREATES:7, SCANS_COMPONENT:5, DECLARES:3, IMPORTS:1 };
  return scores[type] || 2;
}

function flowNodeScore(node) {
  const type = node?.type || '';
  if (type.includes('ENDPOINT')) return 12;
  if (type.includes('CONTROLLER')) return 10;
  if (type.includes('SERVICE')) return 10;
  if (type.includes('REPOSITORY')) return 14;
  if (type.includes('ENTITY')) return 14;
  if (type.includes('METHOD') || type.includes('FUNCTION')) return 7;
  if (type.includes('HTML') || type.includes('JS')) return 6;
  return 2;
}

function flowTerminalScore(node) {
  const type = node?.type || '';
  if (type.includes('ENTITY')) return 30;
  if (type.includes('REPOSITORY')) return 25;
  if (type.includes('CONFIG') || type.includes('SQL')) return 20;
  return 0;
}

function renderFunctionalFlow(nodes, edges) {
  const steps = byId('flowSteps');
  const files = byId('flowFiles');
  const warnings = byId('flowWarnings');
  steps.replaceChildren(); files.replaceChildren(); warnings.replaceChildren();
  if (!nodes.length) {
    byId('flowTitle').textContent = 'Nincs kiválasztott funkcionális útvonal';
    byId('flowSummary').textContent = 'Válassz ki egy belépési pontot vagy csomópontot.';
    byId('flowStepCount').textContent = '0'; byId('flowFileCount').textContent = '0'; byId('flowConfidence').textContent = '–';
    steps.textContent = 'Az elemzés után itt jelenik meg a rendszer működésének követhető útvonala.';
    return;
  }
  const start = nodes[0], end = nodes[nodes.length - 1];
  byId('flowTitle').textContent = `${start.name} → ${end.name}`;
  byId('flowSummary').textContent = `A kiválasztott elemhez tartozó, forráskód-kapcsolatokkal igazolt folyamat ${nodes.length} lépésben.`;
  byId('flowStepCount').textContent = String(nodes.length);
  const paths = [...new Set(nodes.map(n => n.path).filter(Boolean))];
  byId('flowFileCount').textContent = String(paths.length);
  const inferred = edges.filter(edge => /SAME_ENDPOINT|SCANS_COMPONENT/.test(edge.type)).length;
  byId('flowConfidence').textContent = inferred ? 'közepes' : 'magas';
  nodes.forEach((node,index) => {
    const edge = index ? edges[index - 1] : null;
    const article = document.createElement('article');
    article.className = `flow-step node-${categoryForNode(node)}`;
    const relation = edge ? `<span class="flow-relation">${escapeHtml(humanEdgeType(edge.type))}</span>` : '<span class="flow-relation">Kiindulópont</span>';
    article.innerHTML = `<div class="flow-step-index">${index + 1}</div><div class="flow-step-body">${relation}<h3>${escapeHtml(node.name)}</h3><p>${escapeHtml(describeFlowNode(node))}</p><small>${escapeHtml(formatSourceLocation(node))}</small></div>`;
    if (node.path) {
      const codeButton = document.createElement('button');
      codeButton.type = 'button';
      codeButton.className = 'flow-code-view-button secondary';
      codeButton.setAttribute('aria-label', `${node.name} forráskódjának megnyitása`);
      codeButton.title = 'Kódnézet megnyitása az adott sornál';
      codeButton.textContent = '</>';
      codeButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openSourceCodeWindow(node);
      });
      article.append(codeButton);
    }
    article.addEventListener('click', () => flowNavigateTo(node.id));
    article.addEventListener('dblclick', event => { event.preventDefault(); selectNode(node); setActiveView('graph'); });
    steps.append(article);
  });
  paths.forEach(path => {
    const item = document.createElement('div'); item.className = 'flow-file'; item.textContent = path; files.append(item);
  });
  if (inferred) appendFlowWarning(warnings, `${inferred} kapcsolat következtetett vagy konvenció alapján felismert.`);
  const unresolved = state.graph.warnings?.filter(w => nodes.some(n => w.includes(n.path || '___never___'))).slice(0, 8) || [];
  unresolved.forEach(w => appendFlowWarning(warnings, w));
  if (!warnings.children.length) warnings.textContent = 'A kiválasztott útvonalon nincs külön figyelmeztetés.';
}


async function openSourceCodeWindow(node) {
  if (!node?.path) {
    setStatus('Ehhez az elemhez nem tartozik megnyitható forrásfájl.', true);
    return;
  }
  const popupName = `sge-source-${Math.abs(hash(node.path))}`;
  const popup = window.open('', popupName, 'popup=yes,width=1180,height=820,resizable=yes,scrollbars=yes');
  if (!popup) {
    setStatus('A böngésző blokkolta a kódnézet ablakát. Engedélyezd a felugró ablakokat ehhez az oldalhoz.', true);
    return;
  }
  popup.document.open();
  popup.document.write(sourceWindowLoadingHtml(node));
  popup.document.close();
  try {
    const analysisId = state.graph.analysisId;
    if (!analysisId) throw new Error('Az elemzéshez nem tartozik aktív forráskód-munkamenet. Elemezd újra a projektet.');
    const response = await fetch(`/api/analysis/${encodeURIComponent(analysisId)}/source?path=${encodeURIComponent(node.path)}`);
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.detail || problem.message || `HTTP ${response.status}`);
    }
    const source = await response.json();
    renderSourceWindow(popup, node, source);
  } catch (error) {
    popup.document.open();
    popup.document.write(sourceWindowErrorHtml(node, error.message));
    popup.document.close();
    setStatus(error.message, true);
  }
}

function sourceWindowLoadingHtml(node) {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(node.name)} – kódnézet</title>${sourceWindowStyles()}</head><body><header><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(formatSourceLocation(node))}</span></header><main class="source-state">A forráskód betöltése…</main></body></html>`;
}

function sourceWindowErrorHtml(node, message) {
  return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(node.name)} – hiba</title>${sourceWindowStyles()}</head><body><header><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(formatSourceLocation(node))}</span></header><main class="source-state source-error">${escapeHtml(message)}</main></body></html>`;
}

function renderSourceWindow(popup, node, source) {
  const targetLine = Math.max(1, Number(node.line) || 1);
  const lines = String(source.content || '').replace(/\r\n?/g, '\n').split('\n');
  const renderedLines = lines.map((line, index) => {
    const lineNumber = index + 1;
    const active = lineNumber === targetLine ? ' source-line-active' : '';
    return `<div id="source-line-${lineNumber}" class="source-line${active}"><a class="source-line-number" href="#source-line-${lineNumber}">${lineNumber}</a><code>${highlightSourceLine(line, source.language)}</code></div>`;
  }).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(node.name)} – kódnézet</title>${sourceWindowStyles()}</head><body><header><div><strong>${escapeHtml(node.name)}</strong><span>${escapeHtml(source.path)}:${targetLine}</span></div><div class="source-language">${escapeHtml(source.language)}</div></header><main class="source-code">${renderedLines}</main></body></html>`);
  popup.document.close();
  popup.focus();
  requestAnimationFrame(() => popup.document.getElementById(`source-line-${targetLine}`)?.scrollIntoView({ block:'center' }));
}

function sourceWindowStyles() {
  return `<style>:root{color-scheme:dark;--bg:#0c1017;--panel:#151b25;--text:#e9eef6;--muted:#8f9bad;--border:#2b3544;--accent:#63a8ff;--keyword:#df83c8;--string:#a8d279;--comment:#718096;--number:#e7b66d;--type:#68c7c2}*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}body{display:grid;grid-template-rows:auto 1fr;overflow:hidden}header{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:12px 18px;background:var(--panel);border-bottom:1px solid var(--border)}header div:first-child{min-width:0}header strong,header span{display:block;overflow-wrap:anywhere}header span{margin-top:3px;color:var(--muted);font-size:12px}.source-language{flex:none;padding:5px 9px;border:1px solid var(--border);border-radius:999px;color:var(--accent);font-size:12px}.source-state{padding:30px;color:var(--muted)}.source-error{color:#ff9292}.source-code{overflow:auto;padding:14px 0 80px;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;tab-size:4}.source-line{display:grid;grid-template-columns:68px minmax(max-content,1fr);min-height:21px;border-left:3px solid transparent}.source-line:hover{background:#141b26}.source-line-active{background:#18304d;border-left-color:var(--accent);box-shadow:inset 0 1px rgba(99,168,255,.22),inset 0 -1px rgba(99,168,255,.22)}.source-line-number{position:sticky;left:0;padding:0 14px 0 8px;text-align:right;color:#59677a;background:var(--bg);text-decoration:none;user-select:none}.source-line-active .source-line-number{color:var(--accent);background:#18304d}code{display:block;white-space:pre;padding-right:24px}.tok-comment{color:var(--comment);font-style:italic}.tok-string{color:var(--string)}.tok-keyword{color:var(--keyword);font-weight:600}.tok-number{color:var(--number)}.tok-type{color:var(--type)}</style>`;
}

function highlightSourceLine(line, language) {
  const tokens = [];
  let source = String(line || '');
  const protect = (text, className) => {
    const key = `@@SGE_TOKEN_${tokens.length}@@`;
    tokens.push({ key, html:`<span class="${className}">${escapeHtml(text)}</span>` });
    return key;
  };

  const commentPatterns = language === 'html' || language === 'xml'
    ? [/<!--.*?-->/g]
    : language === 'properties' || language === 'yaml'
      ? [/#.*$/g]
      : [/\/\/.*$/g];
  commentPatterns.forEach(pattern => { source = source.replace(pattern, value => protect(value, 'tok-comment')); });
  source = source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, value => protect(value, 'tok-string'));

  let value = escapeHtml(source);
  value = value.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  const keywordSets = {
    java: 'abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|record|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield',
    javascript: 'async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield',
    typescript: 'abstract|any|as|async|await|boolean|break|case|catch|class|const|continue|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|infer|instanceof|interface|keyof|let|namespace|never|new|number|private|protected|public|readonly|return|static|string|super|switch|this|throw|try|type|typeof|unknown|var|void|while|yield',
    sql: 'select|from|where|join|left|right|inner|outer|on|insert|into|update|delete|create|alter|drop|table|view|index|and|or|not|null|as|group|by|order|having|limit|distinct|values|set'
  };
  const words = keywordSets[language];
  if (words) value = value.replace(new RegExp(`\\b(${words})\\b`, 'gi'), '<span class="tok-keyword">$1</span>');
  if (language === 'java') value = value.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, '<span class="tok-type">$1</span>');
  tokens.forEach(token => { value = value.replace(token.key, token.html); });
  return value || ' ';
}

function describeFlowNode(node) {
  const type = node.type || '';
  if (type.includes('HTML')) return 'Felhasználói felület vagy sablon, ahonnan a folyamat indul.';
  if (type.startsWith('JS') || type.startsWith('TS')) return 'Frontend logika, eseménykezelő vagy API-hívás.';
  if (type.includes('ENDPOINT')) return 'HTTP belépési pont, amely összeköti a frontendet a backenddel.';
  if (type.includes('CONTROLLER')) return 'Webes vezérlő vagy resource, amely fogadja a kérést.';
  if (type.includes('SERVICE')) return 'Üzleti logikát és folyamatkoordinációt végző komponens.';
  if (type.includes('REPOSITORY')) return 'Perzisztencia- vagy adathozzáférési komponens.';
  if (type.includes('ENTITY')) return 'Tárolt domain- vagy adatbázis-entitás.';
  if (type.includes('METHOD') || type.includes('FUNCTION')) return 'A folyamat végrehajtásában részt vevő művelet.';
  if (type === 'SOURCE_FILE') return 'A működésben részt vevő forrásállomány.';
  return 'A funkcionális útvonal résztvevő eleme.';
}

function formatSourceLocation(node) {
  if (!node.path) return node.type || '';
  return `${node.path}${node.line ? `:${node.line}` : ''}`;
}

function appendFlowWarning(container, text) {
  const item = document.createElement('div'); item.className = 'flow-warning'; item.textContent = text; container.append(item);
}

function functionalFlowMarkdown() {
  const { nodes, edges } = state.functionalFlow;
  if (!nodes.length) return '# Funkcionális útvonal\n\nNincs kiválasztott útvonal.\n';
  const lines = [`# Funkcionális útvonal: ${nodes[0].name} → ${nodes[nodes.length - 1].name}`, '', `Generálva: ${new Date().toLocaleString('hu-HU')}`, '', '## Áttekintés', '', `- Lépések: ${nodes.length}`, `- Érintett állományok: ${new Set(nodes.map(n => n.path).filter(Boolean)).size}`, '', '## Folyamat', ''];
  nodes.forEach((node,index) => {
    const edge = index ? edges[index - 1] : null;
    lines.push(`### ${index + 1}. ${node.name}`);
    lines.push('');
    lines.push(`- Szerep: ${describeFlowNode(node)}`);
    lines.push(`- Típus: ${node.type}`);
    lines.push(`- Forrás: ${formatSourceLocation(node)}`);
    if (edge) lines.push(`- Előző kapcsolata: ${humanEdgeType(edge.type)}${edge.detail ? ` — ${edge.detail}` : ''}`);
    lines.push('');
  });
  lines.push('## Teljes folyamatfa', '');
  appendFunctionalTreeMarkdown(lines, state.flowTree, 0);
  lines.push('', '## Érintett állományok', '');
  [...new Set(nodes.map(n => n.path).filter(Boolean))].forEach(path => lines.push(`- \`${path}\``));
  lines.push('', '## Elemzési megjegyzés', '', 'A riport statikus forráskód-elemzésből készült. A dinamikus, reflection-alapú vagy futásidőben létrejövő kapcsolatok hiányosak lehetnek.', '');
  return lines.join('\n');
}


function appendFunctionalTreeMarkdown(lines, item, depth) {
  if (!item) { lines.push('- Nincs megjeleníthető folyamatfa.'); return; }
  const relation = item.edge ? humanEdgeType(item.edge.type) : 'Kiindulópont';
  const flags = `${item.cycle ? ' [körkörös]' : ''}${item.truncated ? ' [további ágak elrejtve]' : ''}`;
  lines.push(`${'  '.repeat(depth)}- **${item.node.name}** — ${relation} — \`${formatSourceLocation(item.node)}\`${flags}`);
  item.children.forEach(child => appendFunctionalTreeMarkdown(lines, child, depth + 1));
}

function downloadFunctionalFlowMarkdown() {
  buildFunctionalFlow(state.flowRoot || state.selected || state.focusRoot || state.entryPoint);
  const markdown = functionalFlowMarkdown();
  const blob = new Blob([markdown], { type:'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const root = state.functionalFlow.nodes[0]?.name || 'functional-flow';
  link.href = url; link.download = `${root.replace(/[^a-z0-9_-]+/gi,'-').toLowerCase()}-functional-flow.md`;
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function printFunctionalFlow() {
  buildFunctionalFlow(state.flowRoot || state.selected || state.focusRoot || state.entryPoint);
  setActiveView('flow');
  document.body.classList.add('printing-flow');
  window.print();
  window.setTimeout(() => document.body.classList.remove('printing-flow'), 300);
}

function renderWarnings() {
  const box = byId('warningList'); box.replaceChildren();
  if (!state.graph.warnings?.length) { box.textContent = 'Nincs figyelmeztetés.'; return; }
  state.graph.warnings.forEach(warning => { const div = document.createElement('div'); div.textContent = warning; box.append(div); });
}

function setStatus(message, error = false) {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function loadOllamaStatus() {
  const status = byId('ollamaStatus');
  const select = byId('chatModelSelect');
  status.classList.remove('error');
  status.textContent = 'Kapcsolódás a helyi Ollamához…';
  byId('refreshModelsButton').disabled = true;
  try {
    const response = await fetch('/api/ai/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    select.replaceChildren();
    if (!data.available) throw new Error(data.error || 'A helyi Ollama nem érhető el.');
    for (const model of data.models || []) {
      if (/embedding/i.test(model.name || '')) continue;
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = `${model.name}${model.parameterSize ? ` · ${model.parameterSize}` : ''}${model.quantization ? ` · ${model.quantization}` : ''}`;
      option.selected = model.name === data.defaultModel;
      select.append(option);
    }
    if (!select.options.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nincs helyi modell';
      select.append(option);
    }
    status.textContent = `Ollama elérhető: ${data.baseUrl} · ${(data.models || []).length} helyi modell${data.defaultModelAvailable ? ` · alapértelmezett: ${data.defaultModel}` : ''}`;
    byId('sendChatButton').disabled = !select.value;
  } catch (error) {
    status.classList.add('error');
    status.textContent = `Ollama kapcsolat sikertelen: ${error.message}`;
    select.replaceChildren(new Option('Ollama nem érhető el', ''));
    byId('sendChatButton').disabled = true;
  } finally {
    byId('refreshModelsButton').disabled = false;
  }
}


async function loadRagIndexStatus() {
  if (!state.graph.analysisId) {
    updateRagIndexStatus({ ready: false, building: false, model: 'qwen3-embedding:0.6b', documentCount: 0 });
    return;
  }
  try {
    const response = await fetch(`/api/ai/index/status?analysisId=${encodeURIComponent(state.graph.analysisId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    updateRagIndexStatus(await response.json());
  } catch (error) {
    byId('ragIndexStatus').classList.add('error');
    byId('ragIndexStatus').textContent = `Vektorindex állapota nem kérdezhető le: ${error.message}`;
  }
}


function formatRagDurationNanos(nanos) {
  if (!nanos || nanos <= 0) return '–';
  const totalSeconds = Math.max(0, Math.round(nanos / 1e9));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ragProgressDetails(data) {
  const processed = Number(data.processed || 0);
  const total = Number(data.total || 0);
  const percent = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
  const elapsed = formatRagDurationNanos(Number(data.elapsedNanos || 0));
  const remaining = formatRagDurationNanos(Number(data.estimatedRemainingNanos || 0));
  const rate = Number(data.documentsPerSecond || 0);
  const secondsPerDocument = rate > 0 ? 1 / rate : 0;
  const rateLabel = rate > 0
    ? (rate >= 1 ? `${rate.toFixed(2)} dokumentum/mp` : `${secondsPerDocument.toFixed(1)} mp/dokumentum`)
    : 'sebesség számítása…';
  return ` · ${percent.toFixed(1)}% · eltelt: ${elapsed} · ${rateLabel} · hátralévő: ${remaining}`;
}

function updateRagIndexStatus(data) {
  const status = byId('ragIndexStatus');
  const buildButton = byId('buildRagIndexButton');
  const cancelButton = byId('cancelRagIndexButton');
  const batchLabel = data.batchSize ? ` · batch: ${data.batchSize}` : '';
  const reuseLabel = Number(data.reusedDocumentCount || 0) > 0 ? ` · újrahasznált: ${data.reusedDocumentCount}` : '';
  const missingLabel = Number(data.missingDocumentCount || 0) > 0 ? ` · új embedding: ${data.missingDocumentCount}` : '';
  status.classList.toggle('error', Boolean(data.error));
  if (data.error) {
    status.textContent = `Vektorindex hiba: ${data.error}`;
  } else if (data.cancelling) {
    status.textContent = `Vektorindex leállítása folyamatban · ${data.processed || 0}/${data.total || 0} dokumentum · ${data.model}${batchLabel}${reuseLabel}${missingLabel}${ragProgressDetails(data)}`;
  } else if (data.building) {
    status.textContent = `Vektorindex épül · ${data.processed || 0}/${data.total || 0} dokumentum · ${data.model}${batchLabel}${reuseLabel}${missingLabel}${ragProgressDetails(data)}`;
  } else if (data.cancelled) {
    status.textContent = `Vektorindex készítése megszakítva · ${data.processed || 0}/${data.total || 0} dokumentum${batchLabel}${reuseLabel}${missingLabel}${ragProgressDetails(data)}`;
  } else if (data.ready) {
    const seconds = data.buildDurationNanos ? (data.buildDurationNanos / 1e9).toFixed(1) : '–';
    status.textContent = `Vektorindex kész · ${data.documentCount} dokumentum · ${data.model} · ${seconds} mp${batchLabel}${reuseLabel}`;
  } else {
    status.textContent = `Vektorindex: még nincs felépítve · embedding modell: ${data.model || 'qwen3-embedding:0.6b'}${batchLabel}`;
  }
  const active = Boolean(data.building || data.cancelling || state.ragIndexBuilding);
  buildButton.disabled = active || !state.graph.analysisId;
  buildButton.textContent = active ? 'RAG index frissítése…' : (data.ready ? 'RAG index frissítése' : 'RAG index felépítése / folytatása');
  cancelButton.hidden = !active;
  cancelButton.disabled = Boolean(data.cancelling || state.ragIndexCancelling);
  cancelButton.textContent = data.cancelling || state.ragIndexCancelling ? 'Leállítás folyamatban…' : 'RAG index készítés leállítása';
}

function startRagIndexPolling() {
  stopRagIndexPolling();
  state.ragIndexPollTimer = window.setInterval(loadRagIndexStatus, 1000);
}

function stopRagIndexPolling() {
  if (state.ragIndexPollTimer) window.clearInterval(state.ragIndexPollTimer);
  state.ragIndexPollTimer = null;
}

async function buildRagIndex() {
  if (!state.graph.analysisId || state.ragIndexBuilding) return;
  state.ragIndexBuilding = true;
  state.ragIndexCancelling = false;
  updateRagIndexStatus({ building: true, processed: 0, total: state.graph.nodes.length, model: 'qwen3-embedding:0.6b', batchSize: 4 });
  resetChatTrace();
  addChatTraceStep('RAG dokumentumok összeállítása a gráfból és forráskódból', 'active');
  startRagIndexPolling();
  try {
    const response = await fetch('/api/ai/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId: state.graph.analysisId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    if (data.cancelled) {
      addChatTraceStep(`RAG index készítése megszakítva · ${data.processed || 0}/${data.total || 0} dokumentum`, 'done');
      setStatus('A RAG index készítése megszakítva.');
    } else {
      addChatTraceStep(`Embeddingindex elkészült · újrahasznált: ${data.reusedDocumentCount || 0} · új: ${(data.documentCount || 0) - (data.reusedDocumentCount || 0)}`, 'done');
      setStatus(`A RAG index elkészült · ${data.documentCount} dokumentum.`);
    }
    updateRagIndexStatus(data);
  } catch (error) {
    addChatTraceStep(`RAG index hiba: ${error.message}`, 'error');
    updateRagIndexStatus({ error: error.message, model: 'qwen3-embedding:0.6b', batchSize: 4 });
    setStatus(error.message, true);
  } finally {
    state.ragIndexBuilding = false;
    state.ragIndexCancelling = false;
    stopRagIndexPolling();
    await loadRagIndexStatus();
  }
}

async function cancelRagIndexBuild() {
  if (!state.graph.analysisId || !state.ragIndexBuilding || state.ragIndexCancelling) return;
  state.ragIndexCancelling = true;
  byId('cancelRagIndexButton').disabled = true;
  byId('cancelRagIndexButton').textContent = 'Leállítás folyamatban…';
  addChatTraceStep('RAG index készítés leállítása kérve; az aktuális batch befejezése után leáll', 'active');
  try {
    const response = await fetch('/api/ai/index/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId: state.graph.analysisId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    updateRagIndexStatus(data);
  } catch (error) {
    state.ragIndexCancelling = false;
    setStatus(`Az indexelés leállítása sikertelen: ${error.message}`, true);
    await loadRagIndexStatus();
  }
}

function refreshChatContextLabel() {
  const selected = byId('chatUseSelection').checked ? findNode(state.selected) : null;
  byId('chatContextLabel').textContent = selected
    ? `Kontextus: kijelölt elem – ${selected.name} (${selected.path || selected.type})`
    : 'Kontextus: teljes elemzett projekt';
}

async function sendChatQuestion(event) {
  event.preventDefault();
  if (state.chatBusy) return;
  const question = byId('chatQuestion').value.trim();
  const model = byId('chatModelSelect').value;
  if (!state.graph.analysisId) return setStatus('Először elemezz egy projektet.', true);
  if (!model) return setStatus('Nincs kiválasztott helyi Ollama modell.', true);
  if (!question) return;
  state.chatMessages.push({ role: 'user', text: question, at: new Date().toISOString() });
  byId('chatQuestion').value = '';
  renderChatMessages();
  setChatBusy(true);
  state.chatStopRequested = false;
  state.chatRequestId = crypto.randomUUID ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.chatController = new AbortController();
  resetChatTrace();
  addChatTraceStep('Kérdés összeállítása a böngészőben', 'done');
  addChatTraceStep('POST /api/ai/chat elküldése a helyi Source Graph Explorernek', 'active');
  const typing = appendTypingMessage();
  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      signal: state.chatController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysisId: state.graph.analysisId,
        model,
        question,
        selectedNodeId: byId('chatUseSelection').checked ? state.selected : null,
        requestId: state.chatRequestId
      })
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.detail || problem.message || `HTTP ${response.status}`);
    }
    addChatTraceStep('A program felépíti a releváns gráf- és forráskód-kontextust', 'done');
    addChatTraceStep('A program meghívja a helyi Ollamát a 127.0.0.1 címen', 'active');
    const result = await response.json();
    renderMeasuredChatTrace(result, response.status);
    state.chatMessages.push({ role: 'assistant', text: result.answer || '(Üres válasz)', result, at: new Date().toISOString() });
    setStatus(`A helyi modell válaszolt · ${result.contextNodeCount} csomópont · ${result.contextEdgeCount} kapcsolat.`);
  } catch (error) {
    if (state.chatStopRequested || error.name === 'AbortError') {
      addChatTraceStep('A válasz generálását a felhasználó leállította.', 'error');
      state.chatMessages.push({ role: 'assistant', text: 'A válasz generálása leállítva.', stopped: true, at: new Date().toISOString() });
      setStatus('A válasz generálása leállítva.');
    } else {
      addChatTraceStep(`Hiba: ${error.message}`, 'error');
      state.chatMessages.push({ role: 'assistant', text: `Hiba: ${error.message}`, error: true, at: new Date().toISOString() });
      setStatus(error.message, true);
    }
  } finally {
    typing.remove();
    state.chatController = null;
    state.chatRequestId = null;
    state.chatStopRequested = false;
    setChatBusy(false);
    renderChatMessages();
  }
}

async function stopChatResponse() {
  if (!state.chatBusy || !state.chatRequestId || state.chatStopRequested) return;
  state.chatStopRequested = true;
  byId('stopChatButton').disabled = true;
  byId('stopChatButton').textContent = 'Leállítás…';
  addChatTraceStep('Válasz leállításának kérése elküldve', 'active');
  const requestId = state.chatRequestId;
  try {
    await fetch('/api/ai/chat/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId })
    });
  } catch (_) {
    // A kliensoldali megszakítás ettől függetlenül megtörténik.
  } finally {
    state.chatController?.abort();
  }
}


function nanosToSeconds(value) {
  return Number(value || 0) / 1e9;
}

function formatDurationNanos(value) {
  const nanos = Number(value || 0);
  if (!nanos) return '0 ms';
  const ms = nanos / 1e6;
  return ms < 1000 ? `${ms.toFixed(1)} ms` : `${(ms / 1000).toFixed(2)} mp`;
}

function renderMeasuredChatTrace(result, fallbackStatus) {
  const trace = result?.trace;
  if (!trace) return;
  const list = byId('chatTraceSteps');
  list.replaceChildren();
  let cumulative = 0;
  const phases = [
    ['Kérés fogadása és projektgráf betöltése', trace.graphLoadDurationNanos],
    [trace.vectorIndexUsed ? `Kérdés embedding és vektoros keresés · ${(trace.vectorHits || []).length} találat` : 'Kulcsszavas és gráf alapú keresés', trace.vectorSearchDurationNanos],
    ['Releváns csomópontok és kapcsolatok kiválasztása', Math.max(0, Number(trace.selectionDurationNanos || 0) - Number(trace.vectorSearchDurationNanos || 0))],
    ['Gráfkontextus szöveges összeállítása', trace.graphSerializationDurationNanos],
    [`Forráskódrészletek beolvasása · ${trace.sourceFileCount || 0} fájl`, trace.sourceReadDurationNanos],
    ['Végső prompt összeállítása', trace.promptAssemblyDurationNanos],
    ['Ollama modell betöltése/előkészítése', trace.ollamaLoadDurationNanos],
    [`Prompt feldolgozása · ${result.promptTokens || 0} token`, trace.ollamaPromptEvalDurationNanos],
    [`Válasz generálása · ${result.responseTokens || 0} token`, trace.ollamaEvalDurationNanos]
  ];
  for (const [label, duration] of phases) {
    const seconds = nanosToSeconds(duration);
    cumulative += seconds;
    addMeasuredTraceStep(label, cumulative, seconds);
  }
  const serverSeconds = nanosToSeconds(trace.serverTotalDurationNanos);
  if (serverSeconds > cumulative + 0.001) {
    addMeasuredTraceStep('Szerveroldali JSON feldolgozás és válasz összeállítása', serverSeconds, serverSeconds - cumulative);
    cumulative = serverSeconds;
  }
  const clientSeconds = state.chatTraceStartedAt ? (performance.now() - state.chatTraceStartedAt) / 1000 : serverSeconds;
  const transportSeconds = Math.max(0, clientSeconds - serverSeconds);
  addMeasuredTraceStep(`HTTP válasz fogadva · ${trace.ollama?.httpStatus || fallbackStatus}`, Math.max(clientSeconds, serverSeconds), transportSeconds);
  addMeasuredTraceStep('Válasz és forráshivatkozások megjelenítése', Math.max(clientSeconds, serverSeconds), 0);
}

function addMeasuredTraceStep(text, cumulativeSeconds, phaseSeconds) {
  const item = document.createElement('li');
  item.className = 'chat-trace-step done';
  const time = document.createElement('span');
  time.className = 'chat-trace-time';
  time.textContent = `+${Number(cumulativeSeconds || 0).toFixed(2)} mp`;
  const label = document.createElement('span');
  label.textContent = `${text} · ${phaseSeconds < 1 ? `${(phaseSeconds * 1000).toFixed(1)} ms` : `${phaseSeconds.toFixed(2)} mp`}`;
  item.append(time, label);
  byId('chatTraceSteps').append(item);
}

function resetChatTrace() {
  state.chatTraceStartedAt = performance.now();
  byId('chatTraceSteps').replaceChildren();
}

function addChatTraceStep(text, status = 'done') {
  const item = document.createElement('li');
  item.className = `chat-trace-step ${status}`;
  const elapsed = state.chatTraceStartedAt ? ((performance.now() - state.chatTraceStartedAt) / 1000).toFixed(2) : '0.00';
  const time = document.createElement('span');
  time.className = 'chat-trace-time';
  time.textContent = `+${elapsed} mp`;
  const label = document.createElement('span');
  label.textContent = text;
  item.append(time, label);
  byId('chatTraceSteps').append(item);
}

function prettyBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function formatChatTimestamp(isoValue) {
  if (!isoValue) return '–';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

function openCommunicationSidebar(result = null, title = 'Háttérkommunikáció') {
  const sidebar = byId('communicationSidebar');
  sidebar.hidden = false;
  document.body.classList.add('communication-sidebar-open');
  byId('communicationSidebarTitle').textContent = title;
  if (result?.trace?.ollama) renderCommunicationSidebarDetails(result);
  requestAnimationFrame(() => byId('closeCommunicationSidebarButton').focus());
}

function closeCommunicationSidebar() {
  byId('communicationSidebar').hidden = true;
  document.body.classList.remove('communication-sidebar-open');
}

function renderCommunicationSidebarDetails(result) {
  const target = byId('communicationSidebarDetails');
  target.replaceChildren();
  const trace = result.trace;
  const ollama = trace.ollama;
  const overview = document.createElement('dl');
  overview.className = 'chat-communication-overview';
  const rows = [
    ['Folyamat', trace.pipeline],
    ['Célcím', ollama.endpoint],
    ['HTTP', `${ollama.method} · ${ollama.httpStatus} · ${ollama.contentType}`],
    ['Szerver teljes ideje', formatDurationNanos(trace.serverTotalDurationNanos)],
    ['Kontextusépítés összesen', formatDurationNanos(trace.contextBuildDurationNanos)],
    ['Projektgráf betöltése', formatDurationNanos(trace.graphLoadDurationNanos)],
    ['Vektoros keresés', trace.vectorIndexUsed ? `${trace.embeddingModel} · ${formatDurationNanos(trace.vectorSearchDurationNanos)} · ${(trace.vectorHits || []).length} találat` : 'nincs kész index'],
    ['Találatok és gráf kiválasztása', formatDurationNanos(Math.max(0, Number(trace.selectionDurationNanos || 0) - Number(trace.vectorSearchDurationNanos || 0)))],
    ['Gráfkontextus összeállítása', `${formatDurationNanos(trace.graphSerializationDurationNanos)} · ${trace.contextCharacters} karakter`],
    ['Forráskód beolvasása', `${formatDurationNanos(trace.sourceReadDurationNanos)} · ${trace.sourceFileCount || 0} fájl`],
    ['Prompt összeállítása', formatDurationNanos(trace.promptAssemblyDurationNanos)],
    ['Ollama modellbetöltés', formatDurationNanos(trace.ollamaLoadDurationNanos)],
    ['Ollama promptfeldolgozás', `${formatDurationNanos(trace.ollamaPromptEvalDurationNanos)} · ${result.promptTokens || 0} token`],
    ['Ollama generálás', `${formatDurationNanos(trace.ollamaEvalDurationNanos)} · ${result.responseTokens || 0} token`],
    ['Ollama kérés', prettyBytes(ollama.requestBytes)],
    ['Ollama válasz', prettyBytes(ollama.responseBytes)],
    ['Beállítás', `num_ctx=${ollama.contextSize}, temperature=${ollama.temperature}`],
    ['Tokenek', `prompt=${result.promptTokens || 0}, válasz=${result.responseTokens || 0}`],
    ['Ollama által mért teljes idő', formatDurationNanos(result.totalDurationNanos)],
    ['Ollama HTTP round-trip', formatDurationNanos(ollama.roundTripNanos)],
    ['Generálási sebesség', trace.ollamaEvalDurationNanos && result.responseTokens ? `${(result.responseTokens / nanosToSeconds(trace.ollamaEvalDurationNanos)).toFixed(2)} token/mp` : '–']
  ];
  for (const [key, value] of rows) {
    const dt = document.createElement('dt'); dt.textContent = key;
    const dd = document.createElement('dd'); dd.textContent = value;
    overview.append(dt, dd);
  }
  target.append(overview);

  const requestDetails = document.createElement('details');
  requestDetails.className = 'chat-payload';
  const requestSummary = document.createElement('summary');
  requestSummary.textContent = 'Ollamának elküldött teljes JSON kérés';
  const requestPre = document.createElement('pre');
  requestPre.textContent = ollama.requestJson || '';
  requestDetails.append(requestSummary, requestPre);

  const responseDetails = document.createElement('details');
  responseDetails.className = 'chat-payload';
  const responseSummary = document.createElement('summary');
  responseSummary.textContent = 'Ollamától kapott teljes JSON válasz';
  const responsePre = document.createElement('pre');
  responsePre.textContent = ollama.responseJson || '';
  responseDetails.append(responseSummary, responsePre);
  target.append(requestDetails, responseDetails);
}

function appendCommunicationTrace(bubble, result) {
  if (!result?.trace?.ollama) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary chat-communication-button';
  const roundTrip = result.trace.ollama.roundTripNanos ? (result.trace.ollama.roundTripNanos / 1e9).toFixed(2) : '–';
  button.textContent = `Háttérkommunikáció · ${roundTrip} mp`;
  button.addEventListener('click', () => openCommunicationSidebar(result, 'Válasz háttérkommunikációja'));
  bubble.append(button);
}

function setChatBusy(busy) {
  state.chatBusy = busy;
  byId('sendChatButton').disabled = busy || !byId('chatModelSelect').value;
  byId('chatQuestion').disabled = busy;
  byId('sendChatButton').textContent = busy ? 'Helyi feldolgozás…' : 'Kérdés elküldése';
  byId('stopChatButton').hidden = !busy;
  byId('stopChatButton').disabled = !busy;
  byId('stopChatButton').textContent = 'Válasz leállítása';
}

function appendTypingMessage() {
  const article = document.createElement('article');
  article.className = 'chat-message assistant';
  article.innerHTML = '<div class="chat-avatar">AI</div><div class="chat-bubble"><span class="chat-typing" aria-label="A helyi modell válaszol"><i></i><i></i><i></i></span></div>';
  byId('chatMessages').append(article);
  byId('chatMessages').scrollTop = byId('chatMessages').scrollHeight;
  return article;
}

function renderChatMessages() {
  const box = byId('chatMessages');
  box.replaceChildren();
  if (!state.chatMessages.length) {
    const empty = document.createElement('article');
    empty.className = 'chat-message assistant';
    empty.innerHTML = '<div class="chat-avatar">AI</div><div class="chat-bubble"><p>Elemezz egy projektet, majd kérdezz rá egy funkcióra, metódusra, API-ra vagy teljes végrehajtási útvonalra.</p></div>';
    box.append(empty);
    return;
  }
  for (const message of state.chatMessages) {
    const article = document.createElement('article');
    article.className = `chat-message ${message.role}`;
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = message.role === 'user' ? 'Te' : 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    const answer = document.createElement('pre');
    answer.className = 'chat-answer';
    answer.textContent = message.text;
    bubble.append(answer);
    const timestamp = document.createElement('div');
    timestamp.className = 'chat-timestamp';
    timestamp.textContent = `${message.role === 'user' ? 'Kérdés ideje' : 'Válasz ideje'}: ${formatChatTimestamp(message.at)}`;
    bubble.append(timestamp);
    if (message.result) {
      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      const seconds = message.result.totalDurationNanos ? (message.result.totalDurationNanos / 1e9).toFixed(1) : '–';
      const rag = message.result.trace?.vectorIndexUsed ? ' · vektoros RAG' : ' · alap keresés';
      meta.textContent = `${message.result.model} · ${message.result.contextNodeCount} csomópont · ${message.result.contextEdgeCount} kapcsolat${rag} · ${seconds} mp`;
      bubble.append(meta);
      const refs = document.createElement('div');
      refs.className = 'chat-references';
      for (const reference of message.result.references || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary chat-reference';
        button.textContent = `${reference.path}:${reference.line || 1}`;
        button.addEventListener('click', () => openSourceCodeWindow({
          name: reference.path.split('/').pop(), path: reference.path, line: reference.line || 1, type: 'SOURCE_REFERENCE'
        }));
        refs.append(button);
      }
      if (refs.children.length) bubble.append(refs);
      appendCommunicationTrace(bubble, message.result);
    }
    if (message.role === 'user') article.append(bubble, avatar); else article.append(avatar, bubble);
    box.append(article);
  }
  box.scrollTop = box.scrollHeight;
}

function clearChat() {
  state.chatMessages = [];
  renderChatMessages();
  setStatus('A helyi beszélgetés törölve.');
}

function exportChatMarkdown() {
  if (!state.chatMessages.length) return setStatus('Nincs exportálható beszélgetés.', true);
  const lines = ['# Source Graph Explorer – helyi AI beszélgetés', '', `Modell: ${byId('chatModelSelect').value}`, ''];
  state.chatMessages.forEach(message => {
    lines.push(message.role === 'user' ? '## Kérdés' : '## Válasz', '', `${message.role === 'user' ? 'Kérdés ideje' : 'Válasz ideje'}: ${formatChatTimestamp(message.at)}`, '', message.text, '');
    if (message.result?.references?.length) {
      lines.push('### Forráshivatkozások', ...message.result.references.map(ref => `- ${ref.path}:${ref.line || 1}`), '');
    }
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `source-graph-ai-chat-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
}

byId('chatUseSelection').addEventListener('change', refreshChatContextLabel);
byId('openCommunicationSidebarButton').addEventListener('click', () => openCommunicationSidebar());
byId('closeCommunicationSidebarButton').addEventListener('click', closeCommunicationSidebar);
byId('communicationSidebarBackdrop').addEventListener('click', closeCommunicationSidebar);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !byId('communicationSidebar').hidden) closeCommunicationSidebar(); });
