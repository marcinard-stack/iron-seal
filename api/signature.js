import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

async function sendEmail(to, subject, html, attachments) {
  var payload = {
    from: 'Iron Seal <notifications@mail.blueheronlab.com>',
    to: to,
    subject: subject,
    html: html
  };
  if (attachments) payload.attachments = attachments;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_KEY
    },
    body: JSON.stringify(payload)
  });
}

function signedEmail(projectTitle, signerName, signedAt, hash) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
    + '<body style="margin:0; padding:0; background:#f4f3ee; font-family:-apple-system,system-ui,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ee; padding:32px 16px;">'
    + '<tr><td align="center">'
    + '<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">'
    + '<tr><td style="padding:0 0 24px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="font-size:16px; font-weight:700; color:#2d2b35; letter-spacing:-0.02em;">Iron Seal</td>'
    + '<td align="right" style="font-size:11px; color:#b1ada1;">Proposition &amp; signature en ligne</td>'
    + '</tr></table></td></tr>'
    + '<tr><td style="background:white; border-radius:10px; padding:32px 36px; box-shadow:0 1px 4px rgba(0,0,0,0.06);">'
    + '<p style="margin:0 0 12px;"><span style="display:inline-block; font-size:10px; font-weight:600; padding:2px 8px; border-radius:6px; background:#dcfce7; color:#166534;">Document signe</span></p>'
    + '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px; line-height:1.3;">' + projectTitle + '</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 16px;">'
    + 'Ce projet a ete signe electroniquement par <strong>' + signerName + '</strong>.</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f8f6; border-radius:8px; margin:0 0 16px;">'
    + '<tr><td style="padding:16px 20px;">'
    + '<p style="font-size:13px; color:#4a4850; margin:0 0 6px;"><strong>Date :</strong> ' + signedAt + '</p>'
    + '<p style="font-size:13px; color:#4a4850; margin:0 0 6px;"><strong>Signataire :</strong> ' + signerName + '</p>'
    + '<p style="font-size:11px; color:#8a8780; margin:0; word-break:break-all;"><strong>Hash :</strong> ' + hash.substring(0, 32) + '...</p>'
    + '</td></tr></table>'
    + '<p style="font-size:13px; color:#6b6560; line-height:1.6; margin:0;">Le PDF signe est joint a cet email et disponible depuis l\'interface Iron Seal.</p>'
    + '</td></tr>'
    + '<tr><td style="padding:24px 0 0; text-align:center;">'
    + '<p style="font-size:11px; color:#b1ada1; margin:0 0 6px;">Iron Seal par Blue Heron Lab</p>'
    + '<p style="font-size:10px; color:#c4c2bc; margin:0;">Vous recevez cet email car vous etes partie prenante d\'un projet sur Iron Seal.<br>'
    + 'Pour ne plus recevoir ces notifications, modifiez vos <a href="https://ironseal.vercel.app/settings" style="color:#c4c2bc;">preferences email</a>.</p>'
    + '</td></tr></table></td></tr></table></body></html>';
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
        SELECT s.id, s.signer_name, s.signer_email, s.devis_hash, s.ip_address, s.signed_at, s.status,
               v.version
        FROM devis_signatures s
        LEFT JOIN devis_versions v ON v.id = s.version_id
        WHERE s.project_id = ${projects[0].id} AND s.status = 'active'
        ORDER BY s.signed_at DESC LIMIT 1
      `;
      // Also get version history
      var versions = await sql`
        SELECT id, version, status, created_at, proposed_at
        FROM devis_versions WHERE project_id = ${projects[0].id}
        ORDER BY created_at DESC
      `;
      return res.json({ signature: sigs.length ? sigs[0] : null, versions: versions });
    }

    // POST: sign the devis OR upload PDF
    if (req.method === 'POST') {
      // PDF upload (after signing — sends email with attachment)
      if (req.query.action === 'pdf') {
        var { slug: pdfSlug, pdf_base64 } = req.body;
        if (!pdfSlug || !pdf_base64) return res.status(400).json({ error: 'slug and pdf_base64 required' });
        var pProjects = await sql`SELECT * FROM projects WHERE slug = ${pdfSlug}`;
        if (!pProjects.length) return res.status(404).json({ error: 'project not found' });
        var pProject = pProjects[0];
        var pSig = await sql`SELECT * FROM devis_signatures WHERE project_id = ${pProject.id} ORDER BY signed_at DESC LIMIT 1`;
        if (!pSig.length) return res.status(400).json({ error: 'no signature found' });
        var attachments = [{ filename: 'devis-signe-' + pdfSlug + '.pdf', content: pdf_base64 }];
        var pSignedAt = new Date(pSig[0].signed_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' });
        // Send to freelance
        if (pProject.freelance_account_id) {
          var pf = await sql`SELECT email FROM users WHERE account_id = ${pProject.freelance_account_id}`;
          if (pf.length) await sendEmail(pf[0].email, 'Devis signé : ' + pProject.title, signedEmail(pProject.title, pSig[0].signer_name, pSignedAt, pSig[0].devis_hash), attachments);
        }
        // Send to client
        if (pProject.client_account_id) {
          var pc = await sql`SELECT email FROM users WHERE account_id = ${pProject.client_account_id}`;
          if (pc.length) await sendEmail(pc[0].email, 'Confirmation de signature : ' + pProject.title, signedEmail(pProject.title, pSig[0].signer_name, pSignedAt, pSig[0].devis_hash), attachments);
        }
        return res.json({ ok: true });
      }
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
      var ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress || 'unknown';
      if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();

      // Get current devis version
      var currentVersion = await sql`SELECT id FROM devis_versions WHERE project_id = ${project.id} AND status = 'proposed' ORDER BY created_at DESC LIMIT 1`;
      var versionId = currentVersion.length ? currentVersion[0].id : null;

      // Mark previous signatures as superseded
      await sql`UPDATE devis_signatures SET status = 'superseded' WHERE project_id = ${project.id} AND status = 'active'`;

      // Mark current version as signed
      if (versionId) await sql`UPDATE devis_versions SET status = 'signed' WHERE id = ${versionId}`;

      // Save signature
      var rows = await sql`
        INSERT INTO devis_signatures (project_id, signer_user_id, signer_name, signer_email, devis_hash, ip_address, city, version_id, status)
        VALUES (${project.id}, ${signer.id}, ${signer_name}, ${signer.email}, ${devis_hash}, ${ip}, ${city || null}, ${versionId}, 'active')
        RETURNING *
      `;

      // Update project status to signed
      await sql`UPDATE projects SET status = 'signed', updated_at = NOW() WHERE id = ${project.id}`;

      // Auto-generate ref_number if missing
      if (!project.ref_number) {
        var year = new Date().getFullYear().toString().slice(-2);
        var month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        var count = await sql`SELECT COUNT(*) as c FROM projects WHERE ref_number IS NOT NULL`;
        var num = (parseInt(count[0].c) + 1).toString().padStart(2, '0');
        var refNum = 'BDC' + year + month + num;
        await sql`UPDATE projects SET ref_number = ${refNum} WHERE id = ${project.id}`;
        project.ref_number = refNum;
      }

      // Get account info + addresses for PDF
      var freelanceInfo = null, clientInfo = null;
      if (project.freelance_account_id) {
        var fi = await sql`SELECT a.name, a.legal_name, a.siren, a.tva_intra, u.name as user_name, u.email as user_email FROM accounts a LEFT JOIN users u ON u.account_id = a.id WHERE a.id = ${project.freelance_account_id} LIMIT 1`;
        if (fi.length) {
          freelanceInfo = fi[0];
          var fAddr = await sql`SELECT line1, line2, city, zip, country FROM addresses WHERE account_id = ${project.freelance_account_id} AND is_default = true LIMIT 1`;
          if (!fAddr.length) fAddr = await sql`SELECT line1, line2, city, zip, country FROM addresses WHERE account_id = ${project.freelance_account_id} ORDER BY id LIMIT 1`;
          if (fAddr.length) freelanceInfo.address = fAddr[0];
        }
      }
      if (project.client_account_id) {
        var ci = await sql`SELECT a.name, a.legal_name, a.siren, a.tva_intra, u.name as user_name, u.email as user_email FROM accounts a LEFT JOIN users u ON u.account_id = a.id WHERE a.id = ${project.client_account_id} LIMIT 1`;
        if (ci.length) {
          clientInfo = ci[0];
          var cAddr = await sql`SELECT line1, line2, city, zip, country FROM addresses WHERE account_id = ${project.client_account_id} AND is_default = true LIMIT 1`;
          if (!cAddr.length) cAddr = await sql`SELECT line1, line2, city, zip, country FROM addresses WHERE account_id = ${project.client_account_id} ORDER BY id LIMIT 1`;
          if (cAddr.length) clientInfo.address = cAddr[0];
        }
      }

      // Format date with time
      var signedAt = new Date().toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'medium', timeZone: 'Europe/Paris' });

      // Emails with PDF will be sent in a separate call after client-side PDF generation

      return res.status(201).json({ ...rows[0], freelance_info: freelanceInfo, client_info: clientInfo, ref_number: project.ref_number });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
