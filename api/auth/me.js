import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return res.status(401).json({ error: 'Not authenticated' });

  try {
    var sessions = await sql`
      SELECT s.user_id FROM sessions s
      WHERE s.token = ${auth} AND s.expires_at > NOW()
    `;
    if (!sessions.length) return res.status(401).json({ error: 'Session expired' });

    var userId = sessions[0].user_id;

    // GET — return user + account
    if (req.method === 'GET') {
      var rows = await sql`
        SELECT u.id, u.email, u.name, u.role, u.avatar_url,
               a.id as account_id, a.name as account_name, a.type as account_type,
               a.legal_name, a.siren, a.tva_intra,
               a.default_tjm, a.default_weekly_cap, a.plan
        FROM users u
        JOIN accounts a ON a.id = u.account_id
        WHERE u.id = ${userId}
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

    // PUT — update account settings
    if (req.method === 'PUT') {
      var body = req.body;

      // Update user fields
      if (body.name !== undefined) {
        await sql`UPDATE users SET name = ${body.name} WHERE id = ${userId}`;
      }

      // Update account fields
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

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
