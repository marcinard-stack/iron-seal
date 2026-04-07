import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

async function getUserFromAuth(sql, req) {
  var auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  var rows = await sql`
    SELECT u.id, u.name, u.email, u.account_id FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${auth} AND s.expires_at > NOW()
  `;
  return rows.length ? rows[0] : null;
}

export default async function handler(req, res) {
  const sql = getDb();
  const doc = req.query.doc || 'default';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT c.id, c.doc_id, c.x, c.y, c.text, c.closed, c.created_at, c.user_id, c.guest_id,
               u.name as user_name, u.email as user_email
        FROM comments c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.doc_id = ${doc}
        ORDER BY y ASC
      `;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      var user = await getUserFromAuth(sql, req);
      const { x, y, text } = req.body;
      const rows = await sql`
        INSERT INTO comments (doc_id, x, y, text, closed, user_id)
        VALUES (${doc}, ${x}, ${y}, ${text || ''}, false, ${user ? user.id : null})
        RETURNING id, doc_id, x, y, text, closed, created_at, user_id
      `;
      var row = rows[0];
      if (user) { row.user_name = user.name; row.user_email = user.email; }
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id, x, y, text, closed } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await sql`
        UPDATE comments
        SET x = COALESCE(${x ?? null}, x),
            y = COALESCE(${y ?? null}, y),
            text = COALESCE(${text ?? null}, text),
            closed = COALESCE(${closed ?? null}, closed),
            updated_at = NOW()
        WHERE id = ${id} AND doc_id = ${doc}
        RETURNING id, doc_id, x, y, text, closed, created_at, user_id
      `;
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Only author can delete
      var user = await getUserFromAuth(sql, req);
      if (user) {
        var comment = await sql`SELECT user_id FROM comments WHERE id = ${id} AND doc_id = ${doc}`;
        if (comment.length && comment[0].user_id && comment[0].user_id !== user.id) {
          return res.status(403).json({ error: 'Only the author can delete this comment' });
        }
      }

      await sql`DELETE FROM comments WHERE id = ${id} AND doc_id = ${doc}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
