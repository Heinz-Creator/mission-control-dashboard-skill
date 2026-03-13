import * as THREE from 'three';

// Minimal 3D strip: only agents + desk computer + bookshelf.
// Uses window.MC_STATUS set by app.js. Polls /api/active to show only active agents/subagents.

const canvas = document.getElementById('agentsRoom3d');
if (!canvas) {
  console.warn('[agents-room-3d] canvas not found');
} else {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = null; // transparent

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 2.0, 6.2);
  camera.lookAt(0, 1.1, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xfff1d6, 1.15);
  key.position.set(3, 5, 4);
  scene.add(key);

  // Props group
  const props = new THREE.Group();
  scene.add(props);

  // Desk + computer (left)
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.75 });
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.85), deskMat);
  deskTop.position.set(-2.8, 0.92, -1.0);
  props.add(deskTop);

  const legMat = new THREE.MeshStandardMaterial({ color: 0x0b0f1c, roughness: 0.9 });
  for (const lx of [-3.75, -1.85]) {
    for (const lz of [-1.35, -0.65]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 10), legMat);
      leg.position.set(lx, 0.45, lz);
      props.add(leg);
    }
  }

  const mon = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.36, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0b0f1c, roughness: 0.4 })
  );
  mon.position.set(-2.8, 1.25, -1.25);
  props.add(mon);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x0d2440 })
  );
  screen.position.set(-2.8, 1.25, -1.21);
  props.add(screen);

  // Bookshelf (right)
  const shelf = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.8, 0.35),
    new THREE.MeshStandardMaterial({ color: 0x162247, roughness: 0.85 })
  );
  shelf.position.set(2.9, 1.05, -1.2);
  props.add(shelf);

  const bookColors = [0x7c5cff, 0x22c55e, 0xfb7185, 0x60a5fa];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.45 + i * 0.05, 0.22),
      new THREE.MeshStandardMaterial({ color: bookColors[i], roughness: 0.6 })
    );
    b.position.set(2.55 + i * 0.22, 1.55, -1.02);
    props.add(b);
  }

  // Agents (chibi/cute hacker style)
  function makeAgent(color) {
    const group = new THREE.Group();

    // Toon-ish material
    const mat = new THREE.MeshToonMaterial({ color });
    const skinMat = new THREE.MeshToonMaterial({ color: 0xf4c7a1 });
    const darkMat = new THREE.MeshToonMaterial({ color: 0x0b0f1c });

    // Body: short capsule
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.45, 6, 12),
      mat
    );
    body.position.y = 0.62;
    group.add(body);

    // Hoodie collar
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.06, 10, 18),
      mat
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.88;
    group.add(collar);

    // Head: bigger
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      skinMat
    );
    head.position.y = 1.22;
    group.add(head);

    // Glasses
    const glasses = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.02, 8, 24),
      darkMat
    );
    glasses.position.set(0, 1.22, 0.24);
    group.add(glasses);

    // Small headset mic
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 8), darkMat);
    mic.position.set(0.22, 1.12, 0.10);
    mic.rotation.z = Math.PI / 5;
    group.add(mic);

    // Rim light (fake glow): slightly bigger transparent sphere
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x9ae6ff, transparent: true, opacity: 0.10 })
    );
    rim.position.y = 1.22;
    group.add(rim);

    // Emote bubble (simple plane)
    const emote = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x9ae6ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
    );
    emote.position.set(0.0, 1.85, 0.0);
    group.add(emote);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.40, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.20 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    return { group, emoteMat: emote.material };
  }

  const main = makeAgent(0x7c5cff);
  const coder = makeAgent(0x22c55e);
  scene.add(main.group);
  scene.add(coder.group);

  // Subagents drones
  const drones = [];
  const droneMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.3, metalness: 0.2 });
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), droneMat);
    d.visible = false;
    d.position.set(0.2 + i * 0.28, 1.9, -0.8);
    scene.add(d);
    drones.push(d);
  }

  const state = {
    mode: 'idle',
    t: 0,
    active: { main: true, coder: false, subagents: 0 },
    lastActivePoll: 0,
  };

  async function pollActive() {
    try {
      const r = await fetch('/api/active');
      if (!r.ok) return;
      state.active = await r.json();
    } catch {}
  }

  function setModeFromStatus(s) {
    const low = String(s || 'Idle').toLowerCase();
    if (low.includes('error') || low.includes('fail')) return 'error';
    if (low.includes('resizing')) return 'resize';
    if (low.includes('post /api/chat')) return 'chat';
    if (low.includes('get /api/projects') || low.includes('post /api/projects') || low.includes('reload') || low.includes('loading')) return 'loading';
    if (low.includes('save')) return 'saving';
    return 'idle';
  }

  function resize() {
    const w = canvas.clientWidth || 900;
    const h = canvas.clientHeight || 160;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function tick() {
    state.t += 1;

    // poll activity every ~5s
    if (performance.now() - state.lastActivePoll > 5000) {
      state.lastActivePoll = performance.now();
      pollActive();
    }

    state.mode = setModeFromStatus(window.MC_STATUS);

    // visibility
    main.group.visible = true;
    coder.group.visible = !!state.active.coder;

    // drones
    const nD = Math.max(0, Math.min(drones.length, Number(state.active.subagents || 0)));
    for (let i = 0; i < drones.length; i++) {
      drones[i].visible = i < nD;
      if (drones[i].visible) {
        drones[i].position.y = 1.75 + Math.sin(state.t / 18 + i) * 0.08;
        drones[i].position.x = 0.4 + Math.cos(state.t / 30 + i) * 0.5;
      }
    }

    // emotes
    main.emoteMat.opacity = 0.0;
    coder.emoteMat.opacity = 0.0;
    // Different colors for different modes
    main.emoteMat.color.set(0x9ae6ff);
    coder.emoteMat.color.set(0x9ae6ff);

    // movement
    const bob = Math.sin(state.t / 18) * 0.03;
    const wander = Math.sin(state.t / 55) * 0.5;
    const wander2 = Math.cos(state.t / 70) * 0.35;

    // default idle positions
    main.group.position.set(-0.8 + wander, bob, -0.2);
    if (coder.group.visible) coder.group.position.set(0.8 + wander2, -bob, -0.2);

    if (state.mode === 'chat') {
      // main at desk typing
      main.group.position.set(-2.8, bob, -0.6);
      main.emoteMat.color.set(0x9ae6ff);
      main.emoteMat.opacity = (Math.floor(state.t / 10) % 2) ? 0.9 : 0.2;
    } else if (state.mode === 'saving') {
      // coder at desk typing
      if (coder.group.visible) {
        coder.group.position.set(-2.4, -bob, -0.7);
        coder.emoteMat.color.set(0x22c55e);
        coder.emoteMat.opacity = (Math.floor(state.t / 8) % 2) ? 0.9 : 0.2;
      }
    } else if (state.mode === 'loading') {
      // main at bookshelf reading
      main.group.position.set(2.6, bob, -0.7);
      main.emoteMat.color.set(0xfbbf24);
      main.emoteMat.opacity = 0.45;
    } else if (state.mode === 'error') {
      main.emoteMat.color.set(0xfb7185);
      main.emoteMat.opacity = 0.85;
      if (coder.group.visible) {
        coder.emoteMat.color.set(0xfb7185);
        coder.emoteMat.opacity = 0.85;
      }
    }

    // face camera
    main.group.lookAt(camera.position.x, main.group.position.y + 1.0, camera.position.z);
    if (coder.group.visible) coder.group.lookAt(camera.position.x, coder.group.position.y + 1.0, camera.position.z);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
