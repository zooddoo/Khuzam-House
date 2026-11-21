/**
 * A small stand-in for the parts of Supabase the studio uses (Auth, the
 * studio's RPC functions and Storage), for end-to-end tests that must not
 * touch the real project. It mirrors the SQL in supabase/migrations:
 * single owner claimed on first request, owner-only access, tombstones and
 * history, (updated_at, tbl, id) cursors.
 *
 *   node e2e/fake-supabase.mjs [port]
 *
 * Test hooks: GET /__test/state, POST /__test/reset, POST /__test/fail
 * {"push": true | false, "storage": true | false, "maxBytes": n}.
 */
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';

const PORT = Number(process.argv[2] || process.env.FAKE_SUPABASE_PORT || 54321);
const TABLES = [
  'project',
  'floors',
  'rooms',
  'requirements',
  'reference_items',
  'files',
  'design_versions',
  'library_items',
  'direction_presets',
  'comparisons',
  'tasks',
  'app_settings',
  'translations',
  'recently_deleted',
];

let state;
function reset() {
  state = {
    users: new Map(), // email -> {id, email, password}
    tokens: new Map(), // access token -> user id
    refresh: new Map(), // refresh token -> user id
    owner: null,
    rows: new Map(), // `${tbl}|${id}` -> {tbl, id, data, deleted, client_id, updated_at}
    history: [],
    objects: new Map(), // path -> {bytes, type}
    fail: { push: false, storage: false, maxBytes: 50 * 1024 * 1024 },
    calls: { push: 0, pull: 0, upload: 0 },
  };
}
reset();

let tick = 0;
function nowTs() {
  // Microsecond timestamps like Postgres, strictly increasing.
  const ms = Date.now();
  tick = (tick + 1) % 1000;
  const iso = new Date(ms).toISOString().replace('Z', '');
  return `${iso}${String(tick).padStart(3, '0')}+00:00`;
}

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.${randomUUID().replace(/-/g, '')}`;
  const refresh = randomUUID();
  state.tokens.set(access, user.id);
  state.refresh.set(refresh, user.id);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(user) };
}

function publicUser(u) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email, sub: u.id } }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Content-Type');
}

function send(res, status, body, type = 'application/json') {
  cors(res);
  if (body === undefined || body === null) {
    res.writeHead(status);
    return res.end();
  }
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length });
  res.end(buf);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(buf) {
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return {};
  }
}

function userFrom(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const id = state.tokens.get(token);
  return id ? [...state.users.values()].find((u) => u.id === id) : null;
}

const isOwner = (u) => !!u && state.owner === u.id;

function pgError(res, status, code, message) {
  send(res, status, { code, message, details: null, hint: null });
}

function archive(old, reason) {
  if (!old || old.data === null) return;
  state.history.push({ id: state.history.length + 1, table_name: old.tbl, record_id: old.id, data: old.data, client_id: old.client_id, valid_from: old.updated_at, archived_at: nowTs(), reason });
}

const rpc = {
  app_status(u) {
    return { claimed: !!state.owner, is_owner: isOwner(u), signed_in: !!u, schema_version: 1 };
  },
  claim_app_owner(u) {
    if (!u) throw [401, '42501', 'Sign in first'];
    if (!state.owner) state.owner = u.id;
    return rpc.app_status(u);
  },
  sync_pull(u, args) {
    if (!isOwner(u)) throw [403, '42501', 'Only the studio owner can read the studio data'];
    state.calls.pull++;
    const since = args.p_since && args.p_since !== '-infinity' ? args.p_since : '';
    const key = [since, args.p_tbl || '', args.p_id || ''];
    const limit = Math.min(Math.max(Number(args.p_limit) || 500, 1), 1000);
    const cmp = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
    const rows = [...state.rows.values()]
      .map((r) => ({ ...r, k: [r.updated_at, r.tbl, r.id] }))
      .filter((r) => cmp(r.k, key) > 0)
      .sort((a, b) => cmp(a.k, b.k))
      .slice(0, limit)
      .map(({ k: _k, ...r }) => r);
    const safe = new Date(Date.now() - 60_000).toISOString().replace('Z', '000+00:00');
    return { rows, server_time: nowTs(), safe_until: safe };
  },
  sync_push(u, args) {
    if (!isOwner(u)) throw [403, '42501', 'Only the studio owner can change the studio data'];
    if (state.fail.push) throw [503, 'XX000', 'Simulated server failure'];
    state.calls.push++;
    const out = [];
    for (const c of args.p_changes || []) {
      if (!TABLES.includes(c.tbl)) throw [400, '22023', `Unknown table: ${c.tbl}`];
      if (!c.deleted && (typeof c.data !== 'object' || !c.data)) throw [400, '22023', `Record ${c.id} in ${c.tbl} has no data`];
      const key = `${c.tbl}|${c.id}`;
      const old = state.rows.get(key);
      if (old && JSON.stringify(old.data) !== JSON.stringify(c.deleted ? null : c.data) && (c.deleted || old.client_id !== args.p_client_id || args.p_force_archive)) {
        archive(old, c.deleted ? 'delete' : 'update');
      }
      const row = { tbl: c.tbl, id: c.id, data: c.deleted ? null : c.data, deleted: !!c.deleted, client_id: args.p_client_id ?? null, updated_at: nowTs() };
      state.rows.set(key, row);
      out.push({ tbl: c.tbl, id: c.id, updated_at: row.updated_at });
    }
    return out;
  },
  server_counts(u) {
    if (!isOwner(u)) throw [403, '42501', 'Only the studio owner can read the studio data'];
    const counts = Object.fromEntries(TABLES.map((t) => [t, 0]));
    for (const r of state.rows.values()) if (!r.deleted) counts[r.tbl]++;
    return counts;
  },
  history_list(u, args) {
    if (!isOwner(u)) return [];
    return state.history
      .filter((h) => (!args.p_table || h.table_name === args.p_table) && (!args.p_record || h.record_id === args.p_record) && (!args.p_before || h.id < args.p_before))
      .sort((a, b) => b.id - a.id)
      .slice(0, args.p_limit || 50)
      .map((h) => ({
        id: h.id,
        table: h.table_name,
        record_id: h.record_id,
        label: h.data?.nameAr || h.data?.name || h.data?.title || h.data?.label || h.record_id,
        label_en: h.data?.name || h.data?.title || h.data?.label || h.record_id,
        reason: h.reason,
        client_id: h.client_id,
        valid_from: h.valid_from,
        archived_at: h.archived_at,
      }));
  },
  history_record(u, args) {
    if (!isOwner(u)) return null;
    const h = state.history.find((x) => x.id === Number(args.p_id));
    return h ? { id: h.id, table: h.table_name, record_id: h.record_id, data: h.data, archived_at: h.archived_at } : null;
  },
};

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204);
  const body = await readBody(req);

  // --- test hooks
  if (path === '/__test/reset') {
    reset();
    return send(res, 200, { ok: true });
  }
  if (path === '/__test/fail') {
    Object.assign(state.fail, json(body));
    return send(res, 200, state.fail);
  }
  if (path === '/__test/state') {
    const rows = [...state.rows.values()];
    return send(res, 200, {
      owner: state.owner,
      users: [...state.users.values()].map((u) => ({ id: u.id, email: u.email })),
      counts: rpc.server_counts({ id: state.owner }),
      rows,
      objects: [...state.objects.entries()].map(([p, o]) => ({ path: p, size: o.bytes.length, type: o.type, sha256: createHash('sha256').update(o.bytes).digest('hex') })),
      history: state.history.length,
      calls: state.calls,
    });
  }

  // --- auth
  if (path === '/auth/v1/health') return send(res, 200, { name: 'fake-gotrue' });
  if (path === '/auth/v1/settings') return send(res, 200, { external: { email: true }, disable_signup: false });
  if (path === '/auth/v1/signup' && req.method === 'POST') {
    const { email, password } = json(body);
    if (!email || !password) return send(res, 400, { code: 'validation_failed', msg: 'Missing email or password' });
    if (state.users.has(email.toLowerCase())) return send(res, 422, { code: 'user_already_exists', msg: 'User already registered' });
    const user = { id: randomUUID(), email: email.toLowerCase(), password };
    state.users.set(user.email, user);
    return send(res, 200, makeSession(user));
  }
  if (path === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const b = json(body);
    if (grant === 'password') {
      const u = state.users.get(String(b.email || '').toLowerCase());
      if (!u || u.password !== b.password) return send(res, 400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      return send(res, 200, makeSession(u));
    }
    if (grant === 'refresh_token') {
      const id = state.refresh.get(b.refresh_token);
      const u = [...state.users.values()].find((x) => x.id === id);
      if (!u) return send(res, 400, { code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      return send(res, 200, makeSession(u));
    }
    return send(res, 400, { msg: 'unsupported grant' });
  }
  if (path === '/auth/v1/user') {
    const u = userFrom(req);
    if (!u) return send(res, 401, { code: 'bad_jwt', msg: 'invalid JWT' });
    if (req.method === 'PUT') {
      const b = json(body);
      if (b.password) u.password = b.password;
    }
    return send(res, 200, publicUser(u));
  }
  if (path === '/auth/v1/logout') return send(res, 204);
  if (path === '/auth/v1/recover') return send(res, 200, {});

  // --- RPC
  if (path.startsWith('/rest/v1/rpc/') && req.method === 'POST') {
    const fn = path.slice('/rest/v1/rpc/'.length);
    if (!rpc[fn]) return pgError(res, 404, 'PGRST202', `Could not find the function public.${fn} in the schema cache`);
    try {
      return send(res, 200, rpc[fn](userFrom(req), json(body)));
    } catch (e) {
      if (Array.isArray(e)) return pgError(res, e[0], e[1], e[2]);
      return pgError(res, 500, 'XX000', String(e));
    }
  }

  // --- storage
  const bucketPrefix = '/storage/v1/object/';
  if (path.startsWith(bucketPrefix)) {
    const u = userFrom(req);
    const rest = path.slice(bucketPrefix.length);
    if (rest.startsWith('sign/')) {
      const objectPath = decodeURIComponent(rest.slice('sign/studio-files/'.length));
      if (req.method === 'POST') {
        if (!isOwner(u)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        return send(res, 200, { signedURL: `/object/sign/studio-files/${objectPath.split('/').map(encodeURIComponent).join('/')}?token=${randomUUID()}` });
      }
      const obj = state.objects.get(objectPath);
      if (!obj) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return send(res, 200, obj.bytes, obj.type);
    }
    if (rest.startsWith('list/')) {
      if (!isOwner(u)) return send(res, 200, []);
      const { prefix = '' } = json(body);
      const names = new Set();
      for (const p of state.objects.keys()) if (p.startsWith(`${prefix}/`)) names.add(p.slice(prefix.length + 1).split('/')[0]);
      return send(res, 200, [...names].map((name) => ({ name, id: name })));
    }
    if (rest.startsWith('authenticated/')) {
      if (!isOwner(u)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'permission denied' });
      const objectPath = decodeURIComponent(rest.slice('authenticated/studio-files/'.length));
      const obj = state.objects.get(objectPath);
      if (!obj) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return send(res, 200, obj.bytes, obj.type);
    }
    if (rest === 'studio-files' && req.method === 'DELETE') {
      if (!isOwner(u)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'permission denied' });
      for (const p of json(body).prefixes || []) state.objects.delete(p);
      return send(res, 200, []);
    }
    if (rest.startsWith('studio-files/') && (req.method === 'POST' || req.method === 'PUT')) {
      if (!isOwner(u)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      if (state.fail.storage) return send(res, 503, { statusCode: '503', error: 'Service Unavailable', message: 'Simulated storage failure' });
      if (body.length > state.fail.maxBytes) return send(res, 400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      const objectPath = decodeURIComponent(rest.slice('studio-files/'.length));
      state.objects.set(objectPath, { bytes: body, type: req.headers['content-type'] || 'application/octet-stream' });
      state.calls.upload++;
      return send(res, 200, { Key: `studio-files/${objectPath}`, Id: randomUUID() });
    }
  }

  return send(res, 404, { message: `Not found: ${req.method} ${path}` });
}

http
  .createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, { message: String(e) }));
  })
  .listen(PORT, () => {
    console.log(`fake supabase listening on http://localhost:${PORT}`);
  });
