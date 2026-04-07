import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const sql = neon(process.env.DATABASE_URL);

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

    // Migrate users: add password_hash + email_prefs
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_prefs JSONB NOT NULL DEFAULT '{"proposal_received":true,"back_to_draft":true,"comment_added":true}'::jsonb`;

    return res.json({ ok: true, message: 'All tables created successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
