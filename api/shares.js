import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

export default async function handler(req, res) {
  const sql = getDb();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — resolve a share token to a project
    if (req.method === 'GET') {
      var token = req.query.token;
      var slug = req.query.slug;

      // Resolve token → project
      if (token) {
        var rows = await sql`
          SELECT s.id, s.project_id, s.token, s.permission, s.require_email, s.expires_at,
                 p.slug, p.title, p.status
          FROM project_shares s
          JOIN projects p ON p.id = s.project_id
          WHERE s.token = ${token}
        `;
        if (!rows.length) return res.status(404).json({ error: 'Link not found or expired' });
        var share = rows[0];
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
          return res.status(410).json({ error: 'Link expired' });
        }
        return res.json(share);
      }

      // List shares for a project
      if (slug) {
        var projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
        if (!projects.length) return res.status(404).json({ error: 'Project not found' });
        var shares = await sql`
          SELECT id, token, permission, require_email, expires_at, created_at
          FROM project_shares WHERE project_id = ${projects[0].id}
          ORDER BY created_at DESC
        `;
        return res.json(shares);
      }

      return res.status(400).json({ error: 'token or slug required' });
    }

    // POST — create a share link
    if (req.method === 'POST') {
      var { slug, permission, require_email, expires_in_days } = req.body;
      if (!slug) return res.status(400).json({ error: 'slug required' });

      var projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
      if (!projects.length) return res.status(404).json({ error: 'Project not found' });

      var token = crypto.randomBytes(24).toString('base64url');
      var perm = permission || 'view';
      var reqEmail = require_email || false;
      var expiresAt = expires_in_days ? new Date(Date.now() + expires_in_days * 86400000).toISOString() : null;

      var rows = await sql`
        INSERT INTO project_shares (project_id, token, permission, require_email, expires_at)
        VALUES (${projects[0].id}, ${token}, ${perm}, ${reqEmail}, ${expiresAt})
        RETURNING id, token, permission, require_email, expires_at, created_at
      `;
      return res.status(201).json(rows[0]);
    }

    // DELETE — revoke a share link
    if (req.method === 'DELETE') {
      var { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM project_shares WHERE id = ${id}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
