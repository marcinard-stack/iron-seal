import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

export default async function handler(req, res) {
  const sql = getDb();
  const doc = req.query.doc || 'default';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, doc_id, x, y, text, closed, created_at
        FROM comments
        WHERE doc_id = ${doc}
        ORDER BY y ASC
      `;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { x, y, text } = req.body;
      const rows = await sql`
        INSERT INTO comments (doc_id, x, y, text, closed)
        VALUES (${doc}, ${x}, ${y}, ${text || ''}, false)
        RETURNING id, doc_id, x, y, text, closed, created_at
      `;
      return res.status(201).json(rows[0]);
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
        RETURNING id, doc_id, x, y, text, closed, created_at
      `;
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM comments WHERE id = ${id} AND doc_id = ${doc}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
