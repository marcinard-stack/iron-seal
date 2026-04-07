import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // POST — register a guest (email gate)
    if (req.method === 'POST') {
      var { project_id, email, name } = req.body;
      if (!project_id || !email) return res.status(400).json({ error: 'project_id and email required' });

      // Upsert: if guest with same email+project exists, update last_seen
      var existing = await sql`
        SELECT id FROM project_guests WHERE project_id = ${project_id} AND email = ${email}
      `;
      if (existing.length) {
        await sql`UPDATE project_guests SET last_seen_at = NOW(), name = COALESCE(${name || null}, name) WHERE id = ${existing[0].id}`;
        return res.json({ id: existing[0].id, returning: true });
      }

      var rows = await sql`
        INSERT INTO project_guests (project_id, email, name, last_seen_at)
        VALUES (${project_id}, ${email}, ${name || null}, NOW())
        RETURNING id
      `;
      return res.status(201).json(rows[0]);
    }

    // GET — list guests for a project
    if (req.method === 'GET') {
      var projectId = req.query.project_id;
      if (!projectId) return res.status(400).json({ error: 'project_id required' });
      var rows = await sql`
        SELECT id, email, name, last_seen_at, created_at
        FROM project_guests WHERE project_id = ${projectId}
        ORDER BY last_seen_at DESC
      `;
      return res.json(rows);
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
