import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const sql = neon(process.env.DATABASE_URL);
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  await sql`DELETE FROM projects WHERE id = ${id}`;
  return res.json({ ok: true });
}
