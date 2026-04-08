import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

async function sendAuthEmail(to, subject, html) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.RESEND_KEY },
    body: JSON.stringify({ from: 'deal-forge <notifications@mail.blueheronlab.com>', to: to, subject: subject, html: html })
  });
}

function authEmailLayout(content) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
    + '<body style="margin:0; padding:0; background:#f4f3ee; font-family:-apple-system,system-ui,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ee; padding:32px 16px;"><tr><td align="center">'
    + '<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">'
    + '<tr><td style="padding:0 0 24px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="font-size:16px; font-weight:700; color:#2d2b35; letter-spacing:-0.02em;">deal-forge</td>'
    + '<td align="right" style="font-size:11px; color:#b1ada1;">Proposition &amp; signature en ligne</td>'
    + '</tr></table></td></tr>'
    + '<tr><td style="background:white; border-radius:10px; padding:32px 36px; box-shadow:0 1px 4px rgba(0,0,0,0.06);">'
    + content + '</td></tr>'
    + '<tr><td style="padding:24px 0 0; text-align:center;">'
    + '<p style="font-size:11px; color:#b1ada1; margin:0;">deal-forge par Blue Heron Lab</p>'
    + '</td></tr></table></td></tr></table></body></html>';
}

function authBtn(href, label) {
  return '<table cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 12px;"><tr><td align="center">'
    + '<table cellpadding="0" cellspacing="0"><tr><td style="background:#c15f3c; border-radius:8px;">'
    + '<a href="' + href + '" style="display:inline-block; padding:13px 32px; color:white; text-decoration:none; font-size:14px; font-weight:600;">' + label + '</a>'
    + '</td></tr></table></td></tr></table>';
}

function hashPassword(password) {
  return new Promise(function(resolve, reject) {
    var salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, function(err, derived) {
      if (err) return reject(err);
      resolve(salt.toString('hex') + ':' + derived.toString('hex'));
    });
  });
}

function verifyPassword(password, hash) {
  return new Promise(function(resolve, reject) {
    var parts = hash.split(':');
    var salt = Buffer.from(parts[0], 'hex');
    var key = Buffer.from(parts[1], 'hex');
    crypto.scrypt(password, salt, 64, function(err, derived) {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(key, derived));
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var action = req.query.action;

  try {
    // ── SIGNUP ──
    if (action === 'signup' && req.method === 'POST') {
      var { email, password, name, company } = req.body;
      if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name required' });
      if (password.length < 9) return res.status(400).json({ error: 'Password must be at least 9 characters' });

      var existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase().trim()}`;
      if (existing.length) return res.status(409).json({ error: 'Email already registered' });

      var accounts = await sql`
        INSERT INTO accounts (name, type, plan) VALUES (${company || name}, 'solo', 'free') RETURNING id
      `;
      var passwordHash = await hashPassword(password);
      var verifyToken = crypto.randomBytes(32).toString('base64url');
      var users = await sql`
        INSERT INTO users (account_id, email, name, password_hash, role, verify_token)
        VALUES (${accounts[0].id}, ${email.toLowerCase().trim()}, ${name}, ${passwordHash}, 'owner', ${verifyToken})
        RETURNING id, email, name
      `;

      // Send welcome email
      var cleanedEmail = email.toLowerCase().trim();
      var homeLink = req.headers.origin || 'https://deal-forge-tawny.vercel.app';
      await sendAuthEmail(cleanedEmail, 'Bienvenue sur deal-forge',
        authEmailLayout(
          '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px;">Bienvenue sur deal-forge, ' + name + ' !</h2>'
          + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 12px; text-align:justify;">Vous venez de rejoindre deal-forge, la plateforme qui simplifie la relation freelance-client, du cadrage du besoin a la signature du devis.</p>'
          + '<p style="font-size:13px; color:#6b6560; line-height:1.7; margin:0 0 8px; text-align:justify;"><strong>Ce qui vous attend :</strong></p>'
          + '<p style="font-size:13px; color:#6b6560; line-height:1.8; margin:0 0 12px; text-align:justify;">'
          + '&bull; Construisez vos cahiers des charges et devis en quelques clics<br>'
          + '&bull; Partagez et collaborez en temps reel avec vos clients<br>'
          + '&bull; Faites signer vos devis electroniquement, sans quitter l\'outil<br>'
          + '&bull; Generez des PDF professionnels avec certificat de signature</p>'
          + authBtn(homeLink + '/deals/draft', 'Commencer')
          + '<p style="font-size:12px; color:#b1ada1; margin:16px 0 0; text-align:center;">Merci de votre confiance.<br>L\'equipe deal-forge</p>'
        ));

      // Send verification email
      var verifyLink = homeLink + '/login?verify=' + verifyToken;
      await sendAuthEmail(cleanedEmail, 'Verifiez votre email - deal-forge',
        authEmailLayout(
          '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px;">Verifiez votre adresse email</h2>'
          + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 6px; text-align:justify;">Une derniere etape pour securiser votre compte. Cliquez sur le bouton ci-dessous pour confirmer votre adresse email.</p>'
          + authBtn(verifyLink, 'Verifier mon email')
          + '<p style="font-size:11px; color:#b1ada1; margin:0; text-align:center;">Ce lien expire dans 24 heures.</p>'
        ));
      var token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessions (user_id, token) VALUES (${users[0].id}, ${token})`;

      return res.status(201).json({
        token: token,
        user: { id: users[0].id, email: users[0].email, name: users[0].name },
        account: { id: accounts[0].id }
      });
    }

    // ── LOGIN ──
    if (action === 'login' && req.method === 'POST') {
      var { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });

      var users = await sql`
        SELECT u.id, u.email, u.name, u.password_hash, u.account_id, u.role,
               a.name as account_name, a.type as account_type
        FROM users u JOIN accounts a ON a.id = u.account_id
        WHERE u.email = ${email.toLowerCase().trim()}
      `;
      if (!users.length || !users[0].password_hash) return res.status(401).json({ error: 'Invalid email or password' });

      var valid = await verifyPassword(password, users[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      var token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessions (user_id, token) VALUES (${users[0].id}, ${token})`;

      return res.json({
        token: token,
        user: { id: users[0].id, email: users[0].email, name: users[0].name, role: users[0].role },
        account: { id: users[0].account_id, name: users[0].account_name, type: users[0].account_type }
      });
    }

    // ── GOOGLE LOGIN ──
    if (action === 'google' && req.method === 'POST') {
      var { email, name, google_id } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      var cleanEmail = email.toLowerCase().trim();

      // Find existing user
      var existing = await sql`
        SELECT u.id, u.email, u.name, u.account_id, u.role,
               a.name as account_name, a.type as account_type
        FROM users u JOIN accounts a ON a.id = u.account_id
        WHERE u.email = ${cleanEmail}
      `;

      var user;
      var isNewUser = false;
      if (existing.length) {
        user = existing[0];
        // Mark email as verified (Google verified it)
        await sql`UPDATE users SET email_verified = true WHERE id = ${user.id} AND email_verified = false`;
      } else {
        isNewUser = true;
        // Create account + user (email already verified by Google)
        var accounts = await sql`
          INSERT INTO accounts (name, type, plan) VALUES (${name || cleanEmail}, 'solo', 'free') RETURNING id
        `;
        var users = await sql`
          INSERT INTO users (account_id, email, name, role, email_verified)
          VALUES (${accounts[0].id}, ${cleanEmail}, ${name || cleanEmail}, 'owner', true)
          RETURNING id, email, name, role, account_id
        `;
        user = { ...users[0], account_name: name || cleanEmail, account_type: 'solo' };

        // Send welcome email
        var homeLink = req.headers.origin || 'https://deal-forge-tawny.vercel.app';
        await sendAuthEmail(cleanEmail, 'Bienvenue sur deal-forge',
          authEmailLayout(
            '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px;">Bienvenue sur deal-forge, ' + (name || '') + ' !</h2>'
            + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 12px; text-align:justify;">Vous venez de rejoindre deal-forge, la plateforme qui simplifie la relation freelance-client, du cadrage du besoin a la signature du devis.</p>'
            + '<p style="font-size:13px; color:#6b6560; line-height:1.7; margin:0 0 8px; text-align:justify;"><strong>Ce qui vous attend :</strong></p>'
            + '<p style="font-size:13px; color:#6b6560; line-height:1.8; margin:0 0 12px; text-align:justify;">'
            + '&bull; Construisez vos cahiers des charges et devis en quelques clics<br>'
            + '&bull; Partagez et collaborez en temps reel avec vos clients<br>'
            + '&bull; Faites signer vos devis electroniquement, sans quitter l\'outil<br>'
            + '&bull; Generez des PDF professionnels avec certificat de signature</p>'
            + authBtn(homeLink + '/deals/draft', 'Commencer')
            + '<p style="font-size:12px; color:#b1ada1; margin:16px 0 0; text-align:center;">Merci de votre confiance.<br>L\'equipe deal-forge</p>'
          ));
      }

      // Create session
      var token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessions (user_id, token) VALUES (${user.id}, ${token})`;

      return res.json({
        token: token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        account: { id: user.account_id, name: user.account_name, type: user.account_type }
      });
    }

    // ── GITHUB LOGIN ──
    if (action === 'github' && req.method === 'POST') {
      var { code } = req.body;
      if (!code) return res.status(400).json({ error: 'code required' });

      // Exchange code for access token (GitHub requires form-encoded, not JSON)
      var ghClientId = process.env.GITHUB_CLIENT_ID || '';
      var ghClientSecret = process.env.GITHUB_CLIENT_SECRET || '';
      if (!ghClientId || !ghClientSecret) return res.status(500).json({ error: 'GitHub OAuth not configured', has_id: !!ghClientId, has_secret: !!ghClientSecret });
      var formBody = 'client_id=' + encodeURIComponent(ghClientId) + '&client_secret=' + encodeURIComponent(ghClientSecret) + '&code=' + encodeURIComponent(code);
      var tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: formBody
      });
      var tokenData = await tokenRes.json();
      if (!tokenData.access_token) return res.status(400).json({ error: 'GitHub authentication failed', github_error: tokenData.error_description || tokenData.error });

      // Get user profile
      var ghUserRes = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token, 'User-Agent': 'deal-forge' }
      });
      var ghUser = await ghUserRes.json();

      // Get email (may be private)
      var ghEmail = ghUser.email;
      if (!ghEmail) {
        var emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: { 'Authorization': 'Bearer ' + tokenData.access_token, 'User-Agent': 'deal-forge' }
        });
        var emails = await emailsRes.json();
        var primary = emails.find(function(e) { return e.primary; }) || emails[0];
        if (primary) ghEmail = primary.email;
      }
      if (!ghEmail) return res.status(400).json({ error: 'Could not get email from GitHub' });

      var cleanEmail = ghEmail.toLowerCase().trim();
      var ghName = ghUser.name || ghUser.login || cleanEmail;

      // Find or create user (same logic as Google)
      var existing = await sql`
        SELECT u.id, u.email, u.name, u.account_id, u.role,
               a.name as account_name, a.type as account_type
        FROM users u JOIN accounts a ON a.id = u.account_id
        WHERE u.email = ${cleanEmail}
      `;

      var user;
      if (existing.length) {
        user = existing[0];
        await sql`UPDATE users SET email_verified = true WHERE id = ${user.id} AND email_verified = false`;
      } else {
        var accounts = await sql`
          INSERT INTO accounts (name, type, plan) VALUES (${ghName}, 'solo', 'free') RETURNING id
        `;
        var users = await sql`
          INSERT INTO users (account_id, email, name, role, email_verified)
          VALUES (${accounts[0].id}, ${cleanEmail}, ${ghName}, 'owner', true)
          RETURNING id, email, name, role, account_id
        `;
        user = { ...users[0], account_name: ghName, account_type: 'solo' };

        // Send welcome email
        var homeLink = req.headers.origin || 'https://deal-forge-tawny.vercel.app';
        await sendAuthEmail(cleanEmail, 'Bienvenue sur deal-forge',
          authEmailLayout(
            '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px;">Bienvenue sur deal-forge, ' + ghName + ' !</h2>'
            + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 12px; text-align:justify;">Vous venez de rejoindre deal-forge, la plateforme qui simplifie la relation freelance-client, du cadrage du besoin a la signature du devis.</p>'
            + '<p style="font-size:13px; color:#6b6560; line-height:1.7; margin:0 0 8px; text-align:justify;"><strong>Ce qui vous attend :</strong></p>'
            + '<p style="font-size:13px; color:#6b6560; line-height:1.8; margin:0 0 12px; text-align:justify;">'
            + '&bull; Construisez vos cahiers des charges et devis en quelques clics<br>'
            + '&bull; Partagez et collaborez en temps reel avec vos clients<br>'
            + '&bull; Faites signer vos devis electroniquement, sans quitter l\'outil<br>'
            + '&bull; Generez des PDF professionnels avec certificat de signature</p>'
            + authBtn(homeLink + '/deals/draft', 'Commencer')
            + '<p style="font-size:12px; color:#b1ada1; margin:16px 0 0; text-align:center;">Merci de votre confiance.<br>L\'equipe deal-forge</p>'
          ));
      }

      var token = crypto.randomBytes(32).toString('base64url');
      await sql`INSERT INTO sessions (user_id, token) VALUES (${user.id}, ${token})`;

      return res.json({
        token: token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        account: { id: user.account_id, name: user.account_name, type: user.account_type }
      });
    }

    // ── LOGOUT ──
    if (action === 'logout' && req.method === 'POST') {
      var auth = (req.headers.authorization || '').replace('Bearer ', '');
      if (auth) await sql`DELETE FROM sessions WHERE token = ${auth}`;
      return res.json({ ok: true });
    }

    // ── ME (GET + PUT) ──
    if (action === 'me') {
      var auth = (req.headers.authorization || '').replace('Bearer ', '');
      if (!auth) return res.status(401).json({ error: 'Not authenticated' });

      var sessions = await sql`SELECT user_id FROM sessions WHERE token = ${auth} AND expires_at > NOW()`;
      if (!sessions.length) return res.status(401).json({ error: 'Session expired' });
      var userId = sessions[0].user_id;

      if (req.method === 'GET') {
        var rows = await sql`
          SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.email_prefs,
                 a.id as account_id, a.name as account_name, a.type as account_type,
                 a.legal_name, a.siren, a.tva_intra, a.default_tjm, a.default_weekly_cap, a.plan
          FROM users u JOIN accounts a ON a.id = u.account_id WHERE u.id = ${userId}
        `;
        if (!rows.length) return res.status(404).json({ error: 'User not found' });
        var r = rows[0];
        return res.json({
          user: { id: r.id, email: r.email, name: r.name, role: r.role, avatar_url: r.avatar_url, email_prefs: r.email_prefs },
          account: {
            id: r.account_id, name: r.account_name, type: r.account_type,
            legal_name: r.legal_name, siren: r.siren, tva_intra: r.tva_intra,
            default_tjm: r.default_tjm, default_weekly_cap: r.default_weekly_cap, plan: r.plan
          }
        });
      }

      if (req.method === 'PUT') {
        var body = req.body;
        if (body.name !== undefined) await sql`UPDATE users SET name = ${body.name} WHERE id = ${userId}`;
        if (body.email_prefs !== undefined) await sql`UPDATE users SET email_prefs = ${JSON.stringify(body.email_prefs)}::jsonb WHERE id = ${userId}`;
        var user = await sql`SELECT account_id FROM users WHERE id = ${userId}`;
        var accountId = user[0].account_id;
        if (body.account_name !== undefined) await sql`UPDATE accounts SET name = ${body.account_name}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.legal_name !== undefined) await sql`UPDATE accounts SET legal_name = ${body.legal_name}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.siren !== undefined) await sql`UPDATE accounts SET siren = ${body.siren}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.tva_intra !== undefined) await sql`UPDATE accounts SET tva_intra = ${body.tva_intra}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.default_tjm !== undefined) await sql`UPDATE accounts SET default_tjm = ${body.default_tjm}, updated_at = NOW() WHERE id = ${accountId}`;
        if (body.default_weekly_cap !== undefined) await sql`UPDATE accounts SET default_weekly_cap = ${body.default_weekly_cap}, updated_at = NOW() WHERE id = ${accountId}`;
        return res.json({ ok: true });
      }
    }

    // ── FORGOT PASSWORD ──
    if (action === 'forgot' && req.method === 'POST') {
      var { email } = req.body;
      if (!email) return res.status(400).json({ error: 'email required' });
      var users = await sql`SELECT id, email FROM users WHERE email = ${email.toLowerCase().trim()}`;
      if (!users.length) return res.json({ ok: true }); // Don't reveal if email exists
      var resetToken = crypto.randomBytes(32).toString('base64url');
      var expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour
      await sql`UPDATE users SET reset_token = ${resetToken}, reset_expires = ${expires} WHERE id = ${users[0].id}`;
      var resetLink = (req.headers.origin || 'https://deal-forge-tawny.vercel.app') + '/login?reset=' + resetToken;
      await sendAuthEmail(users[0].email, 'Reinitialiser votre mot de passe — deal-forge',
        authEmailLayout(
          '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px;">Mot de passe oublie</h2>'
          + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0; text-align:justify;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Si vous n\'avez pas fait cette demande, ignorez cet email.</p>'
          + authBtn(resetLink, 'Nouveau mot de passe')
          + '<p style="font-size:11px; color:#b1ada1; margin:0; text-align:center;">Ce lien expire dans 1 heure.</p>'
        ));
      return res.json({ ok: true });
    }

    // ── RESET PASSWORD ──
    if (action === 'reset' && req.method === 'POST') {
      var { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ error: 'token and password required' });
      if (password.length < 9) return res.status(400).json({ error: 'Password must be at least 9 characters' });
      var users = await sql`SELECT id FROM users WHERE reset_token = ${token} AND reset_expires > NOW()`;
      if (!users.length) return res.status(400).json({ error: 'Invalid or expired reset link' });
      var newHash = await hashPassword(password);
      await sql`UPDATE users SET password_hash = ${newHash}, reset_token = NULL, reset_expires = NULL WHERE id = ${users[0].id}`;
      return res.json({ ok: true });
    }

    // ── VERIFY EMAIL ──
    if (action === 'verify' && req.method === 'POST') {
      var { token } = req.body;
      if (!token) return res.status(400).json({ error: 'token required' });
      var users = await sql`SELECT id FROM users WHERE verify_token = ${token}`;
      if (!users.length) return res.status(400).json({ error: 'Invalid verification link' });
      await sql`UPDATE users SET email_verified = true, verify_token = NULL WHERE id = ${users[0].id}`;
      return res.json({ ok: true });
    }

    // ── DELETE ACCOUNT ──
    if (action === 'delete' && req.method === 'POST') {
      var auth = (req.headers.authorization || '').replace('Bearer ', '');
      if (!auth) return res.status(401).json({ error: 'Not authenticated' });
      var sessions = await sql`SELECT user_id FROM sessions WHERE token = ${auth} AND expires_at > NOW()`;
      if (!sessions.length) return res.status(401).json({ error: 'Session expired' });
      var userId = sessions[0].user_id;
      var user = await sql`SELECT account_id, email, name FROM users WHERE id = ${userId}`;
      if (!user.length) return res.status(404).json({ error: 'User not found' });
      var accountId = user[0].account_id;
      var deletedEmail = user[0].email;
      var deletedName = user[0].name;
      // Delete in order: sessions, presence, payment_methods, addresses, then user, then account (if no other users)
      await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
      await sql`DELETE FROM presence WHERE user_id = ${userId}`;
      await sql`DELETE FROM payment_methods WHERE account_id = ${accountId}`;
      await sql`DELETE FROM addresses WHERE account_id = ${accountId}`;
      // Nullify project references but don't delete projects shared with others
      await sql`UPDATE projects SET owner_account_id = NULL WHERE owner_account_id = ${accountId}`;
      await sql`UPDATE projects SET freelance_account_id = NULL WHERE freelance_account_id = ${accountId}`;
      await sql`UPDATE projects SET client_account_id = NULL WHERE client_account_id = ${accountId}`;
      await sql`UPDATE comments SET user_id = NULL WHERE user_id = ${userId}`;
      await sql`DELETE FROM users WHERE id = ${userId}`;
      // Delete account if no other users
      var remaining = await sql`SELECT COUNT(*) as c FROM users WHERE account_id = ${accountId}`;
      if (parseInt(remaining[0].c) === 0) await sql`DELETE FROM accounts WHERE id = ${accountId}`;

      // Send confirmation email
      await sendAuthEmail(deletedEmail, 'Votre compte a ete supprime - deal-forge',
        authEmailLayout(
          '<h2 style="font-size:20px; font-weight:700; color:#2d2b35; margin:0 0 16px;">Compte supprime</h2>'
          + '<p style="font-size:14px; color:#4a4850; line-height:1.7; margin:0 0 12px; text-align:justify;">' + deletedName + ', votre compte deal-forge a bien ete supprime. Toutes vos donnees personnelles ont ete effacees conformement au RGPD.</p>'
          + '<p style="font-size:13px; color:#6b6560; line-height:1.7; margin:0; text-align:justify;">Les documents partages avec d\'autres utilisateurs restent accessibles uniquement par ces derniers.</p>'
          + '<p style="font-size:12px; color:#b1ada1; margin:20px 0 0; text-align:center;">Merci d\'avoir utilise deal-forge.<br>L\'equipe deal-forge</p>'
        ));

      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
