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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var { email, password, name, company } = req.body;

  if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    // Check if email already exists
    var existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    // Create account
    var accounts = await sql`
      INSERT INTO accounts (name, type, plan)
      VALUES (${company || name}, 'solo', 'free')
      RETURNING id
    `;
    var accountId = accounts[0].id;

    // Create user
    var passwordHash = await hashPassword(password);
    var users = await sql`
      INSERT INTO users (account_id, email, name, password_hash, role)
      VALUES (${accountId}, ${email.toLowerCase().trim()}, ${name}, ${passwordHash}, 'owner')
      RETURNING id, email, name
    `;

    // Create session
    var token = crypto.randomBytes(32).toString('base64url');
    await sql`
      INSERT INTO sessions (user_id, token)
      VALUES (${users[0].id}, ${token})
    `;

    return res.status(201).json({
      token: token,
      user: { id: users[0].id, email: users[0].email, name: users[0].name },
      account: { id: accountId }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
