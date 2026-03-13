const el = (id) => document.getElementById(id);

const state = {
  models: [],
  model: 'openai-codex/gpt-5.2',
  history: [],
  selectedPath: '', // file or dir (relative)
  selectedType: '',
  showFiles: (localStorage.getItem('mc_show_files') === '1'),

  // Sessions
  sessions: [],
  sessionId: '',
};

const SESSIONS_KEY = 'mc_sessions_v1';

function loadSessions(){
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveSessions(){
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions.slice(0, 50))); } catch {}
}

function renderSessionSelect(){
  const sel = el('sessionSelect');
  if(!sel) return;
  sel.innerHTML = '';
  for(const s of state.sessions){
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.title || s.id;
    sel.appendChild(opt);
  }
  sel.value = state.sessionId;
}

function newSession(title=''){
  const id = String(Date.now());
  const t = title || ('Session ' + new Date().toLocaleString());
  const s = { id, title: t, history: [] };
  state.sessions.unshift(s);
  state.sessionId = id;
  state.history = [];
  renderChatFromHistory();
  try { renderSessionSelect(); } catch {}
  saveSessions();
}
function getCurrentSession(){
  return state.sessions.find(s => s.id === state.sessionId) || null;
}
function persistCurrentSession(){
  const s = getCurrentSession();
  if(!s) return;
  s.history = state.history.slice(-200);
  // Auto-title from first user message
  if (s.title && s.title.startsWith('Session ') && state.history.length) {
    const firstUser = state.history.find(m => m.role === 'user');
    if (firstUser && firstUser.content) {
      const t = String(firstUser.content).trim().slice(0, 48);
      if (t) s.title = t;
    }
  }
  saveSessions();
  try { renderSessionSelect(); } catch {}
}

// Connection indicator
function setConn(stateStr){
  const dot = el('connDot');
  if(!dot) return;
  dot.classList.remove('ok','warn','err');
  if(stateStr) dot.classList.add(stateStr);
}

function setBusy(on){
  window.MC_BUSY = !!on;
  const sendBtn = el('sendBtn');
  if(sendBtn){
    sendBtn.textContent = on ? 'Stop' : 'Senden';
    sendBtn.classList.toggle('danger', on);
  }
}

function setStatus(text){
  const s = el('statusText');
  if(s) s.textContent = text;
  // Expose for the floating agents-room animation
  window.MC_STATUS = text;
  if (window.MC_AGENTS_ROOM && typeof window.MC_AGENTS_ROOM.setStatus === 'function') {
    window.MC_AGENTS_ROOM.setStatus(text);
  }
}

function clearChat(){
  const log = el('chatLog');
  if(log) log.innerHTML = '';
}

function addMsg(role, content) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : role === 'assistant' ? 'assistant' : 'meta');
  div.textContent = content;
  el('chatLog').appendChild(div);
  el('chatLog').scrollTop = el('chatLog').scrollHeight;
}

function renderChatFromHistory(){
  clearChat();
  for(const m of (state.history||[])){
    if(m.role === 'user') addMsg('user', m.content);
    else if(m.role === 'assistant') addMsg('assistant', m.content);
  }
  addMsg('meta', 'Bereit.');
}

function deError(e, contextUrl=''){
  const msg = String(e?.message || e || 'Unbekannter Fehler');

  // Browser fetch failures / aborts
  if (msg.toLowerCase().includes('aborted') || msg.toLowerCase().includes('aborterror')) {
    return 'Anfrage abgebrochen (Timeout oder Verbindung unterbrochen). Bitte erneut senden.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('Load failed') || msg.includes('NetworkError')) {
    return 'Laden fehlgeschlagen: Keine Verbindung zu Mission Control. (Server läuft? WLAN/Route ok?)';
  }

  // Rate limit
  if (msg.includes('429') || msg.toLowerCase().includes('too many')) {
    return 'Zu viele Anfragen (Rate-Limit). Bitte 5–10 Sekunden warten und nochmal versuchen.';
  }

  // Gateway errors
  if (msg.includes('Gateway HTTP')) {
    return 'OpenClaw Gateway-Antwortfehler: ' + msg;
  }
  if (msg.toLowerCase().includes('token')) {
    return 'Gateway-Token fehlt/ungültig. (OpenClaw muss lokal laufen, Token muss verfügbar sein.)';
  }

  // Generic HTTP
  if (msg.startsWith('HTTP ')) {
    return 'HTTP-Fehler: ' + msg + (contextUrl ? (' ('+contextUrl+')') : '');
  }

  // Invalid JSON
  if (msg.toLowerCase().includes('invalid json')) {
    return 'Ungültige Anfrage (JSON). Bitte Seite neu laden und erneut versuchen.';
  }

  return msg;
}

async function apiGet(url) {
  setStatus('GET ' + url);
  try{
    const r = await fetch(url);
    const t = await r.text();
    let body;
    try { body = JSON.parse(t); } catch { body = { raw: t }; }
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    setConn('ok');
    return body;
  } catch (e) {
    setConn('err');
    throw e;
  } finally {
    setStatus('Idle');
  }
}

async function apiPost(url, payload, signal) {
  setStatus('POST ' + url);
  try{
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    const t = await r.text();
    let body;
    try { body = JSON.parse(t); } catch { body = { raw: t }; }
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    setConn('ok');
    return body;
  } catch (e) {
    setConn('err');
    throw e;
  } finally {
    setStatus('Idle');
  }
}

function setSelected(node){
  state.selectedPath = node.path;
  state.selectedType = node.type;
  if(node.type==='dir'){
    el('filePath').textContent = `(Ordner) ${node.name}`;
  }
}

function renderTreeNode(node, container, depth = 0) {
  // Hide files by default at higher levels, but show files inside an expanded folder.
  const showFilesHere = state.showFiles || container?.dataset?.showFiles === '1';
  if (node.type === 'file' && !showFilesHere) return;

  const row = document.createElement('div');
  row.className = 'node';

  const icon = document.createElement('span');
  icon.textContent = node.type === 'dir' ? '📁' : '📄';

  const name = document.createElement('span');
  name.textContent = node.name;
  name.className = 'clickable';

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = node.type === 'dir' ? '' : '';

  row.style.paddingLeft = (depth * 12) + 'px';
  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(tag);

  if (node.type === 'file') {
    name.addEventListener('click', async () => {
      setSelected(node);
      try {
        el('filePath').textContent = node.path;
        el('fileContent').value = 'Loading...';
        const data = await apiGet('/api/projects/file?path=' + encodeURIComponent(node.path));
        el('fileContent').value = data.content;
      } catch (e) {
        el('fileContent').value = 'Fehler: ' + deError(e, '/api/projects/file');
      }
    });
  } else {
    name.addEventListener('click', async () => {
      setSelected(node);
      // lazy load deeper on click
      const already = row._expanded;
      row._expanded = !already;
      if (already) {
        if (row._childWrap) row._childWrap.remove();
        row._childWrap = null;
        return;
      }
      const wrap = document.createElement('div');
      wrap.className = 'indent';
      // Inside an expanded folder we always show files
      wrap.dataset.showFiles = '1';
      row._childWrap = wrap;
      // Insert directly under the clicked folder row (Explorer-style)
      container.insertBefore(wrap, row.nextSibling);

      try {
        // Virtual dir children are already in-memory
        if (Array.isArray(node._children)) {
          (node._children || []).forEach(ch => renderTreeNode(ch, wrap, 0));
        } else {
          const data = await apiGet('/api/projects/tree?path=' + encodeURIComponent(node.path) + '&depth=1');
          (data.tree || []).forEach(ch => renderTreeNode(ch, wrap, 0));
        }
      } catch (e) {
        const err = document.createElement('div');
        err.className = 'node';
        err.textContent = 'Error: ' + e.message;
        wrap.appendChild(err);
      }
    });
  }

  container.appendChild(row);
}

async function loadMeta() {
  const meta = await apiGet('/api/meta');
  state.models = meta.models || [];
  const sel = el('modelSelect');
  sel.innerHTML = '';
  for (const m of state.models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label || m.id;
    sel.appendChild(opt);
  }
  sel.value = state.model;
  sel.addEventListener('change', () => {
    state.model = sel.value;
    addMsg('meta', 'Model set to: ' + state.model);
  });
}

function groupRootTree(tree){
  const sysNames = new Set([
    'AGENTS.md','SOUL.md','USER.md','TOOLS.md','MEMORY.md','HEARTBEAT.md','IDENTITY.md'
  ]);

  const systemFiles=[];
  const scripts=[];
  const configs=[];
  const other=[];

  for(const n of (tree||[])){
    if(n.type==='file'){
      const name = n.name || '';
      const lower = name.toLowerCase();
      if(sysNames.has(name)) systemFiles.push(n);
      else if(lower.endsWith('.ps1')||lower.endsWith('.py')||lower.endsWith('.js')||lower.endsWith('.ts')) scripts.push(n);
      else if(lower.endsWith('.json')||lower.endsWith('.yaml')||lower.endsWith('.yml')||lower.endsWith('.toml')) configs.push(n);
      else other.push(n);
    } else {
      other.push(n);
    }
  }

  const out=[];
  // Virtual dirs: keep children in-memory so they can be expanded/collapsed
  const vdir = (key, name, children) => ({ type:'dir', name, path:`__virtual__/${key}`, _children: children });
  if(systemFiles.length) out.push(vdir('system','🧠 _system', systemFiles));
  if(scripts.length) out.push(vdir('scripts','🛠️ _scripts', scripts));
  if(configs.length) out.push(vdir('configs','⚙️ _configs', configs));

  // Remap / hide top-level folders for a cleaner UI
  const remapDirName = (n) => {
    if (n.name === 'memory') return '📝 Notizen';
    if (n.name === 'config') return '⚙️ Konfiguration';
    if (n.name === '.trash') return '🗑️ Papierkorb';
    if (n.name === 'projects') return '📁 Projekte';
    return n.name;
  };

  for (const n of other) {
    if (n.type === 'dir' && (n.name === '.openclaw' || n.name === 'node_modules')) {
      continue; // hide
    }
    if (n.type === 'dir') {
      n.name = remapDirName(n);
    }
    out.push(n);
  }

  return out;
}

async function loadTree() {
  el('tree').innerHTML = 'Loading...';
  try {
    const data = await apiGet('/api/projects/tree?depth=2');
    el('tree').innerHTML = '';
    const grouped = groupRootTree(data.tree || []);
    grouped.forEach(n => renderTreeNode(n, el('tree'), 0));
  } catch (e) {
    el('tree').innerHTML = 'Fehler: ' + deError(e, '/api/projects/tree');
  }
}

function applyMobileView(mode){
  // mode: 'chat' | 'projects' | 'editor'
  document.body.classList.remove('show-projects','show-editor');
  if(mode==='projects') document.body.classList.add('show-projects');
  if(mode==='editor') document.body.classList.add('show-editor');
  localStorage.setItem('mc_mobile_mode', mode);
}

function applyDesktopToggles(){
  const hideProjects = localStorage.getItem('mc_hide_projects')==='1';
  const hideEditor = localStorage.getItem('mc_hide_editor')==='1';
  document.body.classList.toggle('hide-projects', hideProjects);
  document.body.classList.toggle('hide-editor', hideEditor);
}

function setupSplitters(){
  const root = document.documentElement;
  const left = el('splitterLeft');
  const right = el('splitterRight');
  if(!left || !right) return;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  // Restore
  const wP = Number(localStorage.getItem('mc_w_projects') || 320);
  const wE = Number(localStorage.getItem('mc_w_editor') || 520);
  root.style.setProperty('--w-projects', wP + 'px');
  root.style.setProperty('--w-editor', wE + 'px');

  function drag(which, ev){
    ev.preventDefault();
    const startX = ev.clientX;
    const rect = el('layout').getBoundingClientRect();
    const startProjects = parseInt(getComputedStyle(root).getPropertyValue('--w-projects')) || 320;
    const startEditor = parseInt(getComputedStyle(root).getPropertyValue('--w-editor')) || 520;

    function onMove(e){
      const dx = e.clientX - startX;
      if(which==='left'){
        const next = clamp(startProjects + dx, 200, Math.max(200, rect.width - 520));
        root.style.setProperty('--w-projects', next + 'px');
      } else {
        const next = clamp(startEditor - dx, 280, Math.max(280, rect.width - 320));
        root.style.setProperty('--w-editor', next + 'px');
      }
    }
    function onUp(){
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const curP = parseInt(getComputedStyle(root).getPropertyValue('--w-projects')) || 320;
      const curE = parseInt(getComputedStyle(root).getPropertyValue('--w-editor')) || 520;
      localStorage.setItem('mc_w_projects', String(curP));
      localStorage.setItem('mc_w_editor', String(curE));
      setStatus('Idle');
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    setStatus('Resizing panes...');
  }

  left.addEventListener('mousedown', (ev) => drag('left', ev));
  right.addEventListener('mousedown', (ev) => drag('right', ev));
}

async function init() {
  await loadMeta();
  await loadTree();

  setupSplitters();

  // Default: chat-only view on small screens
  const mobileMode = localStorage.getItem('mc_mobile_mode') || 'chat';
  applyMobileView(mobileMode);
  applyDesktopToggles();

  el('refreshTreeBtn').addEventListener('click', loadTree);

  // Sessions UI
  state.sessions = loadSessions();
  if (!state.sessions.length) newSession();
  else {
    state.sessionId = state.sessions[0].id;
    state.history = state.sessions[0].history || [];
    renderChatFromHistory();
  }

  renderSessionSelect();

  const sessionSelect = el('sessionSelect');
  if(sessionSelect){
    sessionSelect.addEventListener('change', () => {
      const id = sessionSelect.value;
      const s = state.sessions.find(x => x.id === id);
      if(!s) return;
      state.sessionId = id;
      state.history = s.history || [];
      renderChatFromHistory();
      persistCurrentSession();
    });
  }

  const newSessionBtn = el('newSessionBtn');
  if(newSessionBtn){
    newSessionBtn.addEventListener('click', () => {
      if(window.MC_BUSY) return alert('Bitte warten bis die aktuelle Antwort fertig ist (oder Stop drücken).');
      newSession();
    });
  }

  const exportSessionBtn = el('exportSessionBtn');
  if(exportSessionBtn){
    exportSessionBtn.addEventListener('click', () => {
      const s = getCurrentSession();
      if(!s) return;
      const payload = { title: s.title, exportedAt: new Date().toISOString(), history: state.history };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mission-control-${(s.title||'session').replace(/[^a-z0-9_-]+/gi,'_').slice(0,40)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  // Skills dropdown
  const skillSel = el('skillSelect');
  if (skillSel) {
    try {
      const data = await apiGet('/api/skills');
      const skills = data.skills || [];
      skillSel.innerHTML = '';
      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = 'Skill auswählen…';
      skillSel.appendChild(opt0);
      for (const s of skills) {
        const opt = document.createElement('option');
        opt.value = s.name;
        const prefix = s.disabled ? '⛔ ' : (s.eligible ? '✅ ' : '⚠️ ');
        const em = s.emoji ? (s.emoji + ' ') : '';
        opt.textContent = prefix + em + s.name;
        skillSel.appendChild(opt);
      }
      skillSel.addEventListener('change', () => {
        const name = skillSel.value;
        if (!name) return;
        const input = el('chatInput');
        if (input) {
          input.value = `/skill ${name}: `;
          input.focus();
        }
        skillSel.value = '';
      });
    } catch {
      // ignore
    }
  }

  // Morning briefing UI removed (was confusing / not reliably configured)

  // OpenClaw version/update HUD
  const sysInfo = el('sysInfo');
  async function refreshSysInfo() {
    if (!sysInfo) return;
    try {
      const d = await apiGet('/api/openclaw');
      if (!d || !d.ok) {
        sysInfo.textContent = 'OpenClaw: Status unbekannt';
        return;
      }
      const v = d.version || 'unknown';
      const latest = d.update?.latestVersion || '';
      const upd = d.update?.available ? (latest ? ` · Update: ${latest}` : ' · Update verfügbar') : '';
      sysInfo.textContent = `OpenClaw ${v}${upd}`;
    } catch {
      sysInfo.textContent = 'OpenClaw: Status nicht verfügbar';
    }
  }
  await refreshSysInfo();
  setInterval(refreshSysInfo, 15000);

  // Emergency button: restart gateway service
  const gwRestartBtn = el('gwRestartBtn');
  if (gwRestartBtn) {
    gwRestartBtn.addEventListener('click', async () => {
      try {
        gwRestartBtn.disabled = true;
        setStatus('Restarting gateway...');
        const r = await fetch('/api/gateway/restart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const t = await r.text();
        let body; try { body = JSON.parse(t); } catch { body = { raw: t }; }
        if (!r.ok) throw new Error(body.error || ('HTTP ' + r.status));
        addMsg('meta', 'Gateway restart: OK');
      } catch (e) {
        alert('Gateway restart fehlgeschlagen: ' + deError(e));
      } finally {
        gwRestartBtn.disabled = false;
        setStatus('Idle');
        setTimeout(refreshSysInfo, 1500);
      }
    });
  }

  // Update + Restart button
  const ocUpdateBtn = el('ocUpdateBtn');
  if (ocUpdateBtn) {
    ocUpdateBtn.addEventListener('click', async () => {
      const ok = confirm('OpenClaw Update starten und Gateway neu starten? (Kann kurz offline sein)');
      if (!ok) return;
      try {
        ocUpdateBtn.disabled = true;
        setStatus('Updating OpenClaw...');
        const r = await fetch('/api/openclaw/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const t = await r.text();
        let body; try { body = JSON.parse(t); } catch { body = { raw: t }; }
        if (!r.ok) throw new Error(body.error || ('HTTP ' + r.status));
        addMsg('meta', 'Update: ' + (body.ok ? 'OK' : 'ERROR') + (body.note ? (' ('+body.note+')') : ''));
      } catch (e) {
        alert('Update fehlgeschlagen: ' + deError(e));
      } finally {
        ocUpdateBtn.disabled = false;
        setStatus('Idle');
        setTimeout(refreshSysInfo, 2000);
      }
    });
  }

  el('toggleProjectsBtn').addEventListener('click', () => {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if(isMobile){
      const cur = localStorage.getItem('mc_mobile_mode') || 'chat';
      applyMobileView(cur==='projects' ? 'chat' : 'projects');
      return;
    }
    const next = document.body.classList.contains('hide-projects') ? '0' : '1';
    localStorage.setItem('mc_hide_projects', next);
    applyDesktopToggles();
  });

  el('toggleEditorBtn').addEventListener('click', () => {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if(isMobile){
      const cur = localStorage.getItem('mc_mobile_mode') || 'chat';
      applyMobileView(cur==='editor' ? 'chat' : 'editor');
      return;
    }
    const next = document.body.classList.contains('hide-editor') ? '0' : '1';
    localStorage.setItem('mc_hide_editor', next);
    applyDesktopToggles();
  });

  // Cover upload
  const up = el('coverUpload');
  if(up){
    up.addEventListener('change', async () => {
      const file = up.files && up.files[0];
      if(!file) return;
      try{
        setStatus('Uploading cover...');
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/api/projects/upload', { method:'POST', body: fd });
        const t = await r.text();
        let body; try{ body = JSON.parse(t); } catch { body = { raw: t }; }
        if(!r.ok) throw new Error(body.error || ('HTTP '+r.status));
        addMsg('meta', 'Upload OK: ' + (body.path || '')); 
      } catch(e){
        alert('Fehler: ' + deError(e));
      } finally {
        setStatus('Idle');
        up.value = '';
      }
    });
  }

  el('newFolderBtn').addEventListener('click', async () => {
    const parent = (state.selectedType === 'dir' && state.selectedPath) ? state.selectedPath : '';
    const name = prompt('Folder name?');
    if (!name) return;
    try {
      await apiPost('/api/projects/mkdir', { parentPath: parent, name });
      await loadTree();
    } catch (e) {
      alert('Fehler: ' + deError(e));
    }
  });

  el('newFileBtn').addEventListener('click', async () => {
    const parent = (state.selectedType === 'dir' && state.selectedPath) ? state.selectedPath : '';
    const name = prompt('File name?');
    if (!name) return;
    try {
      const out = await apiPost('/api/projects/touch', { parentPath: parent, name });
      await loadTree();
      // auto-open
      if (out && out.path) {
        const data = await apiGet('/api/projects/file?path=' + encodeURIComponent(out.path));
        state.selectedPath = out.path;
        state.selectedType = 'file';
        el('filePath').textContent = out.path;
        el('fileContent').value = data.content;
      }
    } catch (e) {
      alert('Fehler: ' + deError(e));
    }
  });

  el('deleteBtn').addEventListener('click', async () => {
    if (!state.selectedPath) return alert('Select a file or folder first.');
    const ok = confirm(`Delete (move to .trash): ${state.selectedPath} ?`);
    if (!ok) return;
    try {
      await apiPost('/api/projects/delete', { path: state.selectedPath });
      state.selectedPath = '';
      state.selectedType = '';
      el('filePath').textContent = '(no file selected)';
      el('fileContent').value = '';
      await loadTree();
    } catch (e) {
      alert('Fehler: ' + deError(e));
    }
  });

  el('saveBtn').addEventListener('click', async () => {
    if (state.selectedType !== 'file' || !state.selectedPath) return alert('Select a file first.');
    try {
      const r = await fetch('/api/projects/file', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ path: state.selectedPath, content: el('fileContent').value })
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t);
      }
      addMsg('meta', 'Saved: ' + state.selectedPath);
    } catch (e) {
      alert('Fehler beim Speichern: ' + deError(e));
      return;
    }
  });

  // Speech-to-text (Server STT, works on iPhone Safari)
  const micBtn = el('micBtn');
  let mediaRecorder = null;
  let chunks = [];

  async function startRec(){
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      try{
        setStatus('🎙️ Transkribiere...');
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        const fd = new FormData();
        fd.append('file', blob, 'speech.webm');
        const r = await fetch('/api/stt', { method: 'POST', body: fd });
        const t = await r.text();
        let body; try{ body = JSON.parse(t); } catch { body = { raw: t }; }
        if(!r.ok) throw new Error(body.error || ('HTTP '+r.status));
        const input = el('chatInput');
        if(input) input.value = (body.text || '').trim();
      } catch(e){
        alert('Fehler: ' + deError(e, '/api/stt'));
      } finally {
        setStatus('Idle');
        try { mediaRecorder.stream.getTracks().forEach(tr => tr.stop()); } catch {}
      }
    };
    mediaRecorder.start();
    micBtn.classList.add('listening');
    setStatus('🎙️ Aufnahme läuft...');
  }

  function stopRec(){
    try { mediaRecorder.stop(); } catch {}
    micBtn.classList.remove('listening');
  }

  if (micBtn) {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      micBtn.disabled = true;
      micBtn.title = 'Audioaufnahme wird von diesem Browser nicht unterstützt.';
    } else {
      micBtn.addEventListener('click', async () => {
        try{
          if (micBtn.classList.contains('listening')) stopRec();
          else await startRec();
        } catch(e){
          alert('Mikrofon/Recorder Fehler: ' + (e?.message || e));
        }
      });
    }
  }

  el('chatForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = el('chatInput');
    const q = (input.value || '').trim();
    if (!q) return;

    input.value = '';
    addMsg('user', q);

    state.history.push({ role: 'user', content: q });
    persistCurrentSession();
    const history = state.history.slice(-10);

    // If already busy: treat submit as STOP
    if (window.MC_BUSY && window.MC_CHAT_AC) {
      try { window.MC_CHAT_AC.abort('user'); } catch {}
      addMsg('meta', 'Abgebrochen.');
      setBusy(false);
      return;
    }

    try {
      addMsg('meta', 'Denke nach...');
      setBusy(true);
      // Keep status in a "working" state for the Agents overlay while waiting for the response
      setStatus('Thinking...');
      const ac = new AbortController();
      window.MC_CHAT_AC = ac;
      const to = setTimeout(() => ac.abort('timeout'), 60000);
      const resp = await apiPost('/api/chat', { model: state.model, question: q, history }, ac.signal);
      clearTimeout(to);
      const a = resp.answer || '(leer)';
      addMsg('assistant', a);
      state.history.push({ role: 'assistant', content: a });
      persistCurrentSession();
    } catch (e) {
      addMsg('assistant', 'Fehler: ' + deError(e, '/api/chat'));
    } finally {
      window.MC_CHAT_AC = null;
      setBusy(false);
      setStatus('Idle');
    }
  });

  addMsg('meta', 'Bereit.');
}

init();
