import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'slug required' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // PUT: update a job's included state
    if (req.method === 'PUT') {
      const { job_id, included } = req.body;
      if (job_id == null || included == null) return res.status(400).json({ error: 'job_id and included required' });
      await sql`UPDATE jobs SET included = ${included} WHERE id = ${job_id}`;
      return res.json({ ok: true });
    }

    // GET: all features + jobs for a project
    const projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
    if (!projects.length) return res.status(404).json({ error: 'project not found' });
    const projectId = projects[0].id;

    const features = await sql`
      SELECT id, position, code, title, description, is_transverse
      FROM features WHERE project_id = ${projectId}
      ORDER BY position
    `;

    const featureIds = features.map(f => f.id);
    let jobs = [];
    if (featureIds.length) {
      jobs = await sql`
        SELECT id, feature_id, position, description, jh, type, priority, is_offered, included
        FROM jobs WHERE feature_id = ANY(${featureIds})
        ORDER BY position
      `;
    }

    const result = features.map(f => ({
      ...f,
      jobs: jobs.filter(j => j.feature_id === f.id)
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
