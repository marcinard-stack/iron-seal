import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  var sql = neon(process.env.DATABASE_URL);
  var slug = req.query.slug;
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
    // GET exclusions (via ?type=exclusions)
    if (req.method === 'GET' && req.query.type === 'exclusions') {
      var projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
      if (!projects.length) return res.status(404).json({ error: 'project not found' });
      var rows = await sql`SELECT id, position, title, description, reportable_lot2 FROM exclusions WHERE project_id = ${projects[0].id} ORDER BY position`;
      return res.json(rows);
    }

    // PUT: update a job's included state or exclusion reportable_lot2
    if (req.method === 'PUT') {
      // Exclusion update (FU-16)
      if (req.body.exclusion_id != null && req.body.reportable_lot2 != null) {
        var exclusion_id = req.body.exclusion_id;
        var reportable_lot2 = req.body.reportable_lot2;
        await sql`UPDATE exclusions SET reportable_lot2 = ${reportable_lot2} WHERE id = ${exclusion_id}`;
        return res.json({ ok: true });
      }

      var job_id = req.body.job_id;
      var included = req.body.included;
      if (job_id == null || included == null) return res.status(400).json({ error: 'job_id and included required' });
      await sql`UPDATE jobs SET included = ${included} WHERE id = ${job_id}`;
      return res.json({ ok: true });
    }

    // GET: all features + jobs for a project
    var projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
    if (!projects.length) return res.status(404).json({ error: 'project not found' });
    var projectId = projects[0].id;

    var features = await sql`
      SELECT id, position, code, title, description, is_transverse
      FROM features WHERE project_id = ${projectId}
      ORDER BY position
    `;

    var jobs = [];
    if (features.length) {
      jobs = await sql`
        SELECT id, feature_id, position, description, jh, type, priority, is_offered, included
        FROM jobs WHERE feature_id IN (SELECT id FROM features WHERE project_id = ${projectId})
        ORDER BY position
      `;
    }

    var result = features.map(function(f) {
      return Object.assign({}, f, {
        jobs: jobs.filter(function(j) { return j.feature_id === f.id; })
      });
    });

    // Clean stale presence (>15s) and get all online users (including self)
    await sql`DELETE FROM presence WHERE last_seen < NOW() - INTERVAL '15 seconds'`;
    var online = await sql`
      SELECT p.user_id, u.name, u.avatar_choice FROM presence p
      JOIN users u ON u.id = p.user_id
      WHERE p.project_slug = ${slug} AND p.user_id IS NOT NULL
    `;

    return res.json({ features: result, presence: online });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
