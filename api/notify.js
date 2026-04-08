import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

async function createMagicToken(sql, email) {
  var users = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (!users.length) return null;
  var token = crypto.randomBytes(32).toString('base64url');
  await sql`INSERT INTO sessions (user_id, token) VALUES (${users[0].id}, ${token})`;
  return token;
}

async function sendEmail(to, subject, html) {
  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_KEY
    },
    body: JSON.stringify({
      from: 'Iron Seal <notifications@mail.blueheronlab.com>',
      to: to,
      subject: subject,
      html: html
    })
  });
  return res.json();
}

// ===== EMAIL TEMPLATE SYSTEM =====
function emailLayout(content) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
    + '<body style="margin:0; padding:0; background:#f4f3ee; font-family:-apple-system,system-ui,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ee; padding:32px 16px;">'
    + '<tr><td align="center">'
    // Header
    + '<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">'
    + '<tr><td style="padding:0 0 24px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="font-size:16px; font-weight:700; color:#2d2b35; letter-spacing:-0.02em;">Iron Seal</td>'
    + '<td align="right" style="font-size:11px; color:#b1ada1;">Proposition &amp; signature en ligne</td>'
    + '</tr></table>'
    + '</td></tr>'
    // Body card
    + '<tr><td style="background:white; border-radius:10px; padding:32px 36px; box-shadow:0 1px 4px rgba(0,0,0,0.06);">'
    + content
    + '</td></tr>'
    // Footer
    + '<tr><td style="padding:24px 0 0; text-align:center;">'
    + '<p style="font-size:11px; color:#b1ada1; margin:0 0 6px;">Iron Seal par Blue Heron Lab</p>'
    + '<p style="font-size:10px; color:#c4c2bc; margin:0;">Vous recevez cet email car vous etes partie prenante d\'un projet sur Iron Seal.<br>'
    + 'Pour ne plus recevoir ces notifications, modifiez vos <a href="https://Iron Seal-tawny.vercel.app/settings" style="color:#c4c2bc;">preferences email</a>.</p>'
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table></body></html>';
}

function emailBtn(href, label) {
  return '<table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 12px;"><tr><td align="center">'
    + '<table cellpadding="0" cellspacing="0"><tr><td style="background:#c15f3c; border-radius:8px;">'
    + '<a href="' + href + '" style="display:inline-block; padding:13px 32px; color:white; text-decoration:none; font-size:14px; font-weight:600;">' + label + '</a>'
    + '</td></tr></table>'
    + '</td></tr></table>';
}

function emailTag(label, color) {
  var colors = { orange: ['#fef3c7','#92400e'], green: ['#dcfce7','#166534'], blue: ['#dbeafe','#1e40af'], gray: ['#f4f3ee','#6b6560'] };
  var c = colors[color] || colors.gray;
  return '<span style="display:inline-block; font-size:10px; font-weight:600; padding:2px 8px; border-radius:6px; background:' + c[0] + '; color:' + c[1] + ';">' + label + '</span>';
}

function proposalEmail(projectTitle, freelanceName, viewLink) {
  return emailLayout(
    '<p style="margin:0 0 14px;">' + emailTag('Nouvelle proposition', 'orange') + '</p>'
    + '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 20px; line-height:1.3;">' + projectTitle + '</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 10px; text-align:justify;">'
    + '<strong>' + freelanceName + '</strong> vous a envoy\u00e9 une proposition commerciale.</p>'
    + '<p style="font-size:13px; color:#6b6560; line-height:1.7; margin:0; text-align:justify;">'
    + 'Consultez le cahier des charges et le devis, ajoutez vos commentaires et choisissez les options qui vous conviennent.</p>'
    + emailBtn(viewLink, 'Voir la proposition')
    + '<p style="font-size:11px; color:#b1ada1; margin:0; text-align:center;">Ce lien vous connecte automatiquement.</p>'
  );
}

function backToDraftEmail(projectTitle, requesterName, isClient, link, message) {
  var action = isClient ? 'a demand\u00e9 des modifications sur' : 'a repass\u00e9 en brouillon';
  var msgBlock = message ? '<div style="background:#f9f8f6; border-left:3px solid #c15f3c; border-radius:0 6px 6px 0; padding:12px 16px; margin:16px 0 0; font-size:13px; color:#4a4850; line-height:1.6; white-space:pre-wrap;">' + message.replace(/</g, '&lt;') + '</div>' : '';
  return emailLayout(
    '<p style="margin:0 0 14px;">' + emailTag('Retour en brouillon', 'gray') + '</p>'
    + '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 20px; line-height:1.3;">' + projectTitle + '</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0; text-align:justify;">'
    + '<strong>' + requesterName + '</strong> ' + action + ' ce projet.</p>'
    + msgBlock
    + emailBtn(link, 'Voir le projet')
    + '<p style="font-size:11px; color:#b1ada1; margin:0; text-align:center;">Ce lien vous connecte automatiquement.</p>'
  );
}

async function createDevisVersion(sql, projectId) {
  // Get all features + jobs
  var features = await sql`SELECT id, position, code, title, description, is_transverse FROM features WHERE project_id = ${projectId} ORDER BY position`;
  var featureIds = features.map(function(f) { return f.id; });
  var jobs = [];
  if (featureIds.length) {
    jobs = await sql`SELECT id, feature_id, position, description, jh, type, priority, is_offered, included FROM jobs WHERE feature_id = ANY(${featureIds}) ORDER BY position`;
  }
  var exclusions = await sql`SELECT position, title, description FROM exclusions WHERE project_id = ${projectId} ORDER BY position`;

  var data = {
    features: features.map(function(f) {
      return { ...f, jobs: jobs.filter(function(j) { return j.feature_id === f.id; }) };
    }),
    exclusions: exclusions
  };

  // Compute next version number
  var prev = await sql`SELECT version FROM devis_versions WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
  var version = '1.0';
  if (prev.length) {
    var parts = prev[0].version.split('.');
    // Check if scope changed significantly (features added/removed = major, else minor)
    var prevData = await sql`SELECT data_json FROM devis_versions WHERE project_id = ${projectId} ORDER BY created_at DESC LIMIT 1`;
    if (prevData.length) {
      var oldFeats = prevData[0].data_json.features || [];
      var oldCodes = oldFeats.map(function(f) { return f.code; }).sort().join(',');
      var newCodes = features.map(function(f) { return f.code; }).sort().join(',');
      if (oldCodes !== newCodes) {
        version = (parseInt(parts[0]) + 1) + '.0';
      } else {
        version = parts[0] + '.' + (parseInt(parts[1]) + 1);
      }
    }
  }

  // Mark previous versions as superseded
  await sql`UPDATE devis_versions SET status = 'superseded' WHERE project_id = ${projectId} AND status = 'proposed'`;

  // Insert new version
  var rows = await sql`
    INSERT INTO devis_versions (project_id, version, data_json, proposed_at, status)
    VALUES (${projectId}, ${version}, ${JSON.stringify(data)}::jsonb, NOW(), 'proposed')
    RETURNING id, version
  `;

  // Update project version
  await sql`UPDATE projects SET version = ${version} WHERE id = ${projectId}`;

  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var { type, slug, view_link, message, client_email } = req.body;

  // Resolve sender from session
  var auth = (req.headers.authorization || '').replace('Bearer ', '');
  var sender = null;
  if (auth) {
    var sess = await sql`
      SELECT u.name, u.email, u.account_id FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ${auth} AND s.expires_at > NOW()
    `;
    if (sess.length) sender = sess[0];
  }

  try {
    // Get project
    var projects = await sql`SELECT * FROM projects WHERE slug = ${slug}`;
    if (!projects.length) return res.status(404).json({ error: 'Project not found' });
    var project = projects[0];

    if (type === 'invite_and_propose') {
      // Freelance invites client by email → create account if needed → link → send magic link
      if (!client_email) return res.status(400).json({ error: 'client_email required' });
      var cleanEmail = client_email.toLowerCase().trim();

      // Find or create user
      var existingUser = await sql`SELECT u.id, u.account_id FROM users u WHERE u.email = ${cleanEmail}`;
      var clientAccountId;
      if (existingUser.length) {
        clientAccountId = existingUser[0].account_id;
      } else {
        // Create account + user (no password — magic link only for now)
        var namePart = cleanEmail.split('@')[0].replace(/[._-]/g, ' ');
        var newAcct = await sql`INSERT INTO accounts (name, type, plan) VALUES (${namePart}, 'solo', 'free') RETURNING id`;
        clientAccountId = newAcct[0].id;
        await sql`INSERT INTO users (account_id, email, name, role) VALUES (${clientAccountId}, ${cleanEmail}, ${namePart}, 'owner')`;
      }

      // Link client to project
      await sql`UPDATE projects SET client_account_id = ${clientAccountId}, updated_at = NOW() WHERE slug = ${slug}`;

      // Create devis version snapshot
      var devisVersion = await createDevisVersion(sql, project.id);

      // Send magic link email
      var senderName = sender ? sender.name : 'Un freelance';
      var magicToken = await createMagicToken(sql, cleanEmail);
      var directLink = (req.headers.origin || 'https://Iron Seal-tawny.vercel.app') + '/deals/proposed/' + project.slug + '?auth=' + magicToken;
      var result = await sendEmail(
        cleanEmail,
        'Proposition : ' + project.title,
        proposalEmail(project.title, senderName, directLink)
      );
      return res.json({ ok: true, email: result, client_account_id: clientAccountId, sent_to: cleanEmail });
    }

    if (type === 'proposed') {
      // Create devis version snapshot
      var devisVersion = await createDevisVersion(sql, project.id);

      // Freelance proposes → notify client
      if (!project.client_account_id) return res.json({ ok: true, skipped: 'no client account on project' });
      var clients = await sql`SELECT email, name, email_prefs FROM users WHERE account_id = ${project.client_account_id}`;
      if (!clients.length) return res.json({ ok: true, skipped: 'no client user' });
      var prefs = clients[0].email_prefs || {};
      if (prefs.proposal_received === false) return res.json({ ok: true, skipped: 'email disabled by user' });
      var senderName = sender ? sender.name : 'Un freelance';
      var magicToken = await createMagicToken(sql, clients[0].email);
      var directLink = (req.headers.origin || 'https://Iron Seal-tawny.vercel.app') + '/deals/' + project.status + '/' + project.slug + '?auth=' + magicToken;
      var result = await sendEmail(
        clients[0].email,
        'Proposition : ' + project.title,
        proposalEmail(project.title, senderName, directLink)
      );
      return res.json({ ok: true, email: result, sent_to: clients[0].email });
    }

    if (type === 'back_to_draft') {
      // Whoever did the action → notify the OTHER party
      var notifyAccountId = null;
      if (sender && sender.account_id == project.freelance_account_id) {
        // Freelance reverted → notify client
        notifyAccountId = project.client_account_id;
      } else {
        // Client requested changes → notify freelance
        notifyAccountId = project.freelance_account_id;
      }
      if (!notifyAccountId) return res.json({ ok: true, skipped: 'no counterpart account' });
      var recipients = await sql`SELECT email, name, email_prefs FROM users WHERE account_id = ${notifyAccountId}`;
      if (!recipients.length) return res.json({ ok: true, skipped: 'no counterpart user' });
      var rPrefs = recipients[0].email_prefs || {};
      if (rPrefs.back_to_draft === false) return res.json({ ok: true, skipped: 'email disabled by user' });
      var requesterName = sender ? sender.name : 'Un utilisateur';
      var isClient = sender && sender.account_id == project.client_account_id;
      var magicToken = await createMagicToken(sql, recipients[0].email);
      var directLink = (req.headers.origin || 'https://Iron Seal-tawny.vercel.app') + '/deals/' + project.status + '/' + project.slug + '?auth=' + magicToken;
      var result = await sendEmail(
        recipients[0].email,
        'Retour en brouillon : ' + project.title,
        backToDraftEmail(project.title, requesterName, isClient, directLink, message)
      );
      return res.json({ ok: true, email: result, sent_to: recipients[0].email });
    }

    return res.status(400).json({ error: 'Invalid type. Use proposed|back_to_draft' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
