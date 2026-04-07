import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'slug required' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
    if (!projects.length) return res.status(404).json({ error: 'project not found' });
    const projectId = projects[0].id;

    const rows = await sql`
      SELECT id, position, title, description
      FROM exclusions WHERE project_id = ${projectId}
      ORDER BY position
    `;
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
