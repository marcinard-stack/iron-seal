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
      from: 'deal-forge <notifications@mail.blueheronlab.com>',
      to: to,
      subject: subject,
      html: html
    })
  });
  return res.json();
}

function proposalEmail(projectTitle, freelanceName, viewLink) {
  return '<div style="font-family:-apple-system,system-ui,sans-serif; max-width:520px; margin:0 auto; padding:32px 0;">'
    + '<p style="font-size:14px; color:#6b6560; margin-bottom:4px;">deal-forge</p>'
    + '<h2 style="font-size:20px; color:#2d2b35; margin-bottom:16px;">Nouvelle proposition</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.6; margin-bottom:20px;">'
    + '<strong>' + freelanceName + '</strong> vous a envoyé une proposition pour le projet <strong>' + projectTitle + '</strong>.</p>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.6; margin-bottom:24px;">Consultez le cahier des charges et le devis, ajoutez vos commentaires, et choisissez les options qui vous conviennent.</p>'
    + '<a href="' + viewLink + '" style="display:inline-block; padding:12px 28px; background:#c15f3c; color:white; text-decoration:none; border-radius:8px; font-size:14px; font-weight:600;">Voir la proposition</a>'
    + '<p style="font-size:12px; color:#8a8780; margin-top:32px;">Cet email a été envoyé via deal-forge.</p>'
    + '</div>';
}

function backToDraftEmail(projectTitle, requesterName, isClient, link, message) {
  var action = isClient ? 'a demandé des modifications sur' : 'a repassé en brouillon';
  var msgBlock = message ? '<div style="background:#f9f8f6; border-left:3px solid #c15f3c; border-radius:0 8px 8px 0; padding:12px 16px; margin:16px 0; font-size:13px; color:#4a4850; line-height:1.6; white-space:pre-wrap;">' + message.replace(/</g, '&lt;') + '</div>' : '';
  return '<div style="font-family:-apple-system,system-ui,sans-serif; max-width:520px; margin:0 auto; padding:32px 0;">'
    + '<p style="font-size:14px; color:#6b6560; margin-bottom:4px;">deal-forge</p>'
    + '<h2 style="font-size:20px; color:#2d2b35; margin-bottom:16px;">Retour en brouillon</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.6; margin-bottom:8px;">'
    + '<strong>' + requesterName + '</strong> ' + action + ' le projet <strong>' + projectTitle + '</strong>.</p>'
    + msgBlock
    + '<a href="' + link + '" style="display:inline-block; padding:12px 28px; background:#2d2b35; color:white; text-decoration:none; border-radius:8px; font-size:14px; font-weight:600; margin-top:16px;">Voir le projet</a>'
    + '<p style="font-size:12px; color:#8a8780; margin-top:32px;">Cet email a été envoyé via deal-forge.</p>'
    + '</div>';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var { type, slug, view_link, message } = req.body;

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

    if (type === 'proposed') {
      // Freelance proposes → notify client
      if (!project.client_account_id) return res.json({ ok: true, skipped: 'no client account on project' });
      var clients = await sql`SELECT email, name, email_prefs FROM users WHERE account_id = ${project.client_account_id}`;
      if (!clients.length) return res.json({ ok: true, skipped: 'no client user' });
      var prefs = clients[0].email_prefs || {};
      if (prefs.proposal_received === false) return res.json({ ok: true, skipped: 'email disabled by user' });
      var senderName = sender ? sender.name : 'Un freelance';
      var magicToken = await createMagicToken(sql, clients[0].email);
      var directLink = (req.headers.origin || 'https://deal-forge-tawny.vercel.app') + '/deals/' + project.status + '/' + project.slug + '?auth=' + magicToken;
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
      var directLink = (req.headers.origin || 'https://deal-forge-tawny.vercel.app') + '/deals/' + project.status + '/' + project.slug + '?auth=' + magicToken;
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
