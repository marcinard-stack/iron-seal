import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

async function sendEmail(to, subject, html) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_KEY
    },
    body: JSON.stringify({
      from: 'deal-forge <notifications@mail.blueheronlab.com>',
      to: to,
      subject: subject,
      html: html
    })
  });
}

function signedEmail(projectTitle, signerName, signedAt, hash) {
  return '<div style="font-family:-apple-system,system-ui,sans-serif; max-width:520px; margin:0 auto; padding:32px 0;">'
    + '<p style="font-size:14px; color:#6b6560; margin-bottom:4px;">deal-forge</p>'
    + '<h2 style="font-size:20px; color:#2d2b35; margin-bottom:16px;">Devis signé</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.6; margin-bottom:8px;">'
    + 'Le projet <strong>' + projectTitle + '</strong> a été signé par <strong>' + signerName + '</strong>.</p>'
    + '<div style="background:#f9f8f6; border-radius:8px; padding:16px; margin:16px 0; font-size:13px; color:#4a4850;">'
    + '<div style="margin-bottom:6px;"><strong>Date :</strong> ' + signedAt + '</div>'
    + '<div style="margin-bottom:6px;"><strong>Signataire :</strong> ' + signerName + '</div>'
    + '<div><strong>Hash du document :</strong> <code style="font-size:11px; color:#8a8780; word-break:break-all;">' + hash + '</code></div>'
    + '</div>'
    + '<p style="font-size:13px; color:#4a4850; line-height:1.6;">Le PDF signé est disponible depuis l\'interface deal-forge.</p>'
    + '<p style="font-size:12px; color:#8a8780; margin-top:32px;">Cet email a été envoyé via deal-forge.</p>'
    + '</div>';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);

  try {
    // GET: check if project has a signature
    if (req.method === 'GET') {
      var slug = req.query.slug;
      if (!slug) return res.status(400).json({ error: 'slug required' });
      var projects = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
      if (!projects.length) return res.status(404).json({ error: 'project not found' });
      var sigs = await sql`
        SELECT id, signer_name, signer_email, devis_hash, ip_address, signed_at
        FROM devis_signatures WHERE project_id = ${projects[0].id}
        ORDER BY signed_at DESC LIMIT 1
      `;
      return res.json(sigs.length ? sigs[0] : null);
    }

    // POST: sign the devis
    if (req.method === 'POST') {
      var { slug, signer_name, devis_hash, city } = req.body;
      if (!slug || !signer_name || !devis_hash) return res.status(400).json({ error: 'slug, signer_name, devis_hash required' });

      // Resolve signer from auth
      var auth = (req.headers.authorization || '').replace('Bearer ', '');
      var signer = null;
      if (auth) {
        var sess = await sql`
          SELECT u.id, u.name, u.email, u.account_id FROM sessions s
          JOIN users u ON u.id = s.user_id WHERE s.token = ${auth} AND s.expires_at > NOW()
        `;
        if (sess.length) signer = sess[0];
      }
      if (!signer) return res.status(401).json({ error: 'Authentication required to sign' });

      // Get project
      var projects = await sql`SELECT * FROM projects WHERE slug = ${slug}`;
      if (!projects.length) return res.status(404).json({ error: 'project not found' });
      var project = projects[0];

      if (project.status !== 'proposed') return res.status(400).json({ error: 'Project must be in proposed status to sign' });

      // Get IP
      var ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      if (ip.includes(',')) ip = ip.split(',')[0].trim();

      // Save signature
      var rows = await sql`
        INSERT INTO devis_signatures (project_id, signer_user_id, signer_name, signer_email, devis_hash, ip_address, city)
        VALUES (${project.id}, ${signer.id}, ${signer_name}, ${signer.email}, ${devis_hash}, ${ip}, ${city || null})
        RETURNING *
      `;

      // Update project status to signed
      await sql`UPDATE projects SET status = 'signed', updated_at = NOW() WHERE id = ${project.id}`;

      // Format date
      var signedAt = new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' });

      // Notify freelance
      if (project.freelance_account_id) {
        var freelancers = await sql`SELECT email FROM users WHERE account_id = ${project.freelance_account_id}`;
        if (freelancers.length) {
          await sendEmail(freelancers[0].email, 'Devis signé : ' + project.title, signedEmail(project.title, signer_name, signedAt, devis_hash));
        }
      }

      // Notify signer (client)
      await sendEmail(signer.email, 'Confirmation de signature : ' + project.title, signedEmail(project.title, signer_name, signedAt, devis_hash));

      return res.status(201).json(rows[0]);
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
