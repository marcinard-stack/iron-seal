import { neon } from '@neondatabase/serverless';

function getDb() {
  return neon(process.env.DATABASE_URL);
}

function generateSlug(title) {
  var base = title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  var hash = Math.random().toString(36).substring(2, 8);
  return base + '-' + hash;
}

function generateInvoiceNumber(year, count) {
  return 'FAC-' + year.toString().slice(2) + '-' + (count + 1).toString().padStart(4, '0');
}

async function handleInvoices(req, res, sql, accountId, userId) {
  // GET: list invoices for a project
  if (req.method === 'GET') {
    var projectId = req.query.project_id;
    var slug = req.query.slug;
    if (slug) {
      var p = await sql`SELECT id FROM projects WHERE slug = ${slug}`;
      if (!p.length) return res.status(404).json({ error: 'project not found' });
      projectId = p[0].id;
    }
    if (!projectId) return res.status(400).json({ error: 'project_id or slug required' });
    var invoices = await sql`SELECT * FROM invoices WHERE project_id = ${projectId} ORDER BY created_at DESC`;
    // Attach payments
    for (var i = 0; i < invoices.length; i++) {
      invoices[i].payments = await sql`SELECT * FROM invoice_payments WHERE invoice_id = ${invoices[i].id} ORDER BY paid_at DESC`;
    }
    return res.json(invoices);
  }

  // POST: create invoice from signed devis
  if (req.method === 'POST') {
    var { slug, milestone_label, amount_ht_override, delivery_period_start, delivery_period_end, invoice_type } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug required' });

    var projects = await sql`SELECT * FROM projects WHERE slug = ${slug}`;
    if (!projects.length) return res.status(404).json({ error: 'project not found' });
    var project = projects[0];

    // Must be signed, active, or delivered
    if (!['signed', 'active', 'delivered'].includes(project.status)) {
      return res.status(400).json({ error: 'Project must be signed, active or delivered to generate invoice' });
    }

    // Check presta owns project
    if (accountId && project.freelance_account_id != accountId) {
      return res.status(403).json({ error: 'Only the freelance can create invoices' });
    }

    // Load presta account for TJM + VAT
    var prestaAcc = await sql`SELECT * FROM accounts WHERE id = ${project.freelance_account_id}`;
    var tjm = Number(project.tjm_override || (prestaAcc.length ? prestaAcc[0].default_tjm : 500) || 500);
    var vatRate = Number(prestaAcc.length ? prestaAcc[0].default_vat_rate : 20);
    var payTerms = prestaAcc.length ? prestaAcc[0].payment_terms : '30 jours';

    // Calculate amounts from included jobs
    var features = await sql`SELECT id FROM features WHERE project_id = ${project.id}`;
    var totalJh = 0;
    if (features.length) {
      var jobsAgg = await sql`SELECT COALESCE(SUM(jh), 0)::float as total FROM jobs WHERE feature_id IN (SELECT id FROM features WHERE project_id = ${project.id}) AND included = true AND is_offered = false`;
      totalJh = jobsAgg[0].total;
    }

    var fullAmountHt = totalJh * tjm;

    // For solde invoices, deduct already invoiced amounts (non-cancelled)
    var amountHt = amount_ht_override ? Number(amount_ht_override) : fullAmountHt;
    if (!amount_ht_override && (invoice_type === 'solde' || (!invoice_type && project.status === 'delivered'))) {
      var alreadyInvoiced = await sql`SELECT COALESCE(SUM(amount_ht), 0)::float as total FROM invoices WHERE project_id = ${project.id} AND status != 'cancelled' AND invoice_type != 'credit_note'`;
      var invoicedHt = alreadyInvoiced[0].total;
      amountHt = Math.max(0, fullAmountHt - invoicedHt);
    }

    var amountTva = amountHt * vatRate / 100;
    var amountTtc = amountHt + amountTva;

    // Due date from payment terms
    var daysMatch = (payTerms || '30').match(/(\d+)/);
    var dueDays = daysMatch ? parseInt(daysMatch[1]) : 30;
    var dueAt = new Date(Date.now() + dueDays * 86400000).toISOString();

    // Get latest signature ID
    var latestSig = await sql`SELECT id FROM devis_signatures WHERE project_id = ${project.id} AND status = 'active' AND signer_role = 'client' ORDER BY signed_at DESC LIMIT 1`;
    var sigId = latestSig.length ? latestSig[0].id : null;

    // Default invoice_type based on project status
    if (!invoice_type) {
      if (project.status === 'signed') invoice_type = 'acompte';
      else if (project.status === 'active') invoice_type = 'jalon';
      else if (project.status === 'delivered') invoice_type = 'solde';
      else invoice_type = 'jalon';
    }

    // Smart milestone label based on invoice_type if not provided
    if (!milestone_label) {
      if (invoice_type === 'acompte') milestone_label = 'Acompte';
      else if (invoice_type === 'solde') milestone_label = 'Solde';
    }

    // Snapshot data
    var dataJson = { tjm: tjm, vat_rate: vatRate, total_jh: totalJh, project_title: project.title, ref_number: project.ref_number };

    var rows = await sql`
      INSERT INTO invoices (project_id, devis_signature_id, invoice_number, due_at, amount_ht, amount_tva, amount_ttc, milestone_label, data_json, status, delivery_period_start, delivery_period_end, invoice_type)
      VALUES (${project.id}, ${sigId}, ${null}, ${dueAt}, ${amountHt}, ${amountTva}, ${amountTtc}, ${milestone_label || null}, ${JSON.stringify(dataJson)}::jsonb, 'draft', ${delivery_period_start || null}, ${delivery_period_end || null}, ${invoice_type})
      RETURNING *
    `;
    return res.status(201).json(rows[0]);
  }

  // PUT: update invoice status or record payment
  if (req.method === 'PUT') {
    var { id, status, payment_amount, payment_method, payment_reference } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    // Record payment
    if (payment_amount) {
      await sql`INSERT INTO invoice_payments (invoice_id, amount, method, reference) VALUES (${id}, ${payment_amount}, ${payment_method || 'virement'}, ${payment_reference || null})`;
      // Check if fully paid
      var inv = await sql`SELECT amount_ttc FROM invoices WHERE id = ${id}`;
      var payments = await sql`SELECT COALESCE(SUM(amount), 0)::float as total FROM invoice_payments WHERE invoice_id = ${id}`;
      var newStatus = payments[0].total >= Number(inv[0].amount_ttc) ? 'paid' : 'paid_partial';
      await sql`UPDATE invoices SET status = ${newStatus}, paid_at = ${newStatus === 'paid' ? new Date().toISOString() : null}, updated_at = NOW() WHERE id = ${id}`;

      // Auto-complete project only if delivered AND all invoices paid
      var invProject = await sql`SELECT project_id FROM invoices WHERE id = ${id}`;
      if (invProject.length) {
        var proj = await sql`SELECT status FROM projects WHERE id = ${invProject[0].project_id}`;
        if (proj.length && proj[0].status === 'delivered') {
          var unpaid = await sql`SELECT COUNT(*)::int as cnt FROM invoices WHERE project_id = ${invProject[0].project_id} AND status NOT IN ('paid', 'cancelled')`;
          if (unpaid[0].cnt === 0) {
            await sql`UPDATE projects SET status = 'completed', updated_at = NOW() WHERE id = ${invProject[0].project_id}`;
          }
        }
      }

      return res.json({ ok: true, status: newStatus });
    }

    // Update status
    if (status) {
      // Assign invoice_number when transitioning to 'sent'
      if (status === 'sent') {
        var currentInv = await sql`SELECT invoice_number FROM invoices WHERE id = ${id}`;
        if (currentInv.length && !currentInv[0].invoice_number) {
          var seqRes = await sql`SELECT nextval('invoice_number_seq') as num`;
          var seqNum = parseInt(seqRes[0].num);
          var yr = new Date().getFullYear().toString().slice(2);
          var newInvNumber = 'FAC-' + yr + '-' + seqNum.toString().padStart(4, '0');
          await sql`UPDATE invoices SET invoice_number = ${newInvNumber}, status = ${status}, updated_at = NOW() WHERE id = ${id}`;
          return res.json({ ok: true, invoice_number: newInvNumber });
        }
      }
      await sql`UPDATE invoices SET status = ${status}, updated_at = NOW() WHERE id = ${id}`;
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'status or payment_amount required' });
  }

  // DELETE: only allow deletion of draft invoices
  if (req.method === 'DELETE') {
    var { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    var delInv = await sql`SELECT status FROM invoices WHERE id = ${id}`;
    if (!delInv.length) return res.status(404).json({ error: 'invoice not found' });
    if (delInv[0].status !== 'draft') {
      return res.status(400).json({ error: 'Seules les factures en brouillon peuvent être supprimées' });
    }
    await sql`DELETE FROM invoices WHERE id = ${id}`;
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}

export default async function handler(req, res) {
  var sql = getDb();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Resolve session → account_id + user_id if auth header present
    var accountId = null;
    var userId = null;
    var authToken = (req.headers.authorization || '').replace('Bearer ', '');
    if (authToken) {
      var sess = await sql`
        SELECT u.account_id, u.id as user_id FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ${authToken} AND s.expires_at > NOW()
      `;
      if (sess.length) { accountId = sess[0].account_id; userId = sess[0].user_id; }
    }

    // ── INVOICES (entity=invoices) ──
    if (req.query.entity === 'invoices') {
      return handleInvoices(req, res, sql, accountId, userId);
    }

    if (req.method === 'GET') {
      var status = req.query.status;
      var slug = req.query.slug;
      if (slug) {
        var rows = await sql`SELECT * FROM projects WHERE slug = ${slug} LIMIT 1`;
        return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'not found' });
      }
      // Filter by account if authenticated
      if (accountId && status) {
        var rows = await sql`SELECT * FROM projects WHERE status = ${status} AND (owner_account_id = ${accountId} OR freelance_account_id = ${accountId} OR client_account_id = ${accountId}) ORDER BY updated_at DESC`;
        return res.json(rows);
      }
      if (accountId) {
        var rows = await sql`SELECT * FROM projects WHERE owner_account_id = ${accountId} OR freelance_account_id = ${accountId} OR client_account_id = ${accountId} ORDER BY updated_at DESC`;
        return res.json(rows);
      }
      if (status) {
        var rows = await sql`SELECT * FROM projects WHERE status = ${status} ORDER BY updated_at DESC`;
        return res.json(rows);
      }
      var rows = await sql`SELECT * FROM projects ORDER BY updated_at DESC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      var { title } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      var slug = generateSlug(title);
      var rows = await sql`
        INSERT INTO projects (slug, title, status, owner_account_id, freelance_account_id)
        VALUES (${slug}, ${title}, 'draft', ${accountId}, ${accountId})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'PUT') {
      var { slug, title, status, owner_account_id, freelance_account_id, client_account_id, clear_client, preamble, kickoff_date, delivery_date, payment_schedule_mode, payment_schedule_json } = req.body;
      if (!slug) return res.status(400).json({ error: 'slug required' });
      if (clear_client) {
        await sql`UPDATE projects SET client_account_id = NULL, updated_at = NOW() WHERE slug = ${slug}`;
      }
      var rows = await sql`
        UPDATE projects
        SET title = COALESCE(${title ?? null}, title),
            status = COALESCE(${status ?? null}, status),
            owner_account_id = COALESCE(${owner_account_id ?? null}, owner_account_id),
            freelance_account_id = COALESCE(${freelance_account_id ?? null}, freelance_account_id),
            client_account_id = COALESCE(${client_account_id ?? null}, client_account_id),
            preamble = COALESCE(${preamble ?? null}, preamble),
            kickoff_date = COALESCE(${kickoff_date ?? null}, kickoff_date),
            delivery_date = COALESCE(${delivery_date ?? null}, delivery_date),
            payment_schedule_mode = COALESCE(${payment_schedule_mode ?? null}, payment_schedule_mode),
            payment_schedule_json = COALESCE(${payment_schedule_json ? JSON.stringify(payment_schedule_json) : null}::jsonb, payment_schedule_json),
            updated_at = NOW()
        WHERE slug = ${slug}
        RETURNING *
      `;
      return rows.length ? res.json(rows[0]) : res.status(404).json({ error: 'not found' });
    }

    if (req.method === 'DELETE') {
      var { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql`DELETE FROM projects WHERE id = ${id}`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
