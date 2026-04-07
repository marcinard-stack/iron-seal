import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

function generateSlug(title) {
  var base = title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  var hash = Math.random().toString(36).substring(2, 8);
  return base + '-' + hash;
}

export default async function handler(req, res) {
  var sql = getDb();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Resolve session → account_id if auth header present
    var accountId = null;
    var authToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (authToken) {
      var sess = await sql`
        SELECT u.account_id FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ${authToken} AND s.expires_at > NOW()
      `;
      if (sess.length) accountId = sess[0].account_id;
    }

    if (req.method === 'GET') {
      var status = req.query.status;
      var slug = req.query.slug;
      if (slug) {
        var rows = await sql`SELECT * FROM projects WHERE slug = ${slug} LIMIT 1`;
        return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'not found' });
      }
      // Filter by account if authenticated
      if (accountId && status) {
        var rows = await sql`SELECT * FROM projects WHERE status = ${status} AND (owner_account_id = ${accountId} OR freelance_account_id = ${accountId} OR client_account_id = ${accountId}) ORDER BY updated_at DESC`;
        return res.json(rows);
      }
      if (accountId) {
        var rows = await sql`SELECT * FROM projects WHERE owner_account_id = ${accountId} OR freelance_account_id = ${accountId} OR client_account_id = ${accountId} ORDER BY updated_at DESC`;
        return res.json(rows);
      }
      if (status) {
        var rows = await sql`SELECT * FROM projects WHERE status = ${status} ORDER BY updated_at DESC`;
        return res.json(rows);
      }
      var rows = await sql`SELECT * FROM projects ORDER BY updated_at DESC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      var { title } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      var slug = generateSlug(title);
      var rows = await sql`
        INSERT INTO projects (slug, title, status, owner_account_id, freelance_account_id)
        VALUES (${slug}, ${title}, 'draft', ${accountId}, ${accountId})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'PUT') {
      var { slug, title, status, owner_account_id, freelance_account_id, client_account_id } = req.body;
      if (!slug) return res.status(400).json({ error: 'slug required' });
      var rows = await sql`
        UPDATE projects
        SET title = COALESCE(${title ?? null}, title),
            status = COALESCE(${status ?? null}, status),
            owner_account_id = COALESCE(${owner_account_id ?? null}, owner_account_id),
            freelance_account_id = COALESCE(${freelance_account_id ?? null}, freelance_account_id),
            client_account_id = COALESCE(${client_account_id ?? null}, client_account_id),
            updated_at = NOW()
        WHERE slug = ${slug}
        RETURNING *
      `;
      return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'not found' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
