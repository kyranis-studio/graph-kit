const state = {
  nodes: {},
  edges: [],
  nodeOrder: [],
  nodeStatus: {},
  nodeOutputs: {},
  nodeDurations: {},
  nodeErrors: {},
  streamState: {},
  debugMode: false,
  running: false,
  paused: false,
  completed: false,
  selectedNodeId: null,
  nodePositions: {},
};

const els = {
  graphSvg: document.getElementById('graphSvg'),
  graphContainer: document.getElementById('graphContainer'),
  graphViewport: document.getElementById('graphViewport'),
  debugLog: document.getElementById('debugLog'),
  nodeDetails: document.getElementById('nodeDetails'),
  detailContent: document.getElementById('detailContent'),
  detailTitle: document.getElementById('detailTitle'),
  nodeCounter: document.getElementById('nodeCounter'),
  statusText: document.getElementById('statusText'),
  graphName: document.getElementById('graphName'),
  modeBadge: document.getElementById('modeBadge'),
  mainContainer: document.getElementById('mainContainer'),
  btnExecute: document.getElementById('btnExecute'),
  btnStep: document.getElementById('btnStep'),
  btnCancel: document.getElementById('btnCancel'),
  btnClearLog: document.getElementById('btnClearLog'),
  btnCloseDetails: document.getElementById('btnCloseDetails'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomReset: document.getElementById('btnZoomReset'),
  zoomDisplay: document.getElementById('zoomDisplay'),
  zoomLevel: document.getElementById('zoomLevel'),
  resizeHandle: document.getElementById('resizeHandle'),
  rightPanel: document.getElementById('rightPanel'),
};

const NODE_W = 160;
const NODE_H = 60;
const H_GAP = 80;
const V_GAP = 40;
const PADDING = 40;

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.15;

let transform = { scale: 1, x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

const streamEntries = {};

const STATUS_COLORS = {
  pending: { fill: '#2a2a2e', stroke: '#444', text: '#9ca3af' },
  running: { fill: 'rgba(98,130,255,0.12)', stroke: '#6282ff', text: '#6282ff' },
  completed: { fill: 'rgba(34,197,94,0.12)', stroke: '#22c55e', text: '#22c55e' },
  error: { fill: 'rgba(239,68,68,0.12)', stroke: '#ef4444', text: '#ef4444' },
  skipped: { fill: '#1a1a1e', stroke: '#6b7280', text: '#6b7280' },
};

function addLog(type, text, nodeId, streamKey) {
  if (streamKey && streamEntries[streamKey]) {
    const entry = streamEntries[streamKey];
    const textNodes = Array.from(entry.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    if (textNodes.length > 0) textNodes[textNodes.length - 1].textContent = text;
    entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return entry;
  }
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  const time = new Date().toLocaleTimeString();
  const ts = document.createElement('span');
  ts.className = 'timestamp';
  ts.textContent = time + ' ';
  entry.appendChild(ts);
  if (nodeId) {
    const nl = document.createElement('span');
    nl.className = 'node-label';
    nl.textContent = `[${nodeId}] `;
    entry.appendChild(nl);
  }
  const txt = document.createTextNode(text);
  entry.appendChild(txt);
  els.debugLog.appendChild(entry);
  entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
  if (streamKey) streamEntries[streamKey] = entry;
  return entry;
}

function setStatus(text, cls) {
  els.statusText.textContent = text;
  els.statusText.className = 'status-text' + (cls ? ' ' + cls : '');
}

function showToast(msg, type, duration) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => toast.classList.remove('show'), duration || 3000);
}

// ── Zoom / Pan ──

function applyTransform() {
  const g = els.graphSvg.querySelector('g[data-transform-group]');
  if (g) {
    g.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.scale})`);
  }
  const pct = Math.round(transform.scale * 100);
  const display = pct + '%';
  els.zoomDisplay.textContent = display;
  if (els.zoomLevel) els.zoomLevel.textContent = display;
}

function zoomAtPoint(newScale, cx, cy) {
  const prevScale = transform.scale;
  transform.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
  const ratio = transform.scale / prevScale;
  transform.x = cx - ratio * (cx - transform.x);
  transform.y = cy - ratio * (cy - transform.y);
  applyTransform();
}

function zoomIn() { zoomAtPoint(transform.scale + ZOOM_STEP, 0, 0); }
function zoomOut() { zoomAtPoint(transform.scale - ZOOM_STEP, 0, 0); }
function zoomReset() {
  transform = { scale: 1, x: 0, y: 0 };
  applyTransform();
}

els.btnZoomIn.addEventListener('click', zoomIn);
els.btnZoomOut.addEventListener('click', zoomOut);
els.btnZoomReset.addEventListener('click', zoomReset);

els.graphViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = els.graphViewport.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const dir = -Math.sign(e.deltaY);
  zoomAtPoint(transform.scale + dir * ZOOM_STEP, cx, cy);
}, { passive: false });

els.graphViewport.addEventListener('mousedown', (e) => {
  if (e.target === els.graphSvg || e.target.closest('svg') && !e.target.closest('g[data-node-id]') && !e.target.closest('path')) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panOrigin = { x: transform.x, y: transform.y };
    els.graphViewport.classList.add('panning');
  }
});

document.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  transform.x = panOrigin.x + dx;
  transform.y = panOrigin.y + dy;
  applyTransform();
});

document.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    els.graphViewport.classList.remove('panning');
  }
});

// ── Resizable Sidebar ──

let isResizing = false;

els.resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isResizing = true;
  document.body.classList.add('resizing');
  els.resizeHandle.classList.add('active');
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const containerRect = els.mainContainer.getBoundingClientRect();
  let width = containerRect.right - e.clientX;
  width = Math.min(Math.max(width, 200), containerRect.width * 0.6);
  els.rightPanel.style.width = width + 'px';
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.classList.remove('resizing');
    els.resizeHandle.classList.remove('active');
  }
});

// ── Graph Layout ──

function layoutGraph(nodes, edges) {
  const nodeMap = {};
  nodes.forEach((n) => { nodeMap[n.id] = n; });
  const inDegree = {};
  nodes.forEach((n) => { inDegree[n.id] = 0; });
  edges.forEach((e) => { inDegree[e.targetNodeId] = (inDegree[e.targetNodeId] || 0) + 1; });
  const layers = [];
  let current = nodes.filter((n) => inDegree[n.id] === 0);
  const visited = new Set();
  while (current.length > 0) {
    layers.push([...current]);
    current.forEach((n) => visited.add(n.id));
    const next = [];
    const nextSet = new Set();
    current.forEach((n) => {
      edges.filter((e) => e.sourceNodeId === n.id).forEach((e) => {
        if (!visited.has(e.targetNodeId) && !nextSet.has(e.targetNodeId)) {
          const tgt = nodeMap[e.targetNodeId];
          if (tgt) { next.push(tgt); nextSet.add(e.targetNodeId); }
        }
      });
    });
    current = next;
  }
  const positions = {};
  const svgW = els.graphSvg.clientWidth || 800;
  const svgH = els.graphSvg.clientHeight || 600;
  const totalW = layers.length * (NODE_W + H_GAP) - H_GAP + PADDING * 2;
  const offsetX = Math.max(PADDING, (svgW - totalW) / 2 + PADDING);
  layers.forEach((layer, li) => {
    const totalH = layer.length * NODE_H + (layer.length - 1) * V_GAP;
    const startY = Math.max(PADDING, (svgH - totalH) / 2);
    layer.forEach((node, ni) => {
      positions[node.id] = {
        x: li * (NODE_W + H_GAP) + offsetX,
        y: startY + ni * (NODE_H + V_GAP),
      };
    });
  });
  return positions;
}

// ── Render ──

function renderGraph(data) {
  const { nodes, edges } = data;
  const positions = layoutGraph(nodes, edges);
  state.nodePositions = positions;

  const svg = els.graphSvg;

  const defs = svg.querySelector('defs');
  svg.innerHTML = '';
  if (defs) svg.appendChild(defs);

  const transformGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  transformGroup.setAttribute('data-transform-group', '');
  transformGroup.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.scale})`);

  const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgeGroup.setAttribute('class', 'edges');
  const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodeGroup.setAttribute('class', 'nodes');

  let maxX = 0, maxY = 0;
  Object.values(positions).forEach((p) => {
    maxX = Math.max(maxX, p.x + NODE_W + PADDING);
    maxY = Math.max(maxY, p.y + NODE_H + PADDING);
  });
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Edges
  edges.forEach((edge) => {
    const src = positions[edge.sourceNodeId];
    const tgt = positions[edge.targetNodeId];
    if (!src || !tgt) return;
    const x1 = src.x + NODE_W;
    const y1 = src.y + NODE_H / 2;
    const x2 = tgt.x;
    const y2 = tgt.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} Q ${cx} ${y1} ${cx} ${y2} Q ${cx} ${y2} ${x2} ${y2}`;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#444');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.dataset.edgeId = edge.id;
    edgeGroup.appendChild(path);
  });

  // Nodes
  nodes.forEach((node) => {
    const pos = positions[node.id];
    if (!pos) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.nodeId = node.id;
    g.style.cursor = 'pointer';
    const colors = STATUS_COLORS.pending;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', pos.x);
    rect.setAttribute('y', pos.y);
    rect.setAttribute('width', NODE_W);
    rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', 8);
    rect.setAttribute('ry', 8);
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', '1.5');
    rect.dataset.status = 'pending';
    g.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const displayName = node.label || node.id;
    label.setAttribute('x', pos.x + NODE_W / 2);
    label.setAttribute('y', pos.y + NODE_H / 2 - 2);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('fill', colors.text);
    label.setAttribute('font-size', '11px');
    label.setAttribute('font-weight', '500');
    label.textContent = displayName.length > 20 ? displayName.slice(0, 18) + '..' : displayName;
    g.appendChild(label);

    const typeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    typeLabel.setAttribute('x', pos.x + NODE_W / 2);
    typeLabel.setAttribute('y', pos.y + NODE_H / 2 + 14);
    typeLabel.setAttribute('text-anchor', 'middle');
    typeLabel.setAttribute('dominant-baseline', 'central');
    typeLabel.setAttribute('fill', '#6b7280');
    typeLabel.setAttribute('font-size', '9px');
    typeLabel.textContent = node.type;
    g.appendChild(typeLabel);

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', pos.x + NODE_W - 12);
    dot.setAttribute('cy', pos.y + 12);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', '#444');
    dot.dataset.dot = 'status';
    g.appendChild(dot);

    g.addEventListener('click', (ev) => {
      ev.stopPropagation();
      showNodeDetails(node.id);
    });

    nodeGroup.appendChild(g);
  });

  transformGroup.appendChild(edgeGroup);
  transformGroup.appendChild(nodeGroup);
  svg.appendChild(transformGroup);

  applyTransform();
}

// ── Node Status Updates ──

function updateNodeStatus(nodeId, status, extra) {
  state.nodeStatus[nodeId] = status;
  const svg = els.graphSvg;
  const g = svg.querySelector(`g[data-node-id="${nodeId}"]`);
  if (!g) return;
  const rect = g.querySelector('rect');
  const text = g.querySelector('text');
  const dot = g.querySelector('circle[data-dot="status"]');
  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;
  if (rect) {
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', status === 'running' ? '2' : '1.5');
  }
  if (text) text.setAttribute('fill', colors.text);
  if (dot) dot.setAttribute('fill', colors.stroke);
  if (status === 'completed') {
    const nodeEdges = state.edges.filter((e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId);
    nodeEdges.forEach((edge) => {
      const path = svg.querySelector(`path[data-edge-id="${edge.id}"]`);
      if (path) path.setAttribute('stroke', '#6282ff');
    });
  }
}

// ── Node Details ──

function showNodeDetails(nodeId) {
  state.selectedNodeId = nodeId;
  els.nodeDetails.style.display = 'block';
  const node = state.nodes[nodeId];
  if (!node) return;
  els.detailTitle.textContent = `Node: ${node.label || nodeId}`;
  const content = els.detailContent;
  content.innerHTML = '';

  const infoSec = document.createElement('div');
  infoSec.className = 'detail-section';
  infoSec.innerHTML = `<div class="detail-section-title">Info</div>`;
  infoSec.innerHTML += `<div class="detail-item"><span class="detail-key">ID</span><span class="detail-value">${nodeId}</span></div>`;
  infoSec.innerHTML += `<div class="detail-item"><span class="detail-key">Type</span><span class="detail-value">${node.type}</span></div>`;
  infoSec.innerHTML += `<div class="detail-item"><span class="detail-key">Status</span><span class="detail-value">${state.nodeStatus[nodeId] || 'pending'}</span></div>`;
  if (state.nodeDurations[nodeId] !== undefined) {
    const d = state.nodeDurations[nodeId];
    infoSec.innerHTML += `<div class="detail-item"><span class="detail-key">Duration</span><span class="detail-value">${d >= 1000 ? (d / 1000).toFixed(2) + 's' : d.toFixed(1) + 'ms'}</span></div>`;
  }
  content.appendChild(infoSec);

  if (node.inputs.length > 0) {
    const portsSec = document.createElement('div');
    portsSec.className = 'detail-section';
    portsSec.innerHTML = `<div class="detail-section-title">Inputs</div>`;
    node.inputs.forEach((p) => {
      portsSec.innerHTML += `<div class="detail-item"><span class="detail-key">${p.name}</span><span class="detail-value">${p.type}</span></div>`;
    });
    content.appendChild(portsSec);
  }

  if (node.outputs.length > 0) {
    const portsSec = document.createElement('div');
    portsSec.className = 'detail-section';
    portsSec.innerHTML = `<div class="detail-section-title">Outputs</div>`;
    node.outputs.forEach((p) => {
      portsSec.innerHTML += `<div class="detail-item"><span class="detail-key">${p.name}</span><span class="detail-value">${p.type}</span></div>`;
    });
    content.appendChild(portsSec);
  }

  const nodeInfo = state.nodeOutputs[nodeId];
  if (nodeInfo && nodeInfo.inputs && Object.keys(nodeInfo.inputs).length > 0) {
    const inSec = document.createElement('div');
    inSec.className = 'detail-section';
    inSec.innerHTML = `<div class="detail-section-title">Input Values</div>`;
    for (const [k, v] of Object.entries(nodeInfo.inputs)) {
      inSec.innerHTML += `<div class="detail-item"><span class="detail-key">${k}</span><span class="detail-value">${truncate(v, 200)}</span></div>`;
    }
    content.appendChild(inSec);
  }

  if (nodeInfo && nodeInfo.outputs && Object.keys(nodeInfo.outputs).length > 0) {
    const outSec = document.createElement('div');
    outSec.className = 'detail-section';
    outSec.innerHTML = `<div class="detail-section-title">Output Values</div>`;
    for (const [k, v] of Object.entries(nodeInfo.outputs)) {
      outSec.innerHTML += `<div class="detail-item"><span class="detail-key">${k}</span><span class="detail-value">${truncate(v, 200)}</span></div>`;
    }
    content.appendChild(outSec);
  }

  const stream = state.streamState[nodeId];
  if (stream) {
    const streamSec = document.createElement('div');
    streamSec.className = 'detail-section';
    streamSec.innerHTML = `<div class="detail-section-title">Streaming</div>`;
    if (stream.thinking) {
      streamSec.innerHTML += `<div class="detail-item"><span class="detail-key">Thinking</span><span class="detail-value streaming">${truncate(stream.thinking, 500)}</span></div>`;
    }
    streamSec.innerHTML += `<div class="detail-item"><span class="detail-key">Response</span><span class="detail-value streaming">${truncate(stream.response, 500)}</span></div>`;
    content.appendChild(streamSec);
  }

  if (state.nodeErrors[nodeId]) {
    const errSec = document.createElement('div');
    errSec.className = 'detail-section';
    errSec.innerHTML = `<div class="detail-section-title" style="color:var(--error)">Error</div>`;
    errSec.innerHTML += `<div class="detail-item"><span class="detail-value" style="color:var(--error)">${state.nodeErrors[nodeId]}</span></div>`;
    content.appendChild(errSec);
  }
}

function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

function updateControls() {
  els.btnExecute.style.display = state.running ? 'none' : 'inline-block';
  els.btnCancel.style.display = state.running ? 'inline-block' : 'none';
  els.btnStep.style.display = (state.running && state.paused) ? 'inline-block' : 'none';
  els.btnExecute.disabled = state.running;
}

// ── SSE ──

function connectSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('executionStart', (e) => {
    const data = JSON.parse(e.data);
    for (const key in streamEntries) delete streamEntries[key];
    state.running = true;
    state.paused = false;
    state.completed = false;
    state.nodeOrder = data.nodeOrder || [];
    state.nodeStatus = {};
    state.nodeOutputs = {};
    state.nodeDurations = {};
    state.nodeErrors = {};
    state.streamState = {};
    updateControls();
    setStatus('Running...', 'running');
    addLog('info', `Execution started — ${data.totalNodes} nodes`);
    showToast('Execution started', 'info');
    state.nodeOrder.forEach((nid) => updateNodeStatus(nid, 'pending'));
  });

  evtSource.addEventListener('nodeStart', (e) => {
    const data = JSON.parse(e.data);
    delete streamEntries[data.nodeId + ':thinking'];
    delete streamEntries[data.nodeId + ':response'];
    state.nodeOutputs[data.nodeId] = { inputs: data.inputs || {}, outputs: {} };
    updateNodeStatus(data.nodeId, 'running');
    addLog('node-start', `${data.index}/${data.total} ${data.nodeType}${data.label ? ' (' + data.label + ')' : ''}`, data.nodeId);
  });

  evtSource.addEventListener('nodeComplete', (e) => {
    const data = JSON.parse(e.data);
    updateNodeStatus(data.nodeId, 'completed');
    state.nodeDurations[data.nodeId] = data.duration;
    if (state.nodeOutputs[data.nodeId]) {
      state.nodeOutputs[data.nodeId].outputs = data.outputs || {};
    }
    const durStr = data.duration >= 1000 ? (data.duration / 1000).toFixed(2) + 's' : data.duration.toFixed(1) + 'ms';
    addLog('node-complete', `✓ completed in ${durStr}`, data.nodeId);
    if (state.selectedNodeId === data.nodeId) showNodeDetails(data.nodeId);
  });

  evtSource.addEventListener('nodeError', (e) => {
    const data = JSON.parse(e.data);
    updateNodeStatus(data.nodeId, 'error');
    state.nodeErrors[data.nodeId] = data.error;
    addLog('node-error', `✗ ${data.error}`, data.nodeId);
    if (state.selectedNodeId === data.nodeId) showNodeDetails(data.nodeId);
    showToast(`Node ${data.nodeId} failed: ${data.error}`, 'error', 5000);
  });

  evtSource.addEventListener('nodeSkipped', (e) => {
    const data = JSON.parse(e.data);
    updateNodeStatus(data.nodeId, 'skipped');
    addLog('info', 'Skipped (cancelled)', data.nodeId);
  });

  evtSource.addEventListener('executionPaused', (e) => {
    const data = JSON.parse(e.data);
    state.paused = true;
    updateControls();
    setStatus('Paused', 'paused');
    addLog('paused', `Paused before ${data.nodeId} — press Step to continue`, data.nodeId);
    showToast('Execution paused', 'info');
  });

  evtSource.addEventListener('executionResumed', () => {
    state.paused = false;
    updateControls();
    setStatus('Running...', 'running');
  });

  evtSource.addEventListener('streamChunk', (e) => {
    const data = JSON.parse(e.data);
    state.streamState[data.nodeId] = data.state;
    if (data.state.thinking) {
      addLog('stream-thinking', data.state.thinking, data.nodeId, data.nodeId + ':thinking');
    }
    if (data.state.response) {
      addLog('stream-response', data.state.response, data.nodeId, data.nodeId + ':response');
    }
    if (state.selectedNodeId === data.nodeId) showNodeDetails(data.nodeId);
  });

  evtSource.addEventListener('graphComplete', (e) => {
    const data = JSON.parse(e.data);
    state.running = false;
    state.paused = false;
    state.completed = true;
    updateControls();
    if (data.success) {
      setStatus('Completed', 'completed');
      addLog('info', '✓ Graph completed successfully');
      showToast('Graph completed', 'success');
    } else {
      setStatus('Cancelled', 'error');
      addLog('info', 'Execution cancelled');
    }
  });

  evtSource.addEventListener('executionError', (e) => {
    const data = JSON.parse(e.data);
    state.running = false;
    state.paused = false;
    updateControls();
    setStatus('Error', 'error');
    addLog('error', `Execution error: ${data.error}`);
    showToast(`Execution error: ${data.error}`, 'error', 5000);
  });

  evtSource.onerror = () => console.error('SSE connection error');
  return evtSource;
}

// ── Controls ──

els.btnExecute.addEventListener('click', async () => {
  try {
    const resp = await fetch('/api/execute', { method: 'POST' });
    if (!resp.ok) throw new Error('Failed to start execution');
  } catch (err) {
    showToast('Failed to start execution: ' + err.message, 'error');
  }
});

els.btnStep.addEventListener('click', async () => {
  try {
    await fetch('/api/step', { method: 'POST' });
  } catch (err) {
    showToast('Failed to step: ' + err.message, 'error');
  }
});

els.btnCancel.addEventListener('click', async () => {
  try {
    await fetch('/api/cancel', { method: 'POST' });
  } catch (err) {
    showToast('Failed to cancel: ' + err.message, 'error');
  }
});

els.btnClearLog.addEventListener('click', () => {
  els.debugLog.innerHTML = '';
});

els.btnCloseDetails.addEventListener('click', () => {
  els.nodeDetails.style.display = 'none';
  state.selectedNodeId = null;
});

// ── Init ──

async function init() {
  try {
    const resp = await fetch('/api/graph');
    const data = await resp.json();
    const graph = data.graph;
    state.debugMode = data.debugMode;
    state.nodes = {};
    graph.nodes.forEach((n) => { state.nodes[n.id] = n; });
    state.edges = graph.edges;

    if (graph.metadata?.name) {
      els.graphName.textContent = graph.metadata.name;
    }
    if (state.debugMode) {
      els.modeBadge.textContent = 'Debug Mode';
      els.modeBadge.className = 'mode-badge debug';
      els.mainContainer.classList.add('debug-mode');
    } else {
      els.modeBadge.textContent = 'Auto';
      els.modeBadge.className = 'mode-badge auto';
    }

    els.nodeCounter.textContent = graph.nodes.length + ' nodes, ' + graph.edges.length + ' edges';
    renderGraph(graph);
    connectSSE();
  } catch (err) {
    console.error('Init error:', err);
    setStatus('Failed to load graph', 'error');
    showToast('Failed to load graph: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
