// Floating pixel "agents room" animation.
// No deps. Uses status string from window.MC_STATUS (set by app.js).

(function(){
  const canvas = document.getElementById('agentsRoom');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');

  function resizeCanvas(){
    // Match CSS size (pixel-art look). Keep 1:1 device pixels to avoid huge scaling.
    const cssW = canvas.clientWidth || canvas.width;
    const cssH = canvas.clientHeight || canvas.height;
    const w = Math.max(320, Math.min(1200, Math.floor(cssW)));
    const h = Math.max(60, Math.min(180, Math.floor(cssH)));
    canvas.width = w;
    canvas.height = h;
  }
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); });

  function W(){ return canvas.width; }
  function H(){ return canvas.height; }

  const state = {
    t: 0,
    status: 'Idle',
    mode: 'idle', // idle|chat|loading|saving|error|resize
    lastErr: 0,
  };

  function setStatus(s){
    state.status = String(s||'Idle');
    const low = state.status.toLowerCase();
    if(low.includes('error') || low.includes('fail')) state.mode = 'error';
    else if(low.includes('resizing')) state.mode = 'resize';
    else if(low.includes('post /api/chat')) state.mode = 'chat';
    else if(low.includes('get /api/projects') || low.includes('post /api/projects') || low.includes('reload') || low.includes('loading')) state.mode = 'loading';
    else if(low.includes('save')) state.mode = 'saving';
    else state.mode = 'idle';
    if(state.mode==='error') state.lastErr = state.t;
  }

  // Expose for app.js
  window.MC_AGENTS_ROOM = { setStatus };

  function rnd(n){ return Math.sin(n*999.91)*0.5+0.5; }

  function px(x,y,w,h,c){
    ctx.fillStyle=c; ctx.fillRect(x|0,y|0,w|0,h|0);
  }

  function txt(s,x,y,c='#d7def7',size=12){
    ctx.fillStyle=c;
    ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText(s, x, y);
  }

  function drawRoom(){
    const w = W(), h = H();
    // background
    px(0,0,w,h,'#0a0f1e');
    // floor
    px(0,h-24,w,24,'#0b132b');
    // wall gradient bands
    px(0,0,w,28,'#0b1633');
    px(0,28,w,24,'#0a1230');

    // Scale layout with width
    const sx = w / 220;
    const sy = h / 120;
    const S = (n) => Math.max(1, Math.floor(n * sx));
    const T = (n) => Math.max(1, Math.floor(n * sy));

    // desk
    px(S(18),T(70),S(78),T(10),'#1b2a55');
    px(S(18),T(80),S(78),T(12),'#162247');
    // monitor
    px(S(40),T(52),S(22),T(14),'#0b0f1c');
    px(S(42),T(54),S(18),T(10),'#0d2440');
    // shelf
    px(S(140),T(48),S(64),T(8),'#162247');
    // books
    px(S(146),T(36),S(5),T(12),'#7c5cff');
    px(S(153),T(34),S(5),T(14),'#4ade80');
    px(S(160),T(37),S(5),T(11),'#fb7185');

    // status bar (tiny)
    px(0,0,w,T(8),'rgba(255,255,255,0.04)');
  }

  function drawAgent(x,y,who,mode){
    // Larger sprite size for the strip (~18x24)
    const skin = who==='main' ? '#f4c7a1' : '#c7d2fe';
    const suit = who==='main' ? '#7c5cff' : '#22c55e';
    const dark = '#0b0f1c';

    const bob = (mode==='idle' ? Math.sin(state.t/10) : 0);
    y += bob;

    // legs
    px(x+4,y+16,3,7,dark); px(x+12,y+16,3,7,dark);
    // body
    px(x+4,y+10,11,7,suit);
    // head
    px(x+5,y+2,9,8,skin);
    // eyes
    px(x+7,y+5,1,1,dark); px(x+12,y+5,1,1,dark);

    // activity props
    if(mode==='chat'){
      const blink = (Math.floor(state.t/6)%2===0);
      if(blink) { px(x+17,y+12,3,2,'#9ae6ff'); }
    }
    if(mode==='loading'){
      if(Math.floor(state.t/4)%2===0) px(x-2,y+21,2,2,'#98a4c7');
    }
    if(mode==='error'){
      px(x+10,y-2,2,7,'#fb7185');
      px(x+10,y+5,2,2,'#fb7185');
    }

    // label (smaller)
    txt(who.toUpperCase(), x, y+1, 'rgba(215,222,247,.6)', 8);
  }

  function draw(){
    state.t++;
    // sync from global status if present
    if(window.MC_STATUS && window.MC_STATUS !== state.status){
      setStatus(window.MC_STATUS);
    }

    drawRoom();

    const w = W(), h = H();
    const sx = w / 220;
    const sy = h / 120;
    const S = (n) => Math.floor(n * sx);
    const T = (n) => Math.floor(n * sy);

    // agent positions
    let mainMode = state.mode;
    let coderMode = (state.mode==='chat' ? 'idle' : state.mode);
    if(state.mode==='loading') coderMode = 'idle';

    // Place agents clearly in the strip
    let mx = S(26), my = T(24);
    if(state.mode==='loading') mx = S(170) + Math.sin(state.t/6)*S(6);
    if(state.mode==='resize') mx = S(95) + Math.sin(state.t/5)*S(4);

    drawAgent(mx,my,'main',mainMode);
    drawAgent(S(110),T(24),'coder',coderMode==='saving'?'chat':coderMode);

    // HUD (very small)
    txt(`MODE: ${state.mode.toUpperCase()}`, S(8), T(13), 'rgba(215,222,247,.6)', Math.max(9, Math.floor(9*sx)));
  }

  function loop(){
    try {
      draw();
    } catch (e) {
      // Render an error directly into the canvas so we can debug without DevTools
      ctx.clearRect(0,0,W(),H());
      px(0,0,W(),H(),'#1a0b12');
      txt('agents-room.js ERROR', 10, 20, '#fb7185', 14);
      txt(String(e && (e.message || e)), 10, 40, '#d7def7', 11);
      return; // stop loop
    }
    requestAnimationFrame(loop);
  }

  loop();
})();
