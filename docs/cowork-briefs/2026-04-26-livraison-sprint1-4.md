# Note de livraison — Refonte devis & introduction facture

> **Date** : 26 avril 2026
> **Exécutant** : Claude Code (Opus 4.6)
> **Commanditaire** : Marc Inard — CDC `2026-04-25-devis-refonte.md`
> **Périmètre** : Sprints 1 à 4 du CDC §0-§10

---

## 0. Contexte d'exécution

Le projet Iron Seal (anciennement deal-forge) générait des PDFs côté client via jsPDF. Un audit a identifié des lacunes majeures en conformité légale B2B française, des bugs de rendu (accents cassés, dates en dur, descriptions tronquées) et un déficit esthétique.

Cette session a couvert :
- La migration du nom de domaine deal-forge → iron-seal (Vercel, GitHub, code)
- La refonte complète du moteur PDF
- L'introduction de la facturation
- L'enrichissement de la configuration compte

---

## 1. Arbitrages pris avec Marc

| Question | Décision | Justification |
|----------|----------|---------------|
| Moteur PDF | **Puppeteer serveur** (`@sparticuz/chromium`) | Unicode natif, CSS print, hash serveur stable. Cold start ~3-5s acceptable. |
| Palette d'accent | **Bleu nuit `#0F172A`** | Choix de Marc — sobre, corporate, configurable par compte ensuite. |
| Badges Type/Prio en page 1 | **Annexe CDC uniquement** | Tableau prix page 1 épuré pour le décideur. Badges visibles dans l'annexe A. |
| Limite 12 fonctions Vercel Hobby | **Fusion seed.js → setup.js** | Libère un slot pour api/pdf.js sans coût supplémentaire. |
| Hash signature bilatérale | **Hash unique avant signatures** | Calculé sur le contenu (features/jobs/totaux). Les deux signatures réfèrent le même hash. Plus simple et robuste. |
| Logo storage | **Base64 en DB** (accounts.logo_url) | Simple, pas de dépendance externe. Limité à ~500Ko, suffisant pour un logo. |
| IBAN dans le PDF | **Complet, déchiffré côté serveur** | Document contractuel — le client doit pouvoir payer. Déchiffrement via ENCRYPTION_KEY dans api/pdf.js. |

---

## 2. Sprint 1 — Conformité légale + moteur PDF

### Réalisé

**Migration DB** (`api/setup.js`) :
- 20+ nouvelles colonnes sur `accounts` : ape_code, phone, cgv_text, cgv_url, brand_color, logo_url, project_contact_*, late_payment_rate_label, recovery_fee_amount, rc_pro_*, escompte_text
- Nouvelles colonnes sur `projects` : preamble, payment_schedule_mode, payment_schedule_json, kickoff_date, delivery_date, issued_at
- Nouvelles colonnes sur `devis_versions` : previous_version_id, change_summary
- Nouvelles colonnes sur `devis_signatures` : signer_role, signer_function, signature_image
- Nouvelle colonne sur `exclusions` : reportable_lot2
- Nouvelles tables : `invoices`, `invoice_payments`
- Toutes les migrations sont `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` → backward-compatible

**Fusion seed.js → setup.js** :
- Les anciennes fonctions seed (dump_messages, list_accounts, create_test_project) sont accessibles via `?action=XXX` sur `/api/setup`
- Le fichier `seed.js` a été supprimé pour libérer un slot serverless

**Moteur PDF** (`api/pdf.js`) :
- Dépendances : `@sparticuz/chromium` + `puppeteer-core`
- Template HTML/CSS complet embarqué dans le fichier
- Police Inter via Google Fonts import dans le HTML
- Génération côté serveur, retour Buffer binaire via `res.end(buf)`
- Preview HTML disponible via `?format=html`

**Template devis — page 1** :
- En-tête : logo presta (ou nom typographié) + référence DEV-XX-NNNN
- Bloc identité : PRESTATAIRE / CLIENT en deux colonnes, toutes mentions légales (forme juridique, capital, SIREN, APE, TVA, RCS, adresse, contact)
- Titre : "DEVIS N° DEV-XX-NNNN" en accent color, titre projet 22pt, méta (version, date émission, validité)
- Tableau prix : épuré (description + J/H + montant HT), groupé par feature, sans badges
- Prestations offertes : section séparée avec pills "Offert"
- Bloc total : encadré 55% droite, Total HT / TVA / Total TTC (22pt accent)
- Note TJM : "Taux journalier appliqué : 500 € HT — X J/H × 500 € = Y € HT"
- Conditions de paiement : grille label/valeur (délai, pénalités, indemnité, escompte, mode, IBAN, BIC)
- Bloc signature bilatéral : "Pour le prestataire" / "Pour le client" avec mention "Bon pour accord"

**Annexe A — CDC** :
- Récap scope : "X jobs retenus sur Y proposés — Z J/H facturés sur W J/H estimés"
- Tableau complet avec badges Type/Prio (NEW/REFACTO, MUST/NICE)
- Statut inclus/non retenu avec picto (✓ / ○)

**Annexe B — Planning** :
- Tableau 3 colonnes : Semaine / Période / Livrables
- Dates dynamiques calculées à partir de `kickoff_date` ou `issued_at` + 7 jours
- Capacité configurable (depuis `capacity_override` ou `default_weekly_cap`)
- Jalons automatiques : démo mi-parcours, démo finale, MEP

**Annexe C — Hors scope** :
- Liste structurée avec flag "lot 2" si `reportable_lot2 = true`

**Certificat de signature** :
- Affiché uniquement si au moins une signature existe
- Bloc presta + bloc client avec nom, email, date, IP, ville
- Hash SHA-256 en monospace
- Mention portée du hash (§F4)
- Mention RGPD (§A7)

### Fix collatéral

- **`api/features.js` crashait en production** : le driver Neon HTTP ne supporte pas `ANY(${array})`. Remplacé par `WHERE feature_id IN (SELECT id FROM features WHERE project_id = X)` dans features.js et notify.js.
- **URLs `ironseal.vercel.app` (sans tiret)** pointaient vers un projet tiers. Corrigé dans auth.js, notify.js, signature.js → `iron-seal.vercel.app`.

---

## 3. Sprint 2 — Intégration viewer + signature presta

### Réalisé

**Bouton PDF dans la topbar** :
- Icône téléchargement dans `viewer.html`, visible pour le presta
- Ouvre `/api/pdf?slug=X` dans un nouvel onglet

**Modal signature presta (F3)** :
- Nouvelle modal dans viewer.html : nom, fonction, canvas signature tactile, mention "Bon pour accord"
- Canvas avec support souris + touch
- Sauvegarde via `/api/signature` avec `signer_role='presta'` et `signature_image` (base64 PNG)
- L'API signature a été modifiée : le presta peut signer en statut `draft`, le client en `proposed`

**Flow revu** :
1. Presta clique "Proposer le devis"
2. → Modal signature presta s'ouvre
3. → Signature enregistrée en DB
4. → Envoi au client (notify API + changement statut → proposed)
5. Client contre-signe → PDF final envoyé par mail aux deux parties

**Envoi mail post-signature** :
- `doGeneratePDF()` appelle `/api/pdf?slug=X&notify=1`
- Le serveur génère le PDF, l'encode en base64, l'envoie via Resend en PJ aux deux parties
- Template email avec badge "Document signé", infos signataire, hash

**Bandeau versioning (H2)** :
- Affiché dans le PDF si `previous_version` existe : "Version X.Y — remplace la version Z du JJ/MM"

**Préambule éditable (B4)** :
- Textarea visible pour le presta en mode draft
- Sauvegardé dans `projects.preamble` via API PUT
- Rendu dans le PDF sous le titre projet

---

## 4. Sprint 3 — Facture + workflow projet

### Réalisé

**API Invoices** (`/api/projects?entity=invoices`) :
- GET : liste factures par projet (avec payments attachés)
- POST : création depuis devis signé — numérotation auto `FAC-AA-NNNN`, calcul montants HT/TVA/TTC depuis les jobs inclus, date échéance calculée depuis payment_terms
- PUT : mise à jour statut, enregistrement paiement avec détection auto paid/paid_partial
- Auto-complete : quand toutes les factures d'un projet sont `paid`, le projet passe en `completed`

**Template PDF facture** (`api/pdf.js`, `?type=invoice&invoice_id=X`) :
- Même design system que le devis
- En-tête identique
- Bloc identité ÉMETTEUR / CLIENT
- Titre "FACTURE N° FAC-XX-NNNN" + référence devis + jalon si applicable
- Tableau lignes identique au devis
- Bloc total identique
- **Bloc "À payer"** : fond accent color, montant TTC en 28pt, date échéance, IBAN/BIC, référence virement
- Conditions de paiement + mentions légales en pied

**Envoi facture par mail** :
- `?notify=1` sur le PDF facture → génère PDF, envoie au client et au presta via Resend
- Passe automatiquement la facture en statut `sent`

**Boutons workflow projet** (viewer.html) :
- `signed` → "Démarrer le projet" + "Générer une facture"
- `active` → "Marquer comme livré" + "Générer une facture"
- `delivered` → "Générer une facture"
- `completed` → message "toutes factures réglées"

**Modal facture** :
- Champ jalon optionnel, montant HT override optionnel
- Liste des factures existantes avec statut visuel (pills colorées)
- Actions inline : "Envoyer" (draft→sent), "Marquer payée", lien PDF

---

## 5. Sprint 4 — Configuration compte + polish

### Réalisé

**Page Settings enrichie** (`settings.html`) :
- Section "Contact projet" : nom, fonction, email, téléphone
- Section "Pénalités et mentions légales" : pénalités retard, indemnité recouvrement, escompte, RC Pro (assureur + n° police)
- Section "Branding" : upload logo (base64, max 500Ko), color picker accent avec sync hex
- Section "CGV" : URL + texte libre
- Champs APE et téléphone entreprise ajoutés dans la section légale

**API account enrichie** (`api/account.js`) :
- Nouveau entity `?entity=info` : GET/PUT sur tous les champs account
- L'API auth PUT (`?action=me`) accepte aussi tous les nouveaux champs

**IBAN déchiffré dans le PDF** :
- Fonctions `decryptIban()` et `formatIban()` dans api/pdf.js
- Utilise `ENCRYPTION_KEY` de l'environnement Vercel
- IBAN affiché formaté (groupes de 4) dans les PDFs devis et facture

**Wizard de complétion (H3)** :
- Avant l'émission d'un devis, vérifie : raison sociale, forme juridique, SIREN, TVA, RCS, CGV, adresse
- Si incomplet : popup listant les champs manquants + redirection vers Settings
- Non bloquant sur les champs optionnels (APE, RC Pro, contact projet)

**Tests snapshot PDF** :
- 3 PDFs générés avec succès :
  - Devis simple : 507 Ko, 8 pages
  - Devis signé (original) : 497 Ko, 8 pages
  - Facture : 248 Ko, 3 pages

---

## 6. Ce qui a été laissé de côté ou exécuté partiellement

### Non implémenté (conformément au §12 — hors scope)

- Avoirs / factures rectificatives
- Multi-devises (€ uniquement)
- Multi-langues (français uniquement)
- Signature électronique avancée eIDAS
- Horodatage qualifié RFC 3161
- KYC signataire
- Intégration comptable (FEC, e-invoicing)
- Relances automatiques de paiement
- Page mentions légales / RGPD de l'app

### Implémenté partiellement ou différemment du CDC

| Item CDC | État | Commentaire |
|----------|------|-------------|
| **A6 — CGV en annexe PDF** | Partiel | Les CGV sont stockables (texte ou URL) et vérifiées avant émission, mais **pas encore concaténées en annexe du PDF**. Le PDF mentionne "CGV disponibles sur [URL]" si l'URL est renseignée. La concaténation d'un texte long ou d'un PDF uploadé en annexe nécessite un travail supplémentaire sur la pagination. |
| **A8 — Échéancier jalons** | Partiel | Le champ `payment_schedule_mode` et `payment_schedule_json` existent en DB, la facture supporte le `milestone_label`, mais **il n'y a pas d'UI d'édition d'échéancier** dans le viewer. Le presta peut créer des factures de jalon manuellement. |
| **B5 — Légende badges** | Non fait | La recommandation du CDC (légende discrète sous le tableau ou en pied) n'a pas été ajoutée dans l'annexe A. Facile à ajouter. |
| **C4 — Options non retenues explicitées** | Non fait | La note "Option B — chiffrée à X J/H, non retenue" n'est pas générée automatiquement dans l'annexe. Les options apparaissent comme "○ Non retenu" sans note spécifique. |
| **D3 — Jalons de paiement sur le planning** | Non fait | Les jalons de l'échéancier ne sont pas projetés sur le planning. Lié à l'absence d'UI échéancier. |
| **E3 — Reformulation renvois lot 2** | Partiel | Le flag `reportable_lot2` existe et le texte "(envisagé en lot ultérieur, sous réserve d'un chiffrage séparé)" est ajouté dans le PDF, mais **le champ n'est pas éditable dans l'UI** (pas de checkbox dans le viewer pour le presta). |
| **F3 — Signature presta dans le PDF** | Partiel | La signature presta est stockée en DB avec image, mais **l'image du canvas n'est pas encore rendue dans le PDF** (le bloc signature affiche le nom et la date, pas le paraphe dessiné). À brancher. |
| **G6 — Logo presta** | Partiel | Le logo est uploadable et stocké en base64, mais **le rendu dans le PDF utilise une balise `<img src>` avec le base64** qui peut ne pas charger correctement dans Puppeteer selon la taille. À tester avec un vrai logo. |
| **G7 — Footer paginé** | Non fait | Le footer fixe avec "DEV-26-0403 · Titre · Page X / N" est dans le CSS (`.page-footer`) mais **n'est pas injecté dynamiquement dans le HTML**. Puppeteer supporte les headers/footers natifs mais avec des limitations CSS. |
| **H1 — Byte-stability** | Non garanti | Le PDF est généré à la demande par Puppeteer. Deux appels successifs peuvent produire des PDFs légèrement différents (métadonnées internes, timestamps). Pour une vraie byte-stability, il faudrait archiver le PDF en blob à la signature et toujours servir cette copie. |
| **H2 — Lien versions antérieures (UI)** | Non fait | Le bandeau version existe dans le PDF, mais le lien côté UI presta vers les versions antérieures n'a pas été ajouté dans le viewer. |
| **§6.5 — Page de garde** | Non fait | La page de garde optionnelle (logo grand format, titre display 40pt) n'a pas été implémentée. Le toggle existe conceptuellement mais pas dans l'UI Settings ni dans le template PDF. |
| **§6.7 — Micro-interactions PDF** | Non fait | Liens cliquables SIREN, copie IBAN, sommaire. Non implémenté. |
| **§8.1 — Preview live** | Partiel | La preview est disponible via `?format=html` mais **pas intégrée dans le viewer** comme panneau latéral. Le presta doit ouvrir l'URL manuellement ou cliquer le bouton PDF. |
| **§9.2 — Toggle page de garde / white-label** | Non fait | Les toggles ne sont pas dans la page Settings. |
| **§10 — Tests N&B / Lighthouse** | Non fait | Les tests snapshot ont validé la génération, mais pas le rendu en noir et blanc ni l'accessibilité. |

### Choix techniques notables

1. **Pas de `package.json` type:module** : Vercel compile automatiquement les ESM → CommonJS. Les fichiers utilisent `import/export` mais sont transpilés. J'ai évité les arrow functions et le destructuring dans features.js après un crash de compilation.

2. **Limite 12 fonctions Hobby** : la fusion seed→setup et l'intégration invoices dans projects.js via entity routing permet de rester dans la limite. Si d'autres endpoints sont nécessaires, il faudra soit fusionner davantage soit passer en Pro.

3. **IBAN chiffré** : la clé de chiffrement est dans les env vars Vercel (`ENCRYPTION_KEY`). Le déchiffrement côté serveur dans pdf.js fonctionne, mais si la clé change, les anciens IBANs ne seront plus lisibles.

---

## 7. Fichiers modifiés

| Fichier | Type de changement |
|---------|-------------------|
| `api/pdf.js` | **Nouveau** — Moteur PDF Puppeteer + templates devis/facture |
| `api/setup.js` | Migration DB enrichie + fusion seed.js |
| `api/seed.js` | **Supprimé** (fusionné dans setup.js) |
| `api/features.js` | Fix crash `ANY()` → sous-requête |
| `api/notify.js` | Fix crash `ANY()` + fix URLs iron-seal |
| `api/signature.js` | Support signature presta (signer_role, signature_image) |
| `api/auth.js` | Fix URLs + nouveaux champs account dans GET/PUT |
| `api/account.js` | Nouveau entity `?entity=info` pour GET/PUT account |
| `api/projects.js` | Invoices CRUD via `?entity=invoices` + champs PUT enrichis |
| `public/viewer.html` | Bouton PDF, modal signature presta, préambule, invoice modal, workflow buttons, wizard complétion |
| `public/settings.html` | Sections contact projet, pénalités, branding, CGV |
| `package.json` | Dépendances `@sparticuz/chromium` + `puppeteer-core` |

---

## 8. URLs de test

- **Devis PDF** : `https://iron-seal.vercel.app/api/pdf?slug=cdc-cockpit-sales-carjager-test-5b70d0`
- **Devis HTML preview** : `https://iron-seal.vercel.app/api/pdf?slug=cdc-cockpit-sales-carjager-test-5b70d0&format=html`
- **Facture PDF** : `https://iron-seal.vercel.app/api/pdf?type=invoice&invoice_id=4`
- **Settings** : `https://iron-seal.vercel.app/settings`
- **Viewer (devis test)** : `https://iron-seal.vercel.app/deals/signed/cdc-cockpit-sales-carjager-test-5b70d0`
- **Viewer (devis officiel)** : `https://iron-seal.vercel.app/deals/signed/cdc-cockpit-sales-carjager-49c2mq`
