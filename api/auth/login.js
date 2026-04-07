import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    var users = await sql`
      SELECT u.id, u.email, u.name, u.password_hash, u.account_id, u.role,
             a.name as account_name, a.type as account_type
      FROM users u
      JOIN accounts a ON a.id = u.account_id
      WHERE u.email = ${email.toLowerCase().trim()}
    `;
    if (!users.length) return res.status(401).json({ error: 'Invalid email or password' });

    var user = users[0];
    if (!user.password_hash) return res.status(401).json({ error: 'Invalid email or password' });

    var valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Create session
    var token = crypto.randomBytes(32).toString('base64url');
    await sql`INSERT INTO sessions (user_id, token) VALUES (${user.id}, ${token})`;

    return res.json({
      token: token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      account: { id: user.account_id, name: user.account_name, type: user.account_type }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
