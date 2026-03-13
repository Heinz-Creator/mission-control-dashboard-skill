// Mission Control server template (safe defaults)
// - Default bind: 127.0.0.1 (localhost only)
// - No hardcoded tokens
// - "Dangerous" actions (gateway restart/update) disabled unless DANGEROUS_BUTTONS=1

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const dotenv = require('dotenv');
const { spawn } = require('child_process');

const OPENCLAW_ENV_PATH = process.env.OPENCLAW_ENV_PATH || path.join(process.env.USERPROFILE || 'C:/Users/Assis', '.openclaw', '.env');
const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH || path.join(process.env.USERPROFILE || 'C:/Users/Assis', '.openclaw', 'openclaw.json');

dotenv.config({ path: OPENCLAW_ENV_PATH });

function readGatewayTokenFromConfig() {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return '';
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8');
    try {
      const obj = JSON.parse(raw);
      return obj?.gateway?.auth?.token || '';
    } catch {
      const m = raw.match(/token:\s*'([^']+)'/);
      return m ? m[1] : '';
    }
  } catch {
    return '';
  }
}

function getGatewayToken() {
  return process.env.OPENCLAW_GATEWAY_TOKEN || readGatewayTokenFromConfig();
}

const app = express();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const BIND = process.env.BIND || '127.0.0.1';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.join(process.env.USERPROFILE || 'C:/Users/Assis', '.openclaw', 'workspace');

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  return next(err);
});

const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

app.use('/', express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));

// --- helpers ---
function isSubpath(root, target) {
  const r = path.resolve(root) + path.sep;
  const t = path.resolve(target);
  return t.startsWith(r);
}

function ocSpawn(args) {
  return new Promise((resolve) => {
    const p = spawn('openclaw', args, { shell: true });
    let out = '';
    let err = '';
    p.stdout.on('data', d => out += d.toString('utf8'));
    p.stderr.on('data', d => err += d.toString('utf8'));
    p.on('close', code => resolve({ code, out, err }));
  });
}

// --- API: skills ---
let _skillsCache = { ts: 0, data: { ok: true, skills: [] } };
app.get('/api/skills', async (req, res) => {
  try {
    const now = Date.now();
    if (now - _skillsCache.ts < 30_000) return res.json(_skillsCache.data);
    const r = await ocSpawn(['skills', 'list', '--json']);
    if (r.code !== 0) return res.status(500).json({ ok: false, error: (r.err || r.out || 'openclaw skills list failed').slice(0, 300), skills: [] });
    const obj = JSON.parse(r.out);
    const skills = Array.isArray(obj?.skills) ? obj.skills : [];
    const list = skills.map(s => ({
      name: String(s.name || ''),
      emoji: s.emoji || '',
      eligible: !!s.eligible,
      disabled: !!s.disabled,
      source: s.source || '',
    })).filter(s => s.name)
      .sort((a,b) => {
        const rank = (s) => (s.eligible && !s.disabled) ? 0 : (s.eligible ? 1 : 2);
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });

    _skillsCache = { ts: Date.now(), data: { ok: true, skills: list } };
    res.json(_skillsCache.data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'skills failed', skills: [] });
  }
});

// --- API: projects tree + file ---
app.get('/api/projects/tree', async (req, res) => {
  try {
    async function walk(dir) {
      const ents = await fsp.readdir(dir, { withFileTypes: true });
      const nodes = [];
      for (const e of ents) {
        if (e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) nodes.push({ name: e.name, type: 'dir', children: await walk(p), path: path.relative(WORKSPACE_ROOT, p) });
        else nodes.push({ name: e.name, type: 'file', path: path.relative(WORKSPACE_ROOT, p) });
      }
      return nodes.sort((a,b)=>a.name.localeCompare(b.name));
    }
    const tree = await walk(WORKSPACE_ROOT);
    res.json({ ok: true, root: WORKSPACE_ROOT, tree });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'tree failed' });
  }
});

app.get('/api/projects/file', async (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const full = path.join(WORKSPACE_ROOT, rel);
    if (!isSubpath(WORKSPACE_ROOT, full)) return res.status(400).json({ error: 'invalid path' });
    const content = await fsp.readFile(full, 'utf8');
    res.json({ ok: true, path: rel, content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'file failed' });
  }
});

app.post('/api/projects/save', writeLimiter, async (req, res) => {
  try {
    const rel = String(req.body.path || '');
    const content = String(req.body.content ?? '');
    const full = path.join(WORKSPACE_ROOT, rel);
    if (!isSubpath(WORKSPACE_ROOT, full)) return res.status(400).json({ error: 'invalid path' });
    await fsp.writeFile(full, content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'save failed' });
  }
});

// --- API: chat (proxy to local gateway) ---
app.post('/api/chat', chatLimiter, async (req, res) => {
  try {
    const token = getGatewayToken();
    if (!token) return res.status(401).json({ error: 'gateway token missing' });

    // NOTE: implement gateway call as needed for your OpenClaw deployment.
    // This template intentionally omits gateway HTTP details to avoid accidental exposure.
    return res.status(501).json({ error: 'Chat proxy not configured in template. Wire this to your gateway if you want it.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'chat failed' });
  }
});

// --- Dangerous buttons (OFF by default) ---
const DANGEROUS = process.env.DANGEROUS_BUTTONS === '1';
if (DANGEROUS) {
  app.post('/api/gateway/restart', writeLimiter, async (req, res) => {
    const r = await ocSpawn(['gateway', 'restart']);
    if (r.code === 0) return res.json({ ok: true, out: r.out.trim().slice(0, 800) });
    return res.status(500).json({ ok: false, error: (r.err || r.out || 'restart failed').trim().slice(0, 800) });
  });
}

app.listen(PORT, BIND, () => {
  console.log(`[mission-control] listening on http://${BIND}:${PORT}`);
  console.log(`[mission-control] workspace: ${WORKSPACE_ROOT}`);
  console.log(`[mission-control] dangerous buttons: ${DANGEROUS ? 'ON' : 'OFF'}`);
});
