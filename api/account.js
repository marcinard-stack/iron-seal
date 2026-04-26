import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

var ALGO = 'aes-256-gcm';

function encrypt(text) {
  if (!text) return null;
  var key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv(ALGO, key, iv);
  var encrypted = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  var tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

function decrypt(data) {
  if (!data) return null;
  var parts = data.split(':');
  var key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  var iv = Buffer.from(parts[0], 'hex');
  var tag = Buffer.from(parts[1], 'hex');
  var decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(parts[2], 'hex', 'utf8') + decipher.final('utf8');
}

function maskIban(iban) {
  if (!iban || iban.length < 8) return iban;
  return iban.substring(0, 4) + ' **** **** ' + iban.substring(iban.length - 4);
}

async function getAccountId(sql, req) {
  var auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  var sess = await sql`
    SELECT u.account_id FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${auth} AND s.expires_at > NOW()
  `;
  return sess.length ? sess[0].account_id : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var accountId = await getAccountId(sql, req);
  if (!accountId) return res.status(401).json({ error: 'Not authenticated' });

  var entity = req.query.entity; // addresses | payment_methods

  try {
    // ── ADDRESSES ──
    if (entity === 'addresses') {
      if (req.method === 'GET') {
        var rows = await sql`SELECT * FROM addresses WHERE account_id = ${accountId} ORDER BY is_default DESC, id`;
        return res.json(rows);
      }
      if (req.method === 'POST') {
        var { label, line1, line2, city, zip, country, is_default } = req.body;
        if (is_default) await sql`UPDATE addresses SET is_default = false WHERE account_id = ${accountId}`;
        var rows = await sql`
          INSERT INTO addresses (account_id, label, line1, line2, city, zip, country, is_default)
          VALUES (${accountId}, ${label || 'Principal'}, ${line1 || null}, ${line2 || null}, ${city || null}, ${zip || null}, ${country || 'France'}, ${is_default || false})
          RETURNING *
        `;
        return res.status(201).json(rows[0]);
      }
      if (req.method === 'PUT') {
        var { id, label, line1, line2, city, zip, country, is_default } = req.body;
        if (!id) return res.status(400).json({ error: 'id required' });
        if (is_default) await sql`UPDATE addresses SET is_default = false WHERE account_id = ${accountId}`;
        var rows = await sql`
          UPDATE addresses SET
            label = COALESCE(${label ?? null}, label),
            line1 = COALESCE(${line1 ?? null}, line1),
            line2 = COALESCE(${line2 ?? null}, line2),
            city = COALESCE(${city ?? null}, city),
            zip = COALESCE(${zip ?? null}, zip),
            country = COALESCE(${country ?? null}, country),
            is_default = COALESCE(${is_default ?? null}, is_default)
          WHERE id = ${id} AND account_id = ${accountId}
          RETURNING *
        `;
        return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'not found' });
      }
      if (req.method === 'DELETE') {
        var { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id required' });
        await sql`DELETE FROM addresses WHERE id = ${id} AND account_id = ${accountId}`;
        return res.json({ ok: true });
      }
    }

    // ── PAYMENT METHODS (IBAN only, encrypted) ──
    if (entity === 'payment_methods') {
      if (req.method === 'GET') {
        var rows = await sql`SELECT * FROM payment_methods WHERE account_id = ${accountId} ORDER BY is_default DESC, id`;
        return res.json(rows.map(function(r) {
          var iban = r.iban_encrypted ? decrypt(r.iban_encrypted) : null;
          return {
            id: r.id, type: r.type, label: r.label,
            iban_masked: iban ? maskIban(iban) : null,
            iban_last4: r.iban_last4,
            bic: r.bic,
            is_default: r.is_default,
            created_at: r.created_at
          };
        }));
      }
      if (req.method === 'POST') {
        var { label, iban, bic, is_default } = req.body;
        if (!iban) return res.status(400).json({ error: 'iban required' });
        var clean = iban.replace(/\s/g, '').toUpperCase();
        if (is_default) await sql`UPDATE payment_methods SET is_default = false WHERE account_id = ${accountId}`;
        var encrypted = encrypt(clean);
        var last4 = clean.substring(clean.length - 4);
        var rows = await sql`
          INSERT INTO payment_methods (account_id, type, label, iban_encrypted, iban_last4, bic, is_default)
          VALUES (${accountId}, 'iban', ${label || 'Principal'}, ${encrypted}, ${last4}, ${bic || null}, ${is_default || false})
          RETURNING id, type, label, iban_last4, bic, is_default, created_at
        `;
        return res.status(201).json(rows[0]);
      }
      if (req.method === 'DELETE') {
        var { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id required' });
        await sql`DELETE FROM payment_methods WHERE id = ${id} AND account_id = ${accountId}`;
        return res.json({ ok: true });
      }
    }

    // ── ACCOUNT INFO (GET/PUT on account fields) ──
    if (entity === 'info' || !entity) {
      if (req.method === 'GET') {
        var rows = await sql`SELECT * FROM accounts WHERE id = ${accountId}`;
        return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'account not found' });
      }
      if (req.method === 'PUT') {
        var b = req.body;
        await sql`UPDATE accounts SET
          name = COALESCE(${b.name ?? null}, name),
          legal_name = COALESCE(${b.legal_name ?? null}, legal_name),
          siren = COALESCE(${b.siren ?? null}, siren),
          tva_intra = COALESCE(${b.tva_intra ?? null}, tva_intra),
          legal_form = COALESCE(${b.legal_form ?? null}, legal_form),
          capital = COALESCE(${b.capital ?? null}, capital),
          rcs_city = COALESCE(${b.rcs_city ?? null}, rcs_city),
          ape_code = COALESCE(${b.ape_code ?? null}, ape_code),
          phone = COALESCE(${b.phone ?? null}, phone),
          default_tjm = COALESCE(${b.default_tjm ?? null}, default_tjm),
          default_weekly_cap = COALESCE(${b.default_weekly_cap ?? null}, default_weekly_cap),
          currency = COALESCE(${b.currency ?? null}, currency),
          default_vat_rate = COALESCE(${b.default_vat_rate ?? null}, default_vat_rate),
          payment_terms = COALESCE(${b.payment_terms ?? null}, payment_terms),
          quote_validity = COALESCE(${b.quote_validity ?? null}, quote_validity),
          project_contact_name = COALESCE(${b.project_contact_name ?? null}, project_contact_name),
          project_contact_email = COALESCE(${b.project_contact_email ?? null}, project_contact_email),
          project_contact_phone = COALESCE(${b.project_contact_phone ?? null}, project_contact_phone),
          project_contact_role = COALESCE(${b.project_contact_role ?? null}, project_contact_role),
          late_payment_rate_label = COALESCE(${b.late_payment_rate_label ?? null}, late_payment_rate_label),
          recovery_fee_amount = COALESCE(${b.recovery_fee_amount ?? null}, recovery_fee_amount),
          escompte_text = COALESCE(${b.escompte_text ?? null}, escompte_text),
          rc_pro_insurer = COALESCE(${b.rc_pro_insurer ?? null}, rc_pro_insurer),
          rc_pro_policy_number = COALESCE(${b.rc_pro_policy_number ?? null}, rc_pro_policy_number),
          brand_color = COALESCE(${b.brand_color ?? null}, brand_color),
          logo_url = COALESCE(${b.logo_url ?? null}, logo_url),
          cgv_text = COALESCE(${b.cgv_text ?? null}, cgv_text),
          cgv_url = COALESCE(${b.cgv_url ?? null}, cgv_url),
          updated_at = NOW()
        WHERE id = ${accountId}`;
        var updated = await sql`SELECT * FROM accounts WHERE id = ${accountId}`;
        return res.json(updated[0]);
      }
    }

    return res.status(400).json({ error: 'Invalid entity. Use ?entity=addresses|payment_methods|info' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
