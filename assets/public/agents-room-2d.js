// 2D pixel hacker scene for the Agents panel.
// Reads window.MC_STATUS (set by app.js) and polls /api/active for subagents.

(() => {
  const canvas = document.getElementById('agentsRoom2d');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Background reference image (user uploaded)
  const bg = new Image();
  bg.src = '/api/projects/raw?path=' + encodeURIComponent('projects/_assets/1773360319040__IMG_5452.webp') + '&_=' + Date.now();
  let bgReady = false;
  bg.onload = () => { bgReady = true; };

  const state = {
    t: 0,
    mode: 'idle',
    active: { main: true, coder: false, subagents: 0 },
    lastPoll: 0,
    calibrating: false,
    drag: null,
    activePoly: 0,
    zoom2x: false,
  };

  // Screen polygons (normalized [0..1] coordinates)
  const LS_KEY = 'mc_screen_polys_v3';
  const defaultPolysN = [
    // 7 screens as 4-point quads (free-form).
    [ [0.46,0.52],[0.56,0.52],[0.56,0.66],[0.46,0.66] ],
    [ [0.58,0.50],[0.70,0.50],[0.70,0.66],[0.58,0.66] ],
    [ [0.72,0.48],[0.84,0.48],[0.84,0.64],[0.72,0.64] ],
    [ [0.10,0.55],[0.18,0.55],[0.18,0.67],[0.10,0.67] ],
    [ [0.20,0.55],[0.28,0.55],[0.28,0.67],[0.20,0.67] ],
    [ [0.30,0.55],[0.38,0.55],[0.38,0.67],[0.30,0.67] ],
    [ [0.40,0.55],[0.48,0.55],[0.48,0.67],[0.40,0.67] ]
  ];

  function loadPolys(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return structuredClone(defaultPolysN);
      const obj = JSON.parse(raw);
      if(!Array.isArray(obj) || obj.length<1) return structuredClone(defaultPolysN);
      return obj;
    } catch { return structuredClone(defaultPolysN); }
  }

  function savePolys(polysN){
    localStorage.setItem(LS_KEY, JSON.stringify(polysN));
  }

  let polysN = loadPolys();

  function resize() {
    const w = Math.max(320, canvas.clientWidth || 900);
    const h = Math.max(90, canvas.clientHeight || 160);
    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);
    ctx.imageSmoothingEnabled = false;
  }
  resize();
  window.addEventListener('resize', resize);

  function modeFromStatus(s) {
    // MC_BUSY is set by app.js for long-running operations (e.g., waiting for /api/chat)
    if (window.MC_BUSY) return 'typing';

    const low = String(s || 'Idle').toLowerCase();
    if (low.includes('error') || low.includes('fail')) return 'error';
    if (low.includes('thinking') || low.includes('post /api/chat')) return 'typing';
    if (low.includes('save')) return 'typing';
    if (low.includes('get /api/projects') || low.includes('loading') || low.includes('reload')) return 'research';
    return 'idle';
  }

  async function pollActive() {
    try {
      const r = await fetch('/api/active');
      if (!r.ok) return;
      state.active = await r.json();
    } catch {}
  }

  function px(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  function toAbs(polyN, W, H){
    return polyN.map(p => ({ x: p[0]*W, y: p[1]*H }));
  }

  function toNormPoint(x,y,W,H){
    return [Math.min(1, Math.max(0, x/W)), Math.min(1, Math.max(0, y/H))];
  }

  function drawHandles(polyAbs, sizePx=18){
    const s = sizePx;
    for(const p of polyAbs){
      ctx.globalAlpha = 0.9;
      // outer
      px(p.x-(s/2), p.y-(s/2), s, s, '#000');
      // inner
      px(p.x-(s/2-4), p.y-(s/2-4), s-8, s-8, '#9ae6ff');
      ctx.globalAlpha = 1;
    }
  }

  function glowRect(x, y, w, h, c) {
    // cheap glow: draw larger transparent rects
    for (let i = 6; i >= 1; i--) {
      ctx.globalAlpha = 0.08;
      px(x - i, y - i, w + i * 2, h + i * 2, c);
    }
    ctx.globalAlpha = 1;
    px(x, y, w, h, c);
  }

  function drawHacker(x, y, scale, mode) {
    // simple pixel hoodie figure
    const s = scale;
    const skin = '#f4c7a1';
    const hood = '#7c5cff';
    const dark = '#0b0f1c';

    const bob = mode === 'idle' ? Math.sin(state.t / 14) * s : 0;
    y += bob;

    // head
    px(x + 4*s, y + 1*s, 6*s, 6*s, skin);
    // hood
    px(x + 3*s, y + 0*s, 8*s, 8*s, hood);
    px(x + 4*s, y + 1*s, 6*s, 6*s, skin);
    // glasses
    px(x + 5*s, y + 3*s, 1*s, 1*s, dark);
    px(x + 8*s, y + 3*s, 1*s, 1*s, dark);

    // body
    px(x + 3*s, y + 7*s, 8*s, 8*s, hood);
    // arms
    if (mode === 'typing') {
      // arms forward
      px(x + 2*s, y + 9*s, 3*s, 2*s, hood);
      px(x + 9*s, y + 9*s, 3*s, 2*s, hood);
    } else {
      px(x + 2*s, y + 9*s, 2*s, 4*s, hood);
      px(x + 10*s, y + 9*s, 2*s, 4*s, hood);
    }

    // legs
    px(x + 4*s, y + 15*s, 2*s, 4*s, dark);
    px(x + 8*s, y + 15*s, 2*s, 4*s, dark);

    // book in research
    if (mode === 'research') {
      px(x + 10*s, y + 11*s, 3*s, 3*s, '#fbbf24');
      px(x + 10*s, y + 12*s, 3*s, 1*s, '#0b0f1c');
    }

    // warning icon
    if (mode === 'error') {
      px(x + 6*s, y - 3*s, 2*s, 2*s, '#fb7185');
      px(x + 6*s, y - 6*s, 2*s, 2*s, '#fb7185');
    }
  }

  function draw() {
    state.t++;
    state.mode = modeFromStatus(window.MC_STATUS);

    const W = canvas.width;
    const H = canvas.height;

    ctx.save();
    applyZoomTransform(W,H);

    // background: show the reference image as-is (fit cover)
    if (bgReady) {
      const iw = bg.naturalWidth || 1;
      const ih = bg.naturalHeight || 1;
      const s = Math.max(W / iw, H / ih);
      const dw = iw * s;
      const dh = ih * s;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.globalAlpha = 1;
      ctx.drawImage(bg, dx, dy, dw, dh);
      // slight dim for readability
      ctx.globalAlpha = 0.18;
      px(0, 0, W, H, '#000');
      ctx.globalAlpha = 1;
    } else {
      px(0, 0, W, H, 'rgba(10,15,30,0.55)');
    }

    // We no longer draw fake desk/monitor shapes.
    // Instead, we animate a few "screen" overlay regions on top of the reference image.

    // Screen polygons (absolute)
    const polys = polysN.map(pn => toAbs(pn, W, H));
    // In calibrate mode, only show active poly to avoid clutter
    const polysToDraw = state.calibrating ? [polys[state.activePoly] || polys[0]] : polys;
    const isTyping = state.mode === 'typing';
    const isResearch = state.mode === 'research';
    const isError = state.mode === 'error';

    let screenColor = '#0d2440';
    if (isTyping) screenColor = '#22c55e';
    if (isResearch) screenColor = '#9ae6ff';
    if (isError) screenColor = '#fb7185';

    // Animate screens with soft polygon masks (no visible rectangles)
    function drawSoftGlowPoly(poly, color){
      // feather by drawing several expanded strokes
      for(let k=10;k>=1;k--){
        ctx.globalAlpha = 0.03;
        ctx.beginPath();
        ctx.moveTo(poly[0].x-k, poly[0].y-k);
        ctx.lineTo(poly[1].x+k, poly[1].y-k);
        ctx.lineTo(poly[2].x+k, poly[2].y+k);
        ctx.lineTo(poly[3].x-k, poly[3].y+k);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      ctx.lineTo(poly[1].x, poly[1].y);
      ctx.lineTo(poly[2].x, poly[2].y);
      ctx.lineTo(poly[3].x, poly[3].y);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function clipPoly(poly){
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      ctx.lineTo(poly[1].x, poly[1].y);
      ctx.lineTo(poly[2].x, poly[2].y);
      ctx.lineTo(poly[3].x, poly[3].y);
      ctx.closePath();
      ctx.clip();
    }

    polysToDraw.forEach((poly, idx) => {
      // In calibrate mode: show outlines/handles, no effects.
      if (state.calibrating) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#9ae6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i=1;i<poly.length;i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        drawHandles(poly, 18);
        return;
      }

      // glow
      drawSoftGlowPoly(poly, screenColor);

      // inside effects
      clipPoly(poly);
      // blend-like lightening
      ctx.globalAlpha = 0.10;
      px(0, 0, W, H, screenColor);
      ctx.globalAlpha = 1;

      if (isTyping || isResearch) {
        // scanlines
        ctx.globalAlpha = 0.08;
        for (let y = 0; y < H; y += 3) px(0, y, W, 1, '#000');
        ctx.globalAlpha = 1;

        // terminal rows
        const lines = 7;
        const bb = { x: poly[0].x, y: poly[0].y, w: (poly[1].x-poly[0].x), h: (poly[2].y-poly[1].y) };
        for (let i = 0; i < lines; i++) {
          const wob = isResearch ? ((state.t + i * 9 + idx*13) % 28) : ((state.t + i + idx*7) % 18);
          ctx.globalAlpha = 0.22;
          px(bb.x + 6, bb.y + 6 + i * Math.floor(bb.h / lines), Math.max(10, Math.min(bb.w - 12, 20 + wob)), 2, 'rgba(0,0,0,0.70)');
        }
        ctx.globalAlpha = 1;
      }

      if (isError && (Math.floor(state.t/6) % 2 === 0)) {
        ctx.globalAlpha = 0.25;
        px(0, 0, W, H, '#000');
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    });

    ctx.restore();

    // Poll active periodically
    if (performance.now() - state.lastPoll > 5000) {
      state.lastPoll = performance.now();
      pollActive();
    }
  }

  function hitTestHandles(mx,my,W,H){
    // returns {polyIndex, pointIndex} or null
    const radius = 14;
    const start = state.calibrating ? state.activePoly : 0;
    const end = state.calibrating ? (state.activePoly+1) : polysN.length;

    for(let pi=start; pi<end; pi++){
      const polyAbs = toAbs(polysN[pi], W, H);
      for(let i=0;i<polyAbs.length;i++){
        const p = polyAbs[i];
        const dx = mx - p.x;
        const dy = my - p.y;
        if(dx*dx + dy*dy <= radius*radius) return { pi, i };
      }
    }
    return null;
  }

  function canvasPos(ev){
    const r = canvas.getBoundingClientRect();
    let x = (ev.clientX - r.left) * (canvas.width / r.width);
    let y = (ev.clientY - r.top) * (canvas.height / r.height);

    // Undo zoom transform so dragging matches what you see
    x = (x - view.tx) / view.scale;
    y = (y - view.ty) / view.scale;

    return {x,y};
  }

  // Current view transform (for zoom calibration)
  const view = { scale: 1, tx: 0, ty: 0 };

  function applyZoomTransform(W,H){
    // Reset transform each frame
    view.scale = 1; view.tx = 0; view.ty = 0;

    if(!state.calibrating || !state.zoom2x) {
      ctx.setTransform(1,0,0,1,0,0);
      return;
    }

    // Zoom around current active poly center
    const polyAbs = toAbs(polysN[state.activePoly] || polysN[0], W, H);
    const cx = polyAbs.reduce((a,p)=>a+p.x,0)/polyAbs.length;
    const cy = polyAbs.reduce((a,p)=>a+p.y,0)/polyAbs.length;

    view.scale = 2;
    view.tx = (W/2) - cx * view.scale;
    view.ty = (H/2) - cy * view.scale;

    ctx.setTransform(view.scale, 0, 0, view.scale, view.tx, view.ty);
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if(!state.calibrating) return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    const {x,y} = canvasPos(ev);
    const hit = hitTestHandles(x,y,canvas.width,canvas.height);
    if(hit){
      state.drag = { pointerId: ev.pointerId, ...hit };
    }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if(!state.calibrating || !state.drag) return;
    ev.preventDefault();
    if(ev.pointerId !== state.drag.pointerId) return;
    const {x,y} = canvasPos(ev);
    polysN[state.drag.pi][state.drag.i] = toNormPoint(x,y,canvas.width,canvas.height);
  });

  canvas.addEventListener('pointerup', (ev) => {
    if(state.drag && ev.pointerId === state.drag.pointerId){
      state.drag = null;
    }
  });

  // UI buttons
  const bar = document.getElementById('agentsRoomBar');
  const controlsWrap = document.getElementById('agentsRoomControls');
  const btn = document.getElementById('calibrateBtn');
  const btnPrev = document.getElementById('calibratePrevBtn');
  const btnNext = document.getElementById('calibrateNextBtn');
  const btnZoom = document.getElementById('calibrateZoomBtn');
  const btnSave = document.getElementById('calibrateSaveBtn');

  // Long-press on the bar toggles controls visibility
  if (bar && controlsWrap) {
    let lpTimer = null;
    const show = () => { controlsWrap.style.display = ''; };
    const hide = () => { controlsWrap.style.display = 'none'; };
    const toggle = () => {
      controlsWrap.style.display = (controlsWrap.style.display === 'none') ? '' : 'none';
    };

    const start = (ev) => {
      // Don't trigger when pressing a button itself
      if (ev.target && ev.target.tagName === 'BUTTON') return;
      lpTimer = setTimeout(() => {
        toggle();
      }, 600);
    };
    const cancel = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };

    bar.addEventListener('pointerdown', start);
    bar.addEventListener('pointerup', cancel);
    bar.addEventListener('pointercancel', cancel);
    bar.addEventListener('pointermove', cancel);
  }

  function setCalUi(on){
    if(!btn || !btnSave || !btnPrev || !btnNext || !btnZoom) return;
    btnSave.style.display = on ? '' : 'none';
    btnPrev.style.display = on ? '' : 'none';
    btnNext.style.display = on ? '' : 'none';
    btnZoom.style.display = on ? '' : 'none';
    btn.textContent = on ? `Kalibrieren: ${state.activePoly+1}/${polysN.length}` : 'Overlay einstellen';
    btnZoom.textContent = state.zoom2x ? 'Zoom 1×' : 'Zoom 2×';
  }

  if(btn && btnSave && btnPrev && btnNext && btnZoom){
    btn.addEventListener('click', () => {
      state.calibrating = !state.calibrating;
      state.zoom2x = false;
      setCalUi(state.calibrating);
    });

    btnPrev.addEventListener('click', () => {
      state.activePoly = (state.activePoly - 1 + polysN.length) % polysN.length;
      setCalUi(true);
    });

    btnNext.addEventListener('click', () => {
      state.activePoly = (state.activePoly + 1) % polysN.length;
      setCalUi(true);
    });

    btnZoom.addEventListener('click', () => {
      state.zoom2x = !state.zoom2x;
      setCalUi(true);
    });

    btnSave.addEventListener('click', () => {
      savePolys(polysN);
      state.calibrating = false;
      state.zoom2x = false;
      setCalUi(false);
    });
  }

  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  loop();
})();
