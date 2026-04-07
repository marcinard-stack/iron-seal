import { neon } from '@neondatabase/serverless';

async function sendEmail(to, subject, html) {
  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.RESEND_KEY
    },
    body: JSON.stringify({
      from: 'deal-forge <onboarding@resend.dev>',
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

function backToDraftEmail(projectTitle, requesterName, isClient) {
  var action = isClient ? 'a demandé des modifications sur' : 'a repassé en brouillon';
  return '<div style="font-family:-apple-system,system-ui,sans-serif; max-width:520px; margin:0 auto; padding:32px 0;">'
    + '<p style="font-size:14px; color:#6b6560; margin-bottom:4px;">deal-forge</p>'
    + '<h2 style="font-size:20px; color:#2d2b35; margin-bottom:16px;">Retour en brouillon</h2>'
    + '<p style="font-size:14px; color:#4a4850; line-height:1.6;">'
    + '<strong>' + requesterName + '</strong> ' + action + ' le projet <strong>' + projectTitle + '</strong>.</p>'
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
  var { type, slug, client_email, view_link } = req.body;

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
      // Notify client
      if (!client_email) return res.status(400).json({ error: 'client_email required' });
      var senderName = sender ? sender.name : 'Un freelance';
      var result = await sendEmail(
        client_email,
        'Proposition : ' + project.title,
        proposalEmail(project.title, senderName, view_link)
      );
      return res.json({ ok: true, email: result });
    }

    if (type === 'back_to_draft') {
      // Notify freelance
      if (!project.freelance_account_id) return res.json({ ok: true, skipped: 'no freelance account' });
      var freelancers = await sql`SELECT email, name FROM users WHERE account_id = ${project.freelance_account_id}`;
      if (!freelancers.length) return res.json({ ok: true, skipped: 'no freelance user' });
      var requesterName = sender ? sender.name : 'Le client';
      var isClient = sender && sender.account_id !== project.freelance_account_id;
      var result = await sendEmail(
        freelancers[0].email,
        'Retour en brouillon : ' + project.title,
        backToDraftEmail(project.title, requesterName, isClient)
      );
      return res.json({ ok: true, email: result });
    }

    return res.status(400).json({ error: 'Invalid type. Use proposed|back_to_draft' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
