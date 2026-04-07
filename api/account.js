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

    return res.status(400).json({ error: 'Invalid entity. Use ?entity=addresses|payment_methods' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
