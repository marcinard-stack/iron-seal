import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  var sql = neon(process.env.DATABASE_URL);
  var action = req.query.action;

  // ── SEED ACTIONS (merged from seed.js) ──
  if (action === 'dump_messages') {
    var pid = parseInt(req.query.project_id || '4');
    var convs = await sql`SELECT id, current_step, context_json, created_at, updated_at FROM conversations WHERE project_id = ${pid} ORDER BY created_at DESC LIMIT 1`;
    if (!convs.length) return res.json({ project_id: pid, conversation: null, messages: [] });
    var msgs = await sql`SELECT id, role, content, tool_calls_json, created_at FROM chat_messages WHERE conversation_id = ${convs[0].id} ORDER BY created_at ASC`;
    return res.json({ project_id: pid, conversation: convs[0], message_count: msgs.length, messages: msgs });
  }

  if (action === 'list_accounts') {
    var accounts = await sql`SELECT a.id, a.name, u.email, u.account_id, u.email_verified FROM accounts a LEFT JOIN users u ON u.account_id = a.id ORDER BY a.id`;
    return res.json(accounts);
  }

  if (action === 'create_test_project' && req.method === 'POST') {
    var rawName = (req.query.name || req.body && req.body.name || 'lynx-test').toString().trim();
    var slugBase = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lynx-test';
    var slug = slugBase + '-' + Math.random().toString(36).slice(2, 8);
    var ownerAcc = await sql`SELECT a.id FROM accounts a JOIN users u ON u.account_id = a.id ORDER BY a.id LIMIT 1`;
    var ownerId = ownerAcc.length ? ownerAcc[0].id : null;
    var newProj = await sql`
      INSERT INTO projects (slug, title, status, owner_account_id, freelance_account_id)
      VALUES (${slug}, ${rawName}, 'draft', ${ownerId}, ${ownerId})
      RETURNING id, slug, title, status
    `;
    return res.json({ ok: true, project: newProj[0], discovery_url: '/discovery/' + slug, viewer_url: '/deals/draft/' + slug });
  }

  // ── SCHEMA MIGRATION (POST only) ──
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    // ── ACCOUNTS ──
    await sql`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'solo',
        legal_name VARCHAR(500),
        siren VARCHAR(20),
        tva_intra VARCHAR(30),
        default_tjm NUMERIC(10,2),
        default_weekly_cap NUMERIC(5,2),
        plan VARCHAR(50) NOT NULL DEFAULT 'free',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    // ── USERS ──
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
        email VARCHAR(300) NOT NULL UNIQUE,
        name VARCHAR(300) NOT NULL,
        avatar_url TEXT,
        role VARCHAR(50) NOT NULL DEFAULT 'owner',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;

    // ── ADDRESSES ──
    await sql`
      CREATE TABLE IF NOT EXISTS addresses (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        label VARCHAR(100) NOT NULL DEFAULT 'Principal',
        line1 VARCHAR(500),
        line2 VARCHAR(500),
        city VARCHAR(200),
        zip VARCHAR(20),
        country VARCHAR(100) NOT NULL DEFAULT 'France',
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_addresses_account ON addresses(account_id)`;

    // ── PAYMENT METHODS ──
    await sql`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'iban',
        label VARCHAR(200),
        iban_last4 VARCHAR(4),
        last4 VARCHAR(4),
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_payment_methods_account ON payment_methods(account_id)`;
    await sql`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS iban_encrypted TEXT`;
    await sql`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS bic VARCHAR(20)`;

    // ── PROJECTS ──
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(200) NOT NULL UNIQUE,
        title VARCHAR(500) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        owner_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        freelance_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        client_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tjm_override NUMERIC(10,2),
        capacity_override NUMERIC(5,2),
        version VARCHAR(20) DEFAULT '1.0',
        valid_until DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    // Migrate existing projects table: add new columns if missing
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS freelance_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS tjm_override NUMERIC(10,2)`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS capacity_override NUMERIC(5,2)`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS version VARCHAR(20) DEFAULT '1.0'`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS ref_number VARCHAR(20)`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS valid_until DATE`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_account_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_freelance ON projects(freelance_account_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_account_id)`;

    // ── FEATURES ──
    await sql`
      CREATE TABLE IF NOT EXISTS features (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        code VARCHAR(50),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        is_transverse BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id)`;

    // ── JOBS ──
    await sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL,
        jh NUMERIC(6,2) NOT NULL DEFAULT 0,
        type VARCHAR(50) NOT NULL DEFAULT 'new',
        priority VARCHAR(50) NOT NULL DEFAULT 'must',
        is_offered BOOLEAN NOT NULL DEFAULT false,
        included BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_feature ON jobs(feature_id)`;

    // ── PLANNINGS ──
    await sql`
      CREATE TABLE IF NOT EXISTS plannings (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        start_date DATE,
        weekly_capacity_jh NUMERIC(5,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_plannings_project ON plannings(project_id)`;

    // ── PLANNING JOBS (selection) ──
    await sql`
      CREATE TABLE IF NOT EXISTS planning_jobs (
        id SERIAL PRIMARY KEY,
        planning_id INTEGER NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        included BOOLEAN NOT NULL DEFAULT true
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_jobs_unique ON planning_jobs(planning_id, job_id)`;

    // ── PLANNING WEEKS ──
    await sql`
      CREATE TABLE IF NOT EXISTS planning_weeks (
        id SERIAL PRIMARY KEY,
        planning_id INTEGER NOT NULL REFERENCES plannings(id) ON DELETE CASCADE,
        week_number INTEGER NOT NULL,
        label VARCHAR(50),
        date_range VARCHAR(200),
        capacity_jh NUMERIC(5,2),
        milestone VARCHAR(500),
        milestone_date DATE,
        is_mep BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_planning_weeks_planning ON planning_weeks(planning_id)`;

    // ── EXCLUSIONS ──
    await sql`
      CREATE TABLE IF NOT EXISTS exclusions (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_exclusions_project ON exclusions(project_id)`;

    // ── COMMENTS (updated: project_id + guest_id added) ──
    await sql`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        doc_id VARCHAR(200) NOT NULL DEFAULT 'default',
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        x REAL NOT NULL,
        y REAL NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        closed BOOLEAN NOT NULL DEFAULT false,
        guest_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    // Migrate existing comments table
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS guest_id INTEGER`;
    await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(doc_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id)`;

    // ── PROJECT SHARES ──
    await sql`
      CREATE TABLE IF NOT EXISTS project_shares (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        token VARCHAR(100) NOT NULL UNIQUE,
        permission VARCHAR(50) NOT NULL DEFAULT 'view',
        require_email BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMPTZ,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_shares_token ON project_shares(token)`;

    // ── PROJECT GUESTS ──
    await sql`
      CREATE TABLE IF NOT EXISTS project_guests (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        email VARCHAR(300) NOT NULL,
        name VARCHAR(300),
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_project_guests_project ON project_guests(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_project_guests_email ON project_guests(email)`;

    // ── CONVERSATIONS ──
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        current_step VARCHAR(50) NOT NULL DEFAULT 'comprendre',
        context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id)`;

    // ── CHAT MESSAGES ──
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tool_calls_json JSONB,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id)`;

    // ── DEVIS VERSIONS ──
    await sql`
      CREATE TABLE IF NOT EXISTS devis_versions (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version VARCHAR(20) NOT NULL,
        data_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        proposed_at TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL DEFAULT 'proposed'
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_devis_versions_project ON devis_versions(project_id)`;

    // ── DEVIS SIGNATURES ──
    await sql`
      CREATE TABLE IF NOT EXISTS devis_signatures (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        signer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        signer_name VARCHAR(300) NOT NULL,
        signer_email VARCHAR(300) NOT NULL,
        devis_hash VARCHAR(128) NOT NULL,
        ip_address VARCHAR(50),
        city VARCHAR(200),
        signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        pdf_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_signatures_project ON devis_signatures(project_id)`;
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS city VARCHAR(200)`;
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS version_id INTEGER REFERENCES devis_versions(id)`;
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active'`;

    // ── PRESENCE ──
    await sql`
      CREATE TABLE IF NOT EXISTS presence (
        id SERIAL PRIMARY KEY,
        project_slug VARCHAR(200) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        guest_email VARCHAR(300),
        guest_name VARCHAR(300),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_presence_slug ON presence(project_slug)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_unique ON presence(project_slug, COALESCE(user_id, -1), COALESCE(guest_email, ''))`;

    // ── SESSIONS ──
    await sql`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`;

    // Migrate users
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(100)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(100)`;
    // Migrate users: add profile fields
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(200)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(200)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country VARCHAR(5) DEFAULT '+33'`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_choice VARCHAR(50)`;
    // Migrate users: add password_hash + email_prefs
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_prefs JSONB NOT NULL DEFAULT '{"proposal_received":true,"back_to_draft":true,"comment_added":true}'::jsonb`;

    // Migrate accounts: add new fields
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS legal_form VARCHAR(50)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS capital VARCHAR(50)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS rcs_city VARCHAR(100)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EUR'`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS default_vat_rate NUMERIC(5,2) DEFAULT 20.00`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(200) DEFAULT '30 jours'`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS quote_validity INTEGER DEFAULT 30`;

    // ── NEW MIGRATIONS (Sprint 1 — devis refonte) ──

    // Accounts: legal/branding/contact fields
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ape_code VARCHAR(10)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cgv_text TEXT`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cgv_url VARCHAR(500)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS brand_color VARCHAR(10) DEFAULT '#0F172A'`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS logo_url TEXT`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS project_contact_name VARCHAR(200)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS project_contact_email VARCHAR(300)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS project_contact_phone VARCHAR(30)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS project_contact_role VARCHAR(100)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS late_payment_rate_label VARCHAR(200) DEFAULT 'BCE + 10 points'`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS recovery_fee_amount NUMERIC(10,2) DEFAULT 40.00`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS rc_pro_insurer VARCHAR(200)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS rc_pro_policy_number VARCHAR(100)`;
    await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS escompte_text VARCHAR(500) DEFAULT 'Pas d''escompte pour paiement anticipé'`;

    // Projects: preamble, payment schedule, dates
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS preamble TEXT`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_schedule_mode VARCHAR(20) DEFAULT 'on_delivery'`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_schedule_json JSONB`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS kickoff_date DATE`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_date DATE`;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ`;

    // Devis versions: versioning chain
    await sql`ALTER TABLE devis_versions ADD COLUMN IF NOT EXISTS previous_version_id INTEGER REFERENCES devis_versions(id)`;
    await sql`ALTER TABLE devis_versions ADD COLUMN IF NOT EXISTS change_summary TEXT`;

    // Devis signatures: presta signature support
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS signer_role VARCHAR(50) DEFAULT 'client'`;
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS signer_function VARCHAR(200)`;
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS signature_image TEXT`;

    // Exclusions: lot 2 flag
    await sql`ALTER TABLE exclusions ADD COLUMN IF NOT EXISTS reportable_lot2 BOOLEAN NOT NULL DEFAULT false`;

    // ── INVOICES ──
    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        devis_signature_id INTEGER REFERENCES devis_signatures(id),
        invoice_number VARCHAR(30) NOT NULL UNIQUE,
        issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        due_at TIMESTAMPTZ,
        amount_ht NUMERIC(12,2) NOT NULL,
        amount_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
        amount_ttc NUMERIC(12,2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        paid_at TIMESTAMPTZ,
        payment_method VARCHAR(100),
        milestone_label VARCHAR(200),
        data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`;

    // ── INVOICE PAYMENTS ──
    await sql`
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        method VARCHAR(100),
        reference VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id)`;

    // ── SPRINT 6 MIGRATIONS ──

    // FU-19: Byte-stability — PDF blob storage
    await sql`ALTER TABLE devis_signatures ADD COLUMN IF NOT EXISTS pdf_blob BYTEA`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_blob BYTEA`;

    // FU-24: Date de prestation sur facture
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_period_start DATE`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_period_end DATE`;

    // FU-27: Numérotation séquentielle — numéro nullable jusqu'à envoi
    await sql`ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL`;

    // FU-28: Préparation avoirs
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) DEFAULT 'unique'`;
    await sql`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id INTEGER REFERENCES invoices(id)`;

    // FU-45: Snapshot — ensure data_json is large enough (already JSONB, OK)
    // Add account_snapshot to devis_versions
    await sql`ALTER TABLE devis_versions ADD COLUMN IF NOT EXISTS account_snapshot_json JSONB`;

    // Sequence for invoice numbering
    await sql`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1`;

    return res.json({ ok: true, message: 'All tables created successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
