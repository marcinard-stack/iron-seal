import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        doc_id VARCHAR(100) NOT NULL DEFAULT 'default',
        x REAL NOT NULL,
        y REAL NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        closed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(doc_id)`;
    return res.json({ ok: true, message: 'Table created' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
