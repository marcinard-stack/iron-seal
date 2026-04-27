# Note de livraison — Sprints 5 à 9

> **Date** : 27 avril 2026
> **Exécutant** : Claude Code (Opus 4.6)
> **Commanditaire** : Marc Inard — CDC `2026-04-26-devis-followup.md`
> **Périmètre** : Sprints 5 à 9 du brief follow-up (bugs visibles → différenciateurs)
> **Référentiels** : CDC initial `2026-04-25-devis-refonte.md` + livraison S1-4 `2026-04-26-livraison-sprint1-4.md`

---

## 0. Arbitrages pris avec Marc

| Question | Décision | Sprint |
|----------|----------|--------|
| FU-3 Logo : endpoint dédié ou base64 dans Puppeteer ? | **Diagnostique d'abord** → base64 fonctionne, pas d'endpoint | S5 |
| FU-11 Settings feedback : états visuels seuls ou tout (bouton test + aperçu) ? | **Tout maintenant** | S5 |
| FU-19 Byte-stability : bytea PostgreSQL ou Vercel Blob ? | **bytea PostgreSQL** (simple, 50Mo max Neon OK) | S6 |
| FU-14 Échéancier : 3 modes complets ou simplifié ? | **Manuel** — le flow acompte→jalon→solde fonctionne déjà | S7 |
| FU-31 Dashboard facturation : dans dashboard.html ou page dédiée ? | **Page dédiée /billing** | S7 |
| FU-29 Suggestion IA préambule | **Reporté** — pas prioritaire | S8 |
| FU-30 Preview PDF : panneau latéral iframe ou bouton nouvel onglet ? | **Bouton nouvel onglet** (simple, déjà fonctionnel) | S8 |
| Harmonisation typographique | **7 niveaux** (22/16/11/9.5/8.5/7.5/7pt) au lieu de 17 | S8 |
| FU-32 Relances cron + FU-43 Push desktop | **Reportés en backlog** — sprints dédiés | S9 |
| Auto-complete projet : quand ? | **Delivered + tout payé** uniquement | S6 fix |
| Projet completed : nouvelles factures ? | **Bloqué** | S6 fix |

---

## 1. SPRINT 5 — Bugs visibles & demandes Marc

### Réalisé

**FU-1 — Footer paginé toutes pages**
- Implémenté via `displayHeaderFooter` natif Puppeteer avec `footerTemplate` HTML.
- Format : `[Réf document] — [Titre projet] | Page X / N | [Raison sociale]`
- Marge bottom augmentée à 28mm pour accommoder le footer.
- Appliqué sur les templates devis ET facture.

**FU-2 — Anti-coupure blocs critiques**
- CSS `page-break-inside: avoid` sur : `.total-block`, `.conditions`, `.signature-block`, `.identity`, `.pay-block`, `.feat-group`.
- CSS `page-break-after: avoid` sur `tr.feat-row` et `.annexe-title`.
- Appliqué dans les deux templates.

**FU-3 — Logo prestataire**
- Le base64 SVG/PNG dans `<img src="data:...">` fonctionne nativement dans Puppeteer (`setContent`).
- Pas besoin d'endpoint dédié — économise un slot serverless.
- Dimensions explicites `height:14mm; width:auto; max-width:50mm; object-fit:contain` pour les SVG sans attributs width/height intrinsèques.
- Logo affiché dans les headers statiques (preview HTML) et dans le `headerTemplate` Puppeteer (toutes pages PDF).
- **Recoloration SVG** : fonction `recolorSvgLogo()` décode le SVG base64, remplace tous les `fill` par la `brand_color` du compte, ré-encode. Appliqué au header Puppeteer, au template devis et au template facture.

**FU-4 — CGV rendues dans le PDF**
- Si `accounts.cgv_text` renseigné : annexe D "Conditions Générales de Vente" insérée après l'annexe C (hors scope), avant le certificat de signature. Rendu avec `white-space: pre-line`.
- Si `accounts.cgv_url` renseigné : ligne dédiée dans le bloc Conditions de paiement : "CGV — Consultables sur [URL cliquable]".
- Si les deux renseignés : annexe + mention URL.
- Émission bloquée si aucun des deux n'est renseigné (wizard S4).

**FU-5 — Pictos inclus/non retenu**
- Remplacé les caractères Unicode ✓/○ par des SVG inline 12×12 :
  - Inclus : checkmark vert + texte "Inclus"
  - Non retenu : cercle gris + texte "Non retenu"
- Doublage systématique couleur + texte (accessibilité).

**FU-6 — Signature image client dans le PDF**
- Branchement de `signature_image` (base64 PNG du canvas) côté client dans le template.
- Fallback pour signatures legacy (pré-migration, sans canvas) : nom en italique 9.5pt gris.

**FU-7 — IBAN en page signature devis**
- Bloc `.iban-reminder` ajouté avant le bloc signatures bilatéral : "Mode de règlement : Virement bancaire | IBAN : FR76 ... · BIC : ..."
- IBAN formaté (groupes de 4), déchiffré côté serveur.

**FU-9 — Heure sur le certificat**
- Nouveau helper `fmtDateTime()` → "26 avril 2026 à 14:32".
- Utilisé dans les lignes signature presta et client du certificat.

**FU-11 — Settings feedback complet**
- **États visuels** : badges `.field-status` (vert "Détecté" / orange "Manquant") sur 5 sections : Branding (logo), Informations légales, Coordonnées bancaires, CGV, Adresse.
- **Bouton "Tester avec un devis fictif"** : ouvre la preview HTML du projet test dans un nouvel onglet.
- **Aperçu live des blocs PDF** : section en bas des Settings rendant en HTML les blocs Identité + Conditions + Signatures à partir des données compte. Mis à jour après chaque save.
- Upload logo avec feedback : badge "Envoi..." → "Détecté" ou "Erreur".

**FU-13** — Absorbé par FU-4.

### Bugs fixés en cours de sprint

- **Logo invisible** : les SVG sans `width`/`height` explicites ne se dimensionnaient pas. Fix : `height` explicite + `display:block` + flex container.
- **En-tête sur toutes les pages** : migré de headers HTML statiques (page 1 + annexes) vers `headerTemplate` Puppeteer natif (logo + ref sur toutes les pages). Les headers statiques sont masqués en `@media print`.
- **Double header facture** : le `@media print { .page-header { display: none; } }` n'était ajouté que dans le template devis. Corrigé pour la facture aussi.
- **CGV URL invisible** : elle était bien dans le HTML mais peu visible dans le bloc conditions. Confirmé fonctionnel après test.

---

## 2. SPRINT 6 — Robustesse contractuelle

### Réalisé

**FU-19 — Byte-stability du PDF signé**
- À la contre-signature client, le PDF est généré une fois et stocké en `devis_signatures.pdf_blob` (bytea PostgreSQL).
- À l'envoi d'une facture, le PDF est stocké en `invoices.pdf_blob`.
- L'URL `?version=signed` sert le blob figé byte-for-byte, jamais une régénération.
- Si aucun blob n'existe (devis pré-migration), fall-through vers la régénération.

**FU-45 — Snapshot données compte à l'émission**
- Au moment de la pré-signature presta (`signer_role='presta'`), un snapshot JSON complet est construit :
  - Compte presta : tous les champs accounts + adresse
  - Compte client : idem
- Stocké dans `devis_versions.account_snapshot_json` (JSONB).
- Permet de reconstruire un PDF historiquement fidèle même si les données compte changent.

**FU-24 — Date de prestation sur la facture**
- Nouveaux champs `invoices.delivery_period_start` et `delivery_period_end` (DATE).
- Rendu dans le PDF : "Prestation délivrée du JJ/MM/AAAA au JJ/MM/AAAA" sous le titre.
- Accepté dans la création de facture via API.

**FU-25 — Référence signature dans la facture**
- Ligne sous le titre : "Réf. devis : BDC260403 · signé le 26/04/2026".
- Récupère `devis_signatures.signed_at` via `invoice.devis_signature_id`.

**FU-26 — Mention jalon intelligente**
- Adapté selon `invoice_type` :
  - `acompte` → "Facture d'acompte"
  - `jalon` → "Jalon : [label personnalisé]"
  - `solde` → "Facture de solde"
  - `unique` → rien (pas de mention redondante)
- Type par défaut déduit du statut projet : signed→acompte, active→jalon, delivered→solde.
- Label automatique : "Acompte" si type acompte, "Solde" si type solde.

**FU-27 — Numérotation séquentielle sans rupture**
- `invoice_number` est nullable en création (draft = pas de numéro).
- Numéro attribué uniquement au passage `draft → sent` via `SELECT nextval('invoice_number_seq')`.
- Format : `FAC-AA-NNNN` (année 2 chiffres + séquence 4 chiffres).
- Suppression interdite si statut `sent` ou supérieur (API retourne erreur).
- Séquence PostgreSQL `invoice_number_seq` créée en migration.

**FU-28 — Préparation structurelle des avoirs**
- Nouveau champ `invoices.invoice_type` : `acompte` | `jalon` | `solde` | `unique` | `credit_note`.
- Nouveau champ `invoices.parent_invoice_id` (FK vers invoices).
- Pas d'UI ni de rendu PDF pour les avoirs — juste le schéma prêt.

**FU-12 — Wizard de complétion étoffé**
- Ajout de warnings non-bloquants pour :
  - Logo manquant : "Logo non renseigné (recommandé pour un devis professionnel)"
  - IBAN manquant : "IBAN non renseigné (sera obligatoire pour la facturation)"
- CGV reste bloquant (dans la liste `missing` existante).
- Les warnings sont affichés dans un confirm dialog avec bouton "Continuer" qui ouvre la modal signature.

**FU-20 — UI historique des versions**
- Dropdown `<select>` dans le viewer pour le presta sur les projets signés avec >1 version.
- Chaque option : numéro de version, date, statut (signée/proposée/brouillon).
- Utilise le `data.versions` déjà retourné par `/api/signature`.

### Bugs fixés en cours de sprint

- **IBAN wizard** : le check utilisait `iban_encrypted` (non exposé par l'API pour sécurité). Corrigé vers `iban_last4`.
- **Facture send : numéro null dans le PDF et la PJ** : le séquencement était mauvais (PDF généré avant attribution du numéro). Corrigé : 1) PUT sent (attribue FAC-XX-NNNN) → 2) re-fetch facture → 3) re-générer PDF avec le bon numéro → 4) envoyer mail.
- **Auto-complete prématuré** : le paiement d'un acompte déclenchait le passage en `completed`. Corrigé : le projet ne passe en `completed` que si `status === 'delivered'` ET toutes les factures sont payées.
- **Facture de solde = montant total** au lieu du reste à payer. Corrigé : le solde déduit maintenant les montants HT déjà facturés (hors annulées).
- **UI affichait "null"** pour les factures sans numéro. Corrigé : affiche "Brouillon".
- **Micro-animations** ajoutées sur les boutons facture : "Attribution n°..." → "Génération PDF..." → "Envoyé ✓" (vert) / "Enregistrement..." → "Payée ✓".

---

## 3. SPRINT 7 — Échéancier & facturation enrichie

### Réalisé

**FU-14 — Toggle échéancier simplifié**
- Deux modes : "Facture unique à la livraison" (défaut) / "Acompte + solde".
- UI dans le viewer : boutons toggle + champ % acompte (défaut 30%) + calcul live du montant.
- Stockage : `projects.payment_schedule_mode` + `projects.payment_schedule_json`.
- Rendu dans le PDF devis : tableau "Échéancier de paiement" sous les conditions, avec lignes Acompte / Solde / Total en HT et TTC.
- L'éditeur de jalons réordonnables (mode "Jalonné" à 3 modes) a été reporté — le flow manuel acompte→jalon→solde est jugé suffisant.

**FU-15 — Acompte dans le planning**
- Si `payment_schedule_mode === 'deposit_balance'`, ligne surlignée "Facture d'acompte (XX%)" après le kick-off dans l'annexe B planning.

**FU-16 — Checkbox "Reportable lot 2"**
- Checkbox "Lot 2" par exclusion dans le viewer (presta en mode draft).
- Pour les non-presta : mention "(lot 2 envisagé)" si cochée.
- API features PUT étendue pour accepter `exclusion_id` + `reportable_lot2`.
- Le rendu PDF existant (texte conditionnel dans l'annexe C) fonctionnait déjà.

**FU-26-bis — Modal facture enrichie**
- **Pré-remplissage** : si `deposit_balance` et projet signed → montant pré-rempli avec le % acompte × total HT. Hint affiché.
- **Validation anti-doublon solde** : si une facture de solde non-annulée existe déjà, le bouton est bloqué avec message d'erreur.
- **Récap facturation visuel** : bloc avec Total devis / Déjà facturé / Reste à facturer + barre de progression verte. Mis à jour quand `loadInvoices()` s'exécute.

**FU-31 — Page /billing**
- Nouvelle page `public/billing.html` avec rewrite Vercel `/billing → /billing.html`.
- 4 KPIs : Total facturé YTD, Total encaissé YTD, Reste à encaisser, Factures en retard.
- Tableau de toutes les factures avec colonnes : N°, Projet, Client, Type, Montant TTC, Statut, Échéance, Actions.
- Filtres par statut (Toutes / En attente / Payées / En retard).
- Alerte rouge si facture > 30 jours après échéance.
- API enrichie : `?entity=invoices&all=1` retourne toutes les factures du compte authentifié (join invoices → projects, filtre sur freelance_account_id).

---

## 4. SPRINT 8 — Polish UX

### Réalisé

**Harmonisation typographique — 7 niveaux**
- Réduit de 17 tailles différentes à 7 niveaux strictement appliqués :

| Niveau | Taille | Usage |
|--------|--------|-------|
| Display | 22pt | Titre projet, Total TTC valeur, "À payer" montant |
| H2 | 16pt | Titres annexes, certificat |
| H3 | 11pt | Identity name, conditions h3, total labels, "À payer" h3 |
| Body | 9.5pt | Tout texte courant, tableaux, conditions, IBAN, CGV, planning |
| Caption | 8.5pt | Th headers, méta, identity detail, ref-label, annexe-label, doc-type |
| Small | 7.5pt | Cert hash/legal, sig mention/meta, footer, planning note |
| Micro | 7pt | Pills badges uniquement |

- Élimine les tailles isolées 8pt, 9pt, 10pt, 12pt, 14pt, 28pt.
- Appliqué sur les deux templates (devis + facture).

**FU-8 — Planning format homogène**
- S0 affiche une date range (début — fin) au lieu d'une date isolée.
- Kick-off intégré dans S0 : "S0 — Définition du besoin · Kick-off [date]".
- Surlignage uniquement sur la ligne MEP (mise en production), plus le kick-off.

**FU-17 — Légende badges**
- Bandeau discret sous le titre Annexe A : "NEW · nouveau développement — REFACTO · refonte de l'existant — MUST · essentiel — NICE · optionnel".

**FU-18 — Note pour options non retenues**
- Détection automatique : si un job non retenu commence par "Option [A-Z]", une note italique est ajoutée :
  "Option B — chiffrée à 1,50 J/H, non retenue dans le présent devis. Réintégrable par avenant."

**FU-30 — Bouton Prévisualiser**
- Bouton icône œil dans la topbar du viewer (à côté du bouton téléchargement).
- Ouvre `?format=html` dans un nouvel onglet.
- Le panneau latéral iframe a été abandonné au profit de cette approche simple.

**FU-33 — Formats nombres espace fine insécable**
- `fmtEur()` utilise `\u202F` (narrow no-break space) avant le symbole €.
- `Intl.NumberFormat('fr-FR')` pour le séparateur de milliers et la virgule décimale.

**FU-34/35 — Prestations offertes clarifiées**
- Titre changé : "Prestations incluses sans frais" (au lieu de "Prestations offertes").
- Colonne J/H ajoutée pour chaque prestation offerte (si > 0).
- Ligne récap en bas : "Soit X,XX J/H offertes — équivalent Y € HT au TJM appliqué".
- Effet de valorisation commerciale.

**FU-36/37 — Watermarks**
- CSS `.watermark` : texte diagonal 80pt, opacity 6%, rotation -30°.
- Devis en `draft` → filigrane "BROUILLON".
- Facture `cancelled` → filigrane "ANNULÉ".
- Facture `draft` → filigrane "BROUILLON".

**FU-38 — Densité annexe A**
- Padding global `td` réduit de 7pt à 5pt.
- Padding-top `tr.feat-row` réduit de 12pt à 9pt.
- Résultat : annexe A plus compacte (~20% de lignes en plus par page).

### Non fait

**FU-29 — Suggestion IA préambule** : reporté (décision Marc — pas prioritaire).

---

## 5. SPRINT 9 — Différenciateurs

### Réalisé

**FU-21 — Page de garde optionnelle**
- Page 0 ajoutée au devis quand `projects.use_cover_page = true` :
  - Logo grand format (80mm max).
  - "DEVIS" en display 40pt, couleur accent.
  - Titre projet en 28pt.
  - Version, date émission, date validité en caption.
  - Identité presta/client en bas, sobre.
- CSS `page-break-after: always` pour forcer le saut de page.
- Toggle checkbox dans le viewer pour le presta en mode draft.
- Sauvegardé via PUT `/api/projects` (champ `use_cover_page`).
- Migration DB : `projects.use_cover_page` (BOOLEAN, défaut false) + `projects.cover_image_url` (TEXT, pour usage futur).

**FU-22 — Liens cliquables dans le PDF**
- **SIREN** : wrappé dans `<a href="https://www.pappers.fr/entreprise/SIREN">` (espaces supprimées de l'URL). Appliqué dans les deux templates (devis + facture) + mentions légales facture.
- **Emails** : déjà en `mailto:` (confirmé).
- **CGV URL** : déjà cliquable (confirmé).
- **IBAN** : note ajoutée "(à reporter dans votre app bancaire)" dans le bloc "À payer" de la facture.
- Puppeteer rend nativement les `<a href>` en liens PDF cliquables.

**FU-44 — Score de complétude du compte**
- Barre de progression en haut de la page Settings.
- Pondération : legal_name (10%), siren (10%), tva_intra (10%), rcs_city (5%), capital (5%), address (10%), iban (15%), cgv (15%), logo (10%), brand_color (5%), project_contact (5%) = 100%.
- Vérification adresse et IBAN via fetch API (async).
- Affiche les champs manquants en hints sous la barre.
- "Votre compte est complet !" en vert quand 100%.
- Mis à jour au chargement et après chaque save.

**FU-41 — Page post-signature enrichie**
- Overlay success enrichi après signature client :
  - Titre projet + nom signataire + date.
  - "Prochaines étapes" : date de kickoff (si renseignée), contact projet.
  - Bouton "Télécharger le PDF signé" → `/api/pdf?slug=X`.
  - Bouton "Ajouter au calendrier" → génère un fichier .ics téléchargeable (événement "Kickoff [titre]" à la date kickoff, organisateur = email presta).
  - Section contact presta : nom, email, téléphone.

**FU-42 — Export CSV comptable**
- Bouton "Exporter CSV" dans la page /billing.
- Génération côté client (Blob + URL.createObjectURL).
- Format : CSV délimité par `;`, BOM UTF-8 (compatibilité Excel France).
- Colonnes : Numéro, Date émission, Client, Projet, HT, TVA, TTC, Statut, Date paiement.
- Nom fichier : `factures-YYYY.csv`.

**FU-23 — Tests snapshot**
- 5 PDFs générés avec succès en fin de sprint :
  1. Devis draft (watermark BROUILLON) — 8 pages
  2. Devis avec page de garde — 8+ pages
  3. Devis original signé (pas de watermark) — 8 pages
  4. HTML preview — 200 OK
  5. Settings / Billing — 200 OK

### Reporté en backlog

| Item | Raison |
|---|---|
| **FU-32** Relances automatiques impayés | Gros morceau autonome : cron Vercel quotidien, 3 paliers d'email (J+1, J+15, J+30), templates personnalisables, toggle par facture et par compte. Mérite un sprint dédié avec tests poussés (timing cron, idempotence, edge cases). |
| **FU-43** Notifications push desktop | Gros morceau autonome : Service Worker, lib `web-push`, VAPID keys, table `push_subscriptions` en DB, demande de permission, toggle granulaire dans Settings. Dépendance HTTPS + domaine vérifié. |

---

## 6. Fichiers modifiés (Sprints 5-9)

| Fichier | Sprints | Type de changement |
|---------|---------|-------------------|
| `api/pdf.js` | S5-S9 | Template devis enrichi (footer, logo, CGV, pictos, signatures, IBAN, cover page, liens, watermarks, typo harmonisée). Template facture enrichi (date prestation, réf signature, mention jalon, watermarks, liens). Header/footer Puppeteer. Byte-stability (frozen blob). Recoloration SVG. |
| `api/setup.js` | S6, S9 | Migrations : pdf_blob, delivery_period, invoice_type, parent_invoice_id, account_snapshot_json, invoice_number_seq, use_cover_page, cover_image_url |
| `api/projects.js` | S6, S7 | Numérotation séquentielle, auto-complete conditionnel (delivered + tout payé), suppression draft only, solde déduit acomptes, type par défaut, ?all=1 pour billing |
| `api/signature.js` | S6 | Snapshot account à la pré-signature presta |
| `api/features.js` | S7 | PUT exclusion reportable_lot2, GET exclusions avec le flag |
| `api/account.js` | S5 | Entity `?entity=info` GET/PUT pour tous les champs account |
| `api/auth.js` | S5 | Nouveaux champs account dans GET + PUT (ape, contact, pénalités, RC Pro, branding, CGV) |
| `public/viewer.html` | S5-S9 | Boutons PDF (preview + download), modal signature presta, préambule éditable, modal facture enrichie (récap, anti-doublon, micro-animations), workflow projet (active/delivered), toggle échéancier, checkbox lot 2, toggle cover page, wizard enrichi, version history dropdown, post-signature enrichi |
| `public/settings.html` | S5, S9 | Sections contact projet, pénalités, branding (logo + couleur), CGV. États visuels (badges). Aperçu blocs PDF. Bouton test PDF. Score complétude pondéré. |
| `public/billing.html` | S7, S9 | Nouvelle page : KPIs, tableau factures filtrable, export CSV |
| `vercel.json` | S7 | Rewrite `/billing → /billing.html` |

---

## 7. Migrations DB appliquées (Sprints 5-9)

Toutes les migrations sont `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` / `CREATE SEQUENCE IF NOT EXISTS` → backward-compatible.

### Sprint 6
- `devis_signatures.pdf_blob` BYTEA — PDF figé à la signature
- `invoices.pdf_blob` BYTEA — PDF figé à l'envoi
- `invoices.delivery_period_start` DATE
- `invoices.delivery_period_end` DATE
- `invoices.invoice_type` VARCHAR(20) DEFAULT 'unique'
- `invoices.parent_invoice_id` INTEGER FK invoices
- `invoices.invoice_number` → ALTER DROP NOT NULL (nullable pour drafts)
- `devis_versions.account_snapshot_json` JSONB
- `invoice_number_seq` SEQUENCE

### Sprint 9
- `projects.use_cover_page` BOOLEAN DEFAULT false
- `projects.cover_image_url` TEXT

---

## 8. Logique métier implémentée

### Workflow projet
```
draft → proposed → signed → active → delivered → completed
```
- `draft → proposed` : presta signe (F3) puis envoie au client
- `proposed → signed` : client contre-signe
- `signed → active` : presta clique "Démarrer le projet"
- `active → delivered` : presta clique "Marquer comme livré"
- `delivered → completed` : automatique quand TOUTES les factures sont payées
- Retour `proposed → draft` : demande de modifs client ou retrait presta

### Workflow facture
```
draft → sent → paid / paid_partial / overdue / cancelled
```
- Numéro `FAC-AA-NNNN` attribué uniquement au passage `draft → sent`
- PDF figé en bytea au passage `sent`
- Paiement : détection auto paid vs paid_partial
- Suppression : uniquement les drafts

### Types de facture par statut projet
| Statut projet | Type suggéré | Types autorisés |
|---|---|---|
| signed | Acompte | Acompte, Solde |
| active | Jalon | Jalon, Solde |
| delivered | Solde | Solde |
| completed | — | Bloqué |

### Calcul du solde
- Montant HT solde = Total HT devis − Σ montants HT déjà facturés (hors annulées/avoirs)
- Auto-complete : seulement si `project.status === 'delivered'` ET aucune facture non-payée/non-annulée

---

## 9. URLs de test

- **Devis draft** : `https://iron-seal.vercel.app/deals/draft/cdc-cockpit-sales-carjager-test-5b70d0`
- **Devis signé (original)** : `https://iron-seal.vercel.app/deals/signed/cdc-cockpit-sales-carjager-49c2mq`
- **PDF devis** : `https://iron-seal.vercel.app/api/pdf?slug=cdc-cockpit-sales-carjager-test-5b70d0`
- **PDF preview HTML** : `https://iron-seal.vercel.app/api/pdf?slug=cdc-cockpit-sales-carjager-test-5b70d0&format=html`
- **Settings** : `https://iron-seal.vercel.app/settings`
- **Billing** : `https://iron-seal.vercel.app/billing`

---

## 10. Backlog restant

| Item | Priorité | Complexité | Notes |
|---|---|---|---|
| FU-32 Relances cron impayés | P2 | Haute | Cron Vercel + 3 paliers email + toggle. Sprint dédié. |
| FU-43 Push desktop | P2 | Haute | Service Worker + web-push + VAPID + DB. Sprint dédié. |
| FU-29 Suggestion IA préambule | P2 | Moyenne | Appel Claude Haiku via ANTHROPIC_API_KEY. Reporté par Marc. |
| FU-10 GeoIP snapshot signature | P2 | Faible | Résoudre ville depuis IP une seule fois, stocker dans city. Partiellement fait (city stocké, mais re-résolution possible). |
| FU-30 Preview panneau latéral | P2 | Haute | Refactor layout viewer en 2 colonnes. Remplacé par bouton nouvel onglet. |
| Éditeur jalons réordonnables | P2 | Haute | Mode "Jalonné" 3 modes avec drag & drop. Le flow manuel suffit. |
| Page de garde : image/illustration | P3 | Faible | Champ `cover_image_url` prêt en DB, pas d'UI. |
| Tests CI automatisés | P2 | Moyenne | `pdf-diff` ou screenshots Puppeteer dans une GitHub Action. |
| Byte-stability backfill legacy | P1 | Faible | Les devis signés avant la migration n'ont pas de `pdf_blob`. À la première lecture, générer + figer. Non implémenté (fall-through vers régénération). |
