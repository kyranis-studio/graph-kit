// ── Constants ──
const NODE_W = 160;
const NODE_H = 60;
const PADDING = 40;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.15;
const MINIMAP_W = 180;
const MINIMAP_H = 130;

const STATUS_COLORS = {
  pending: { fill: '#2a2a2e', stroke: '#444', bg: '#2a2a2e', text: '#9ca3af', dot: '#444' },
  running: { fill: 'rgba(98,130,255,0.12)', stroke: '#6282ff', bg: 'rgba(98,130,255,0.12)', text: '#6282ff', dot: '#6282ff' },
  completed: { fill: 'rgba(34,197,94,0.12)', stroke: '#22c55e', bg: 'rgba(34,197,94,0.12)', text: '#22c55e', dot: '#22c55e' },
  error: { fill: 'rgba(239,68,68,0.12)', stroke: '#ef4444', bg: 'rgba(239,68,68,0.12)', text: '#ef4444', dot: '#ef4444' },
  skipped: { fill: '#1a1a1e', stroke: '#6b7280', bg: '#1a1a1e', text: '#6b7280', dot: '#6b7280' },
};

// ── DOM References ──
const els = {
  graphCanvas: document.getElementById('graphCanvas'),
  graphContainer: document.getElementById('graphContainer'),
  graphViewport: document.getElementById('graphViewport'),
  minimap: document.getElementById('minimap'),
  minimapSvg: document.getElementById('minimapSvg'),
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

// ── State ──
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
  groups: [],
  collapsedGroups: new Set(),
};

const streamEntries = {};

// ── Transform ──
let transform = { scale: 1, x: 0, y: 0 };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

// ── Layout Cache ──
let layoutCache = { key: null, positions: {}, edgePoints: {}, graphBounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 }, groups: {} };

// ── RAF throttling ──
let pendingMinimap = false;
let resizeObserver = null;

// ── Utilities ──

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function throttleRaf(fn) {
  let scheduled = false;
  return (...args) => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...args);
    });
  };
}

function structureHash(nodes, edges) {
  const structural = nodes.map(n => ({ id: n.id, type: n.type }));
  const edgeStruct = edges.map(e => ({ src: e.sourceNodeId, tgt: e.targetNodeId }));
  let str = JSON.stringify({ nodes: structural, edges: edgeStruct });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash;
}

function computeBounds(positions) {
  const posArr = Object.values(positions);
  if (posArr.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  posArr.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W);
    maxY = Math.max(maxY, p.y + NODE_H);
  });
  return { minX: minX - PADDING, minY: minY - PADDING, maxX: maxX + PADDING, maxY: maxY + PADDING };
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// ── Logging ──

function addLog(type, text, nodeId, streamKey) {
  if (streamKey && streamEntries[streamKey]) {
    const entry = streamEntries[streamKey];
    const textNodes = Array.from(entry.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
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

// ── Layout Engine ──

function simpleLayout(nodes, edges) {
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });
  const inDegree = {};
  nodes.forEach(n => { inDegree[n.id] = 0; });
  edges.forEach(e => { inDegree[e.targetNodeId] = (inDegree[e.targetNodeId] || 0) + 1; });
  const layers = [];
  let current = nodes.filter(n => inDegree[n.id] === 0);
  const visited = new Set();
  while (current.length > 0) {
    layers.push([...current]);
    current.forEach(n => visited.add(n.id));
    const next = [];
    const nextSet = new Set();
    current.forEach(n => {
      edges.filter(e => e.sourceNodeId === n.id).forEach(e => {
        if (!visited.has(e.targetNodeId) && !nextSet.has(e.targetNodeId)) {
          const tgt = nodeMap[e.targetNodeId];
          if (tgt) { next.push(tgt); nextSet.add(e.targetNodeId); }
        }
      });
    });
    current = next;
  }
  const positions = {};
  const offsetX = PADDING;
  layers.forEach((layer, li) => {
    const totalH = layer.length * NODE_H + (layer.length - 1) * 40;
    const startY = Math.max(PADDING, (300 - totalH) / 2);
    layer.forEach((node, ni) => {
      positions[node.id] = {
        x: li * (NODE_W + 80) + offsetX,
        y: startY + ni * (NODE_H + 40),
      };
    });
  });
  return positions;
}

function dagreLayout(nodes, edges, groups) {
  if (typeof dagre === 'undefined') return null;

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: 'LR',
    nodesep: 40,
    ranksep: 80,
    marginx: PADDING,
    marginy: PADDING,
    acyclicer: 'greedy',
  });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(n => {
    g.setNode(n.id, { width: NODE_W, height: NODE_H, label: n.label || n.id });
  });

  edges.forEach(e => {
    g.setEdge(e.sourceNodeId, e.targetNodeId, { id: e.id, label: e.label || '' });
  });

  if (groups && groups.length) {
    groups.forEach(grp => {
      g.setNode(grp.id, { width: 1, height: 1, label: grp.label, clusterPadding: 20 });
      if (grp.nodeIds && grp.nodeIds.length) {
        grp.nodeIds.forEach(nid => {
          if (nodes.find(n => n.id === nid)) {
            g.setParent(nid, grp.id);
          }
        });
      }
    });
  }

  dagre.layout(g);

  const positions = {};
  const edgePoints = {};
  const groupBounds = {};

  g.nodes().forEach(id => {
    if (groups && groups.find(gr => gr.id === id)) {
      const gn = g.node(id);
      const grp = groups.find(gr => gr.id === id);
      if (!grp) return;
      const collapsed = state.collapsedGroups.has(id);
      groupBounds[id] = {
        x: gn.x - gn.width / 2,
        y: gn.y - gn.height / 2,
        w: gn.width,
        h: collapsed ? NODE_H + 20 : gn.height,
        label: grp.label || id,
      };
    } else {
      const gn = g.node(id);
      if (!gn) return;
      positions[id] = {
        x: gn.x - NODE_W / 2,
        y: gn.y - NODE_H / 2,
      };
    }
  });

  g.edges().forEach(e => {
    const edge = g.edge(e);
    if (edge && edge.points) {
      edgePoints[e.v + '|' + e.w] = edge.points;
    }
  });

  return { positions, edgePoints, groupBounds, g };
}

function computeLayout(nodes, edges, groups) {
  const key = structureHash(nodes, edges);
  if (layoutCache.key === key && layoutCache.positions) return layoutCache;

  let result;

  if (typeof dagre !== 'undefined') {
    result = dagreLayout(nodes, edges, groups || state.groups);
  }

  if (!result) {
    const positions = simpleLayout(nodes, edges);
    result = { positions, edgePoints: {}, groupBounds: {}, g: null };
  }

  const graphBounds = computeBounds(result.positions);

  layoutCache = {
    key,
    positions: result.positions,
    edgePoints: result.edgePoints,
    groupBounds: result.groupBounds || {},
    graphBounds,
  };

  return layoutCache;
}

function getCachedLayout() {
  return layoutCache;
}

function invalidateLayout() {
  layoutCache.key = null;
}

// ── Canvas Renderer ──

function initCanvas() {
  const canvas = els.graphCanvas;
  const container = els.graphContainer;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { w, h };
}

function resizeCanvas() {
  if (!els.graphCanvas) return;
  initCanvas();
  redrawCanvas();
}

function renderCanvas(data) {
  const { nodes, edges, groups } = data;
  computeLayout(nodes, edges, groups);

  const { w, h } = initCanvas();

  state._canvasNodes = nodes;
  state._canvasEdges = edges;
  state._canvasGroups = groups || [];

  redrawCanvas();
  updateMinimap();
}

function redrawCanvas() {
  const canvas = els.graphCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, w, h);

  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);

  const layout = layoutCache;
  if (!layout || !layout.positions) { ctx.restore(); return; }

  const nodes = state._canvasNodes || [];
  const edges = state._canvasEdges || [];
  const groups = state._canvasGroups || [];

  // Draw groups
  groups.forEach(grp => {
    const gb = layout.groupBounds[grp.id];
    if (!gb) return;
    const collapsed = state.collapsedGroups.has(grp.id);
    const gh = collapsed ? NODE_H + 20 : gb.h;

    ctx.fillStyle = collapsed ? 'rgba(98,130,255,0.08)' : 'rgba(98,130,255,0.04)';
    ctx.strokeStyle = collapsed ? 'rgba(98,130,255,0.35)' : 'rgba(98,130,255,0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, gb.x, gb.y, gb.w, gh, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#6b7280';
    ctx.font = '600 10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(grp.label || '', gb.x + 14, gb.y + 12);

    ctx.textAlign = 'end';
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px monospace';
    ctx.fillText(collapsed ? '[+]' : '[-]', gb.x + gb.w - 14, gb.y + 12);
  });

  // Draw edges
  edges.forEach(edge => {
    const src = layout.positions[edge.sourceNodeId];
    const tgt = layout.positions[edge.targetNodeId];
    if (!src || !tgt) return;

    const key = edge.sourceNodeId + '|' + edge.targetNodeId;
    const points = layout.edgePoints[key];
    const isActive = state.nodeStatus[edge.sourceNodeId] === 'completed';
    ctx.strokeStyle = isActive ? '#6282ff' : '#444';
    ctx.lineWidth = isActive ? 2 : 1.5;
    ctx.beginPath();

    if (points && points.length >= 2) {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    } else {
      const x1 = src.x + NODE_W;
      const y1 = src.y + NODE_H / 2;
      const x2 = tgt.x;
      const y2 = tgt.y + NODE_H / 2;
      const cx = (x1 + x2) / 2;
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cx, y1, cx, y2);
      ctx.quadraticCurveTo(cx, y2, x2, y2);
    }

    ctx.stroke();

    // Arrowhead
    if (points && points.length >= 2) {
      const lastP = points[points.length - 1];
      const prevP = points[points.length - 2] || lastP;
      drawArrowhead(ctx, lastP.x, lastP.y, Math.atan2(lastP.y - prevP.y, lastP.x - prevP.x), isActive ? '#6282ff' : '#888');
    } else {
      drawArrowhead(ctx, tgt.x, tgt.y + NODE_H / 2, Math.PI, '#888');
    }
  });

  // Draw nodes
  nodes.forEach(node => {
    const pos = layout.positions[node.id];
    if (!pos) return;

    const parentGroup = groups.find(g => g.nodeIds && g.nodeIds.includes(node.id) && state.collapsedGroups.has(g.id));
    if (parentGroup) return;

    const colors = STATUS_COLORS[state.nodeStatus[node.id]] || STATUS_COLORS.pending;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, pos.x + 2, pos.y + 2, NODE_W, NODE_H, 8);
    ctx.fill();

    // Body
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = state.nodeStatus[node.id] === 'running' ? 2 : 1.5;
    roundRect(ctx, pos.x, pos.y, NODE_W, NODE_H, 8);
    ctx.fill();
    ctx.stroke();

    // Status dot
    ctx.fillStyle = colors.dot;
    ctx.beginPath();
    ctx.arc(pos.x + NODE_W - 12, pos.y + 12, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = colors.text;
    ctx.font = '500 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayName = node.label || node.id;
    ctx.fillText(displayName.length > 20 ? displayName.slice(0, 18) + '..' : displayName, pos.x + NODE_W / 2, pos.y + NODE_H / 2 - 2);

    // Type
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.fillText(node.type || '', pos.x + NODE_W / 2, pos.y + NODE_H / 2 + 14);
  });

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawArrowhead(ctx, x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, -3);
  ctx.lineTo(-8, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function canvasHitTest(clientX, clientY) {
  const canvas = els.graphCanvas;
  if (!canvas || canvas.style.display === 'none') return null;

  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const gx = (sx - transform.x) / transform.scale;
  const gy = (sy - transform.y) / transform.scale;

  const layout = layoutCache;
  if (!layout || !layout.positions) return null;

  for (const [id, pos] of Object.entries(layout.positions)) {
    if (gx >= pos.x && gx <= pos.x + NODE_W && gy >= pos.y && gy <= pos.y + NODE_H) {
      return id;
    }
  }
  return null;
}

// ── Minimap ──

function updateMinimap() {
  if (pendingMinimap) return;
  pendingMinimap = true;
  requestAnimationFrame(() => {
    pendingMinimap = false;
    _doUpdateMinimap();
  });
}

function _doUpdateMinimap() {
  const svg = els.minimapSvg;
  const layout = layoutCache;
  if (!layout || !layout.positions) return;

  const bounds = layout.graphBounds;
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  if (bw <= 0 || bh <= 0) return;

  const mmW = svg.clientWidth || MINIMAP_W;
  const mmH = svg.clientHeight || (MINIMAP_H - 22);
  const mmScale = Math.min(mmW / bw, mmH / bh, 1.5);
  const offsetX = (mmW - bw * mmScale) / 2;
  const offsetY = (mmH - bh * mmScale) / 2;

  svg.textContent = '';

  // Edges
  const edgeGroup = svgEl('g', { class: 'minimap-edges' });
  state.edges.forEach(edge => {
    const src = layout.positions[edge.sourceNodeId];
    const tgt = layout.positions[edge.targetNodeId];
    if (!src || !tgt) return;
    const p1 = { x: (src.x + NODE_W / 2 - bounds.minX) * mmScale + offsetX, y: (src.y + NODE_H / 2 - bounds.minY) * mmScale + offsetY };
    const p2 = { x: (tgt.x + NODE_W / 2 - bounds.minX) * mmScale + offsetX, y: (tgt.y + NODE_H / 2 - bounds.minY) * mmScale + offsetY };
    const line = svgEl('line', {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      class: 'minimap-edge', stroke: '#333', 'stroke-width': '0.3',
    });
    edgeGroup.appendChild(line);
  });
  svg.appendChild(edgeGroup);

  // Nodes
  const nodeGroup = svgEl('g', { class: 'minimap-nodes' });
  Object.entries(layout.positions).forEach(([id, pos]) => {
    const nx = (pos.x - bounds.minX) * mmScale + offsetX;
    const ny = (pos.y - bounds.minY) * mmScale + offsetY;
    const nw = NODE_W * mmScale;
    const nh = NODE_H * mmScale;
    const rect = svgEl('rect', {
      x: nx, y: ny, width: Math.max(nw, 2), height: Math.max(nh, 2),
      class: 'minimap-node',
      fill: '#2a2a2e', stroke: '#444', 'stroke-width': '0.5',
      rx: 1, ry: 1,
    });
    nodeGroup.appendChild(rect);
  });
  svg.appendChild(nodeGroup);

  // Viewport
  const vpRect = els.graphViewport.getBoundingClientRect();
  const containerRect = els.graphContainer.getBoundingClientRect();
  const vpLeft = (-transform.x / transform.scale - bounds.minX) * mmScale + offsetX;
  const vpTop = (-transform.y / transform.scale - bounds.minY) * mmScale + offsetY;
  const vpW = (vpRect.width / transform.scale) * mmScale;
  const vpH = (vpRect.height / transform.scale) * mmScale;

  const vp = svgEl('rect', {
    x: vpLeft, y: vpTop, width: vpW, height: vpH,
    class: 'minimap-viewport',
    fill: 'rgba(98,130,255,0.06)',
    stroke: '#6282ff', 'stroke-width': '1',
    'stroke-dasharray': '2,2',
  });
  svg.appendChild(vp);
}

function handleMinimapClick(e) {
  const svg = els.minimapSvg;
  const layout = layoutCache;
  if (!layout || !layout.positions) return;

  const rect = svg.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const bounds = layout.graphBounds;
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  if (bw <= 0 || bh <= 0) return;

  const mmW = svg.clientWidth || MINIMAP_W;
  const mmH = svg.clientHeight || (MINIMAP_H - 22);
  const mmScale = Math.min(mmW / bw, mmH / bh, 1.5);
  const offsetX = (mmW - bw * mmScale) / 2;
  const offsetY = (mmH - bh * mmScale) / 2;

  const gx = (mx - offsetX) / mmScale + bounds.minX;
  const gy = (my - offsetY) / mmScale + bounds.minY;

  const vpW = els.graphViewport.clientWidth;
  const vpH = els.graphViewport.clientHeight;
  transform.x = -gx * transform.scale + vpW / 2;
  transform.y = -gy * transform.scale + vpH / 2;
  applyTransform();
}

// ── Groups ──

function toggleGroup(groupId) {
  if (state.collapsedGroups.has(groupId)) {
    state.collapsedGroups.delete(groupId);
  } else {
    state.collapsedGroups.add(groupId);
  }
  invalidateLayout();
  reRender();
}

// ── Zoom / Pan ──

function applyTransform() {
  redrawCanvas();
  const pct = Math.round(transform.scale * 100);
  const display = pct + '%';
  els.zoomDisplay.textContent = display;
  if (els.zoomLevel) els.zoomLevel.textContent = display;
  updateMinimap();
}

const applyTransformRaf = throttleRaf(applyTransform);

function zoomAtPoint(newScale, cx, cy) {
  const prevScale = transform.scale;
  transform.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
  const ratio = transform.scale / prevScale;
  transform.x = cx - ratio * (cx - transform.x);
  transform.y = cy - ratio * (cy - transform.y);
  applyTransformRaf();
}

function zoomIn() { zoomAtPoint(transform.scale + ZOOM_STEP, 0, 0); }
function zoomOut() { zoomAtPoint(transform.scale - ZOOM_STEP, 0, 0); }
function zoomReset() {
  transform = { scale: 1, x: 0, y: 0 };
  applyTransformRaf();
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
  const target = e.target;
  if (target === els.graphCanvas || target === els.graphViewport) {
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
  applyTransformRaf();
});

document.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    els.graphViewport.classList.remove('panning');
  }
});

// Canvas click handler
if (els.graphCanvas) {
  els.graphCanvas.addEventListener('click', (e) => {
    const nodeId = canvasHitTest(e.clientX, e.clientY);
    if (nodeId) {
      e.stopPropagation();
      showNodeDetails(nodeId);
    }
  });
}

// ── Resizable Sidebar ──

let isResizing = false;

els.resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isResizing = true;
  document.body.classList.add('resizing');
  els.resizeHandle.classList.add('active');
});

const updatePanelWidth = debounce(() => {
  resizeCanvas();
}, 100);

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const containerRect = els.mainContainer.getBoundingClientRect();
  let width = containerRect.right - e.clientX;
  width = Math.min(Math.max(width, 200), containerRect.width * 0.6);
  els.rightPanel.style.width = width + 'px';
  updatePanelWidth();
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    document.body.classList.remove('resizing');
    els.resizeHandle.classList.remove('active');
  }
});

// ResizeObserver for graph container
if (window.ResizeObserver) {
  resizeObserver = new ResizeObserver(debounce(() => {
    resizeCanvas();
  }, 150));
  resizeObserver.observe(els.graphContainer);
}

// Window resize
const handleWindowResize = debounce(() => {
  resizeCanvas();
}, 200);
window.addEventListener('resize', handleWindowResize);

// ── Render Dispatcher ──

function reRender() {
  if (!state._lastGraphData) return;
  renderGraph(state._lastGraphData);
}

function renderGraph(data) {
  state._lastGraphData = data;
  const { nodes, edges } = data;
  const groups = data.groups || [];

  state.groups = groups;

  layoutCache.key = null;

  renderCanvas(data);
}

// ── Node Status Updates ──

function updateNodeStatus(nodeId, status, extra) {
  state.nodeStatus[nodeId] = status;
  redrawCanvas();
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
    node.inputs.forEach(p => {
      portsSec.innerHTML += `<div class="detail-item"><span class="detail-key">${p.name}</span><span class="detail-value">${p.type}</span></div>`;
    });
    content.appendChild(portsSec);
  }

  if (node.outputs.length > 0) {
    const portsSec = document.createElement('div');
    portsSec.className = 'detail-section';
    portsSec.innerHTML = `<div class="detail-section-title">Outputs</div>`;
    node.outputs.forEach(p => {
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
    state.nodeOrder.forEach(nid => updateNodeStatus(nid, 'pending'));
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

// Minimap click
els.minimapSvg.addEventListener('click', handleMinimapClick);

// ── Debug Mode Toggle ──

function updateDebugUI() {
  if (state.debugMode) {
    els.modeBadge.textContent = 'Debug Mode';
    els.modeBadge.className = 'mode-badge debug';
    els.mainContainer.classList.add('debug-mode');
  } else {
    els.modeBadge.textContent = 'Auto';
    els.modeBadge.className = 'mode-badge auto';
    els.mainContainer.classList.remove('debug-mode');
  }
}

async function toggleDebugMode() {
  if (state.running) {
    showToast("Can't toggle mode while execution is running", 'error');
    return;
  }
  try {
    const resp = await fetch('/api/toggle-debug', { method: 'POST' });
    if (!resp.ok) throw new Error('Request failed');
    const data = await resp.json();
    state.debugMode = data.debugMode;
    updateDebugUI();
    showToast(data.debugMode ? 'Debug Mode ON' : 'Auto Mode', 'info');
  } catch (err) {
    showToast('Failed to toggle debug mode: ' + err.message, 'error');
  }
}

els.modeBadge.style.cursor = 'pointer';
els.modeBadge.title = 'Click to toggle debug mode';
els.modeBadge.addEventListener('click', toggleDebugMode);

// ── Init ──

async function init() {
  try {
    const resp = await fetch('/api/graph');
    const data = await resp.json();
    const graph = data.graph;
    state.debugMode = data.debugMode;
    state.nodes = {};
    graph.nodes.forEach(n => { state.nodes[n.id] = n; });
    state.edges = graph.edges;

    if (graph.metadata?.name) {
      els.graphName.textContent = graph.metadata.name;
    }
    updateDebugUI();

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
