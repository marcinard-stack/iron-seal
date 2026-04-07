import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

function hashPassword(password) {
  return new Promise(function(resolve, reject) {
    var salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, function(err, derived) {
      if (err) return reject(err);
      resolve(salt.toString('hex') + ':' + derived.toString('hex'));
    });
  });
}

function verifyPassword(password, hash) {
  return new Promise(function(resolve, reject) {
    var parts = hash.split(':');
    var salt = Buffer.from(parts[0], 'hex');
    var key = Buffer.from(parts[1], 'hex');
    crypto.scrypt(password, salt, 64, function(err, derived) {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(key, derived));
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var action = req.query.action;

  try {
    // ── SIGNUP ──
    if (action === 'signup' && req.method === 'POST') {
      var { email, password, name, company } = req.body;
      if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      var existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
      if (existing.length) return res.status(409).json({ error: 'Email already registered' });

      var accounts = await sql`
        INSERT INTO accounts (name, type, plan) VALUES (${company || name}, 'solo', 'free') RETURNING id
      `;
      var passwordHash = await hashPassword(password);
      var users = await sql`
        INSERT INTO users (account_id, email, name, password_hash, role)
        VALUES (${accounts[0].id}, ${email.toLowerCase().trim()}, ${name}, ${passwordHash}, 'owner')
        RETURNING id, email, name
      `;
      var token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessions (user_id, token) VALUES (${users[0].id}, ${token})`;

      return res.status(201).json({
        token: token,
        user: { id: users[0].id, email: users[0].email, name: users[0].name },
        account: { id: accounts[0].id }
      });
    }

    // ── LOGIN ──
    if (action === 'login' && req.method === 'POST') {
      var { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });

      var users = await sql`
        SELECT u.id, u.email, u.name, u.password_hash, u.account_id, u.role,
               a.name as account_name, a.type as account_type
        FROM users u JOIN accounts a ON a.id = u.account_id
        WHERE u.email = ${email.toLowerCase().trim()}
      `;
      if (!users.length || !users[0].password_hash) return res.status(401).json({ error: 'Invalid email or password' });

      var valid = await verifyPassword(password, users[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      var token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessions (user_id, token) VALUES (${users[0].id}, ${token})`;

      return res.json({
        token: token,
        user: { id: users[0].id, email: users[0].email, name: users[0].name, role: users[0].role },
        account: { id: users[0].account_id, name: users[0].account_name, type: users[0].account_type }
      });
    }

    // ── LOGOUT ──
    if (action === 'logout' && req.method === 'POST') {
      var auth = (req.headers.authorization || '').replace('Bearer ', '');
      if (auth) await sql`DELETE FROM sessions WHERE token = ${auth}`;
      return res.json({ ok: true });
    }

    // ── ME (GET + PUT) ──
    if (action === 'me') {
      var auth = (req.headers.authorization || '').replace('Bearer ', '');
      if (!auth) return res.status(401).json({ error: 'Not authenticated' });

      var sessions = await sql`SELECT user_id FROM sessions WHERE token = ${auth} AND expires_at > NOW()`;
      if (!sessions.length) return res.status(401).json({ error: 'Session expired' });
      var userId = sessions[0].user_id;

      if (req.method === 'GET') {
        var rows = await sql`
          SELECT u.id, u.email, u.name, u.role, u.avatar_url,
                 a.id as account_id, a.name as account_name, a.type as account_type,
                 a.legal_name, a.siren, a.tva_intra, a.default_tjm, a.default_weekly_cap, a.plan
          FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.id = ${userId}
        `;
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        var r = rows[0];
        return res.json({
          user: { id: r.id, email: r.email, name: r.name, role: r.role, avatar_url: r.avatar_url },
          account: {
            id: r.account_id, name: r.account_name, type: r.account_type,
            legal_name: r.legal_name, siren: r.siren, tva_intra: r.tva_intra,
            default_tjm: r.default_tjm, default_weekly_cap: r.default_weekly_cap, plan: r.plan
          }
        });
      }

      if (req.method === 'PUT') {
        var body = req.body;
        if (body.name !== undefined) await sql`UPDATE users SET name = ${body.name} WHERE id = ${userId}`;
        var user = await sql`SELECT account_id FROM users WHERE id = ${userId}`;
        var accountId = user[0].account_id;
        if (body.account_name !== undefined) await sql`UPDATE accounts SET name = ${body.account_name}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.legal_name !== undefined) await sql`UPDATE accounts SET legal_name = ${body.legal_name}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.siren !== undefined) await sql`UPDATE accounts SET siren = ${body.siren}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.tva_intra !== undefined) await sql`UPDATE accounts SET tva_intra = ${body.tva_intra}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.default_tjm !== undefined) await sql`UPDATE accounts SET default_tjm = ${body.default_tjm}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.default_weekly_cap !== undefined) await sql`UPDATE accounts SET default_weekly_cap = ${body.default_weekly_cap}, updated_at = NOW() WHERE id = ${accountId}`;
        return res.json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'Invalid action. Use ?action=signup|login|logout|me' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
