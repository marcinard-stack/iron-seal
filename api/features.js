import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL);
  const slug = req.query.slug;
  if (!slug) return res.status(400).json({ error: 'slug required' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Presence heartbeat (piggyback on poll)
    var auth = (req.headers.authorization || '').replace('Bearer ', '');
    var currentUserId = null;
    if (auth) {
      var sess = await sql`SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${auth} AND s.expires_at > NOW()`;
      if (sess.length) {
        currentUserId = sess[0].id;
        // Upsert presence
        var existing = await sql`SELECT id FROM presence WHERE project_slug = ${slug} AND user_id = ${currentUserId}`;
        if (existing.length) {
          await sql`UPDATE presence SET last_seen = NOW() WHERE id = ${existing[0].id}`;
        } else {
          await sql`INSERT INTO presence (project_slug, user_id, last_seen) VALUES (${slug}, ${currentUserId}, NOW())`;
        }
      }
    }
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

    // Clean stale presence (>15s) and get online users
    await sql`DELETE FROM presence WHERE last_seen < NOW() - INTERVAL '15 seconds'`;
    var online = await sql`
      SELECT p.user_id, u.name FROM presence p
      JOIN users u ON u.id = p.user_id
      WHERE p.project_slug = ${slug} AND p.user_id IS NOT NULL
    `;
    // Filter out current user
    var others = online.filter(function(o) { return o.user_id !== currentUserId; });

    return res.json({ features: result, presence: others });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
