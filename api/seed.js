import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const sql = neon(process.env.DATABASE_URL);
  const projectSlug = 'cdc-cockpit-sales-carjager-49c2mq';

  try {
    // Get existing project
    const projects = await sql`SELECT id FROM projects WHERE slug = ${projectSlug}`;
    if (!projects.length) return res.status(404).json({ error: 'Project not found' });
    const projectId = projects[0].id;

    // Check if already seeded
    const existing = await sql`SELECT COUNT(*) as c FROM features WHERE project_id = ${projectId}`;
    if (parseInt(existing[0].c) > 0) return res.json({ ok: true, message: 'Already seeded' });

    // ── FEATURES + JOBS ──
    const features = [
      {
        position: 1, code: 'FEAT 1', title: 'Alerte nouveau lead attribué',
        description: 'Notifier le sales en temps réel quand un nouveau lead lui est attribué, quelle que soit l\'origine.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'Custom Notification Type + Flow notif nouveau lead attribué', jh: 0.25, type: 'new', priority: 'must', is_offered: false, included: true },
        ]
      },
      {
        position: 2, code: 'FEAT 2', title: 'Backlog Tentative de contact',
        description: 'Afficher sur la Home Page les opps au stade "Tentative de contact", priorisées par ancienneté de dernière relance.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'LWC Backlog Cockpit réutilisable + config "Tentative de contact" + champ Date_derniere_relance + flow MAJ', jh: 1.25, type: 'new', priority: 'must', is_offered: false, included: true },
        ]
      },
      {
        position: 3, code: 'FEAT 3', title: 'Backlog Demande de lancement',
        description: 'Afficher sur la Home Page les opps au stade "Demande de lancement", triées par ancienneté.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'Config LWC Backlog "Demande de lancement" (réutilisation)', jh: 0.25, type: 'new', priority: 'must', is_offered: false, included: true },
          { position: 2, description: 'Harmonisation stades achat : ajout stades au Business Process Brokers', jh: 0.25, type: 'refacto', priority: 'nice', is_offered: false, included: false },
        ]
      },
      {
        position: 4, code: 'FEAT 4', title: 'Backlog Intérêts & refonte objet',
        description: 'Faire remonter les intérêts dans la Home Page Sales pour traitement systématique. Deux options proposées.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'Option A — LWC Backlog intérêts basique (stades existants, pas de tri avancé)', jh: 0.50, type: 'new', priority: 'must', is_offered: false, included: true },
          { position: 2, description: 'Option B — Refonte objet : pipeline stades, champs LeadSource/Plateforme/Raison_perte, validation', jh: 0.50, type: 'refacto', priority: 'nice', is_offered: false, included: false },
          { position: 3, description: 'Option B — Quick Actions (Opp + Global) + Flow création account/intérêt (match email, Person Account, sync owner)', jh: 1.00, type: 'new', priority: 'nice', is_offered: false, included: false },
          { position: 4, description: 'Option B — Flows : sync owner, auto-create intérêt counterparty, auto-close, notif, copie origine', jh: 1.00, type: 'new', priority: 'nice', is_offered: false, included: false },
        ]
      },
      {
        position: 5, code: 'FEAT 5', title: 'Backlog Relance après-vente',
        description: 'Rappeler le client à M+1 du closing pour prendre des leads en referral.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'Flow scheduled M+1 + notif native + LWC Backlog relance après-vente', jh: 0.50, type: 'new', priority: 'must', is_offered: false, included: true },
        ]
      },
      {
        position: 6, code: 'FEAT 6', title: 'Backlog RDV fixés',
        description: 'Afficher les RDV planifiés du sales, du plus imminent au plus lointain.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'Champ Date_RDV__c + validation rule + Flow Event SF + LWC Backlog tri date', jh: 0.75, type: 'new', priority: 'must', is_offered: false, included: true },
          { position: 2, description: 'Renommage sous-stades RDV fixé', jh: 0.25, type: 'refacto', priority: 'nice', is_offered: false, included: false },
          { position: 3, description: 'Intégration Google Calendar (Connected App, Apex OAuth, meeting + invite + Meet)', jh: 1.25, type: 'new', priority: 'nice', is_offered: false, included: false },
        ]
      },
      {
        position: 7, code: 'FEAT 7', title: 'KPIs Sales',
        description: 'Indicateurs clés du sales connecté, mois calendaire en cours, temps réel.',
        is_transverse: false,
        jobs: [
          { position: 1, description: 'LWC Scorecard KPIs : non-trash, # ventes, CA HT, marge nette', jh: 0.25, type: 'new', priority: 'must', is_offered: false, included: true },
        ]
      },
      {
        position: 8, code: null, title: 'Transverse — Nettoyage & Home Page',
        description: null,
        is_transverse: true,
        jobs: [
          { position: 1, description: 'Convention nommage + renommage flows + suppression VR/flows obsolètes + suppression Relance 4/5', jh: 0.50, type: 'refacto', priority: 'nice', is_offered: false, included: false },
          { position: 2, description: 'Configuration Lightning Home Page Sales : assemblage composants + assignation profil', jh: 0.25, type: 'new', priority: 'must', is_offered: false, included: true },
        ]
      },
      {
        position: 9, code: null, title: 'Prestations incluses',
        description: null,
        is_transverse: true,
        jobs: [
          { position: 1, description: 'Tests fonctionnels sur Petit Poney (staging)', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
          { position: 2, description: 'Production du cahier de recette', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
          { position: 3, description: 'Validation du cahier de recette avec le client', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
          { position: 4, description: 'Démo de mi-parcours (30 min)', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
          { position: 5, description: 'Démo finale de livrable + recette (1h)', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
          { position: 6, description: 'Déploiement en production (MEP)', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
          { position: 7, description: 'Accompagnement au changement auprès de l\'équipe sales', jh: 0, type: 'new', priority: 'must', is_offered: true, included: true },
        ]
      },
    ];

    for (const feat of features) {
      const fRows = await sql`
        INSERT INTO features (project_id, position, code, title, description, is_transverse)
        VALUES (${projectId}, ${feat.position}, ${feat.code}, ${feat.title}, ${feat.description}, ${feat.is_transverse})
        RETURNING id
      `;
      const featureId = fRows[0].id;

      for (const job of feat.jobs) {
        await sql`
          INSERT INTO jobs (feature_id, position, description, jh, type, priority, is_offered, included)
          VALUES (${featureId}, ${job.position}, ${job.description}, ${job.jh}, ${job.type}, ${job.priority}, ${job.is_offered}, ${job.included})
        `;
      }
    }

    // ── EXCLUSIONS ──
    const exclusions = [
      { position: 1, title: 'Emails Brevo (FEAT 2)', description: 'Le déclenchement d\'emails automatiques Brevo lors d\'une relance sales nécessite un développement backend hors scope' },
      { position: 2, title: 'Ateliers de validation métier (FEAT 3)', description: 'Les ateliers de validation métier et les décisions de chefferie de projet qui en découlent sont à la responsabilité du chef de projet chez CarJager' },
      { position: 3, title: 'Cockpit manager', description: 'Vue consolidée avec analytics sur le traitement sales et filtres par équipe — prévu en lot 2' },
      { position: 4, title: 'Gestion des doublons', description: 'Détection et fusion des leads/intérêts en doublon — sujet identifié, hors scope de ce lot' },
      { position: 5, title: 'App mobile SF', description: 'Les composants seront conçus compatibles mobile, mais le déploiement de l\'app mobile SF est hors scope' },
      { position: 6, title: 'Schéma de données intérêts / backend (FEAT 4)', description: 'Le backend devra être mis à jour pour alimenter les nouveaux champs LeadSource, Plateforme et les UTM lors de la création automatique d\'intérêts depuis le site CarJager' },
    ];

    for (const ex of exclusions) {
      await sql`
        INSERT INTO exclusions (project_id, position, title, description)
        VALUES (${projectId}, ${ex.position}, ${ex.title}, ${ex.description})
      `;
    }

    // ── MIGRATIONS: add missing jobs ──
    // FEAT 2 — Nettoyage sous-stades (position 2)
    const feat2 = await sql`SELECT id FROM features WHERE project_id = ${projectId} AND code = 'FEAT 2'`;
    if (feat2.length) {
      const existing2 = await sql`SELECT id FROM jobs WHERE feature_id = ${feat2[0].id} AND position = 2`;
      if (!existing2.length) {
        await sql`INSERT INTO jobs (feature_id, position, description, jh, type, priority, is_offered, included)
          VALUES (${feat2[0].id}, 2, ${'Nettoyage sous-stades : conservation Relance 1/2/3, suppression Relance 4/5'}, 0.25, 'refacto', 'nice', false, false)`;
      }
    }

    // FEAT 4 — Backlog avancé (position 5)
    const feat4 = await sql`SELECT id FROM features WHERE project_id = ${projectId} AND code = 'FEAT 4'`;
    if (feat4.length) {
      const existing4 = await sql`SELECT id FROM jobs WHERE feature_id = ${feat4[0].id} AND position = 5`;
      if (!existing4.length) {
        await sql`INSERT INTO jobs (feature_id, position, description, jh, type, priority, is_offered, included)
          VALUES (${feat4[0].id}, 5, ${'Backlog avancé : tri par priorité (RDV imminents, Nouveaux, Tentatives par ancienneté)'}, 0.25, 'new', 'nice', false, false)`;
      }
    }

    return res.json({ ok: true, message: 'Seeded features, jobs & exclusions for project ' + projectSlug });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
