# Refonte du devis & introduction de la facture — CDC

> **Statut** : brief Cowork → Claude Code, validé par Marc le 25 avril 2026.
> **Source** : audit critique du PDF `devis-signe-cdc-cockpit-sales-carjager-test-5b70d0.pdf` (BDC260403).
> **Périmètre** : refonte du PDF de devis (lecture client + valeur juridique + esthétique), introduction d'un PDF de facture dérivé, évolutions modèle de données et parcours de saisie nécessaires.

---

## 0. Brief méta pour Claude Code

**Tu as carte blanche** sur :
- L'implémentation technique (refonte du moteur PDF si pertinent, choix de stack, architecture).
- Les évolutions de schéma DB (ajouter colonnes, tables, migrations).
- L'évolution du parcours utilisateur (UI d'édition presta, modal de signature, écran de prévisualisation, configuration de compte).
- Les choix de design (palette exacte, micro-interactions, composants), tant qu'ils respectent les principes fixés en §6.

**Garde-fous** :
1. Avant tout changement structurant majeur (refonte moteur PDF, suppression de table existante, modification du parcours de signature), poste un plan court (5-10 lignes) et attends mon arbitrage.
2. Pour tout trade-off non trivial, propose 2 options avec recommandation argumentée.
3. Les données déjà en base doivent rester accessibles (devis signés ne peuvent pas perdre leur PDF / hash / certificat). Les migrations doivent être backward-compatible.
4. La signature électronique signée actuellement (art. 1367, hash SHA-256, IP, horodatage) garde sa valeur — on ne casse pas la chaîne probante.
5. Le PDF est la "version de vérité" : ce qui est signé est ce qui est archivé. Si on bouge vers une génération serveur, la même URL doit toujours rendre le même PDF byte-for-byte.

**Méthodologie suggérée** :
- Sprint 1 : conformité légale + bugs visibles (chantiers §3.A, §3.B, §3.D, §3.G + accents/dates).
- Sprint 2 : refonte visuelle complète + composants (§6).
- Sprint 3 : facture (§7) + parcours d'édition presta (§8).
- Sprint 4 : configuration de compte (§9) + polish (§10).

---

## 1. Contexte

Iron Seal génère aujourd'hui un PDF côté client via jsPDF (`public/viewer.html`, fonction `generateSignedPDF`, lignes ~2436-2678). La structure est en place :

- 4 pages (devis + cahier des charges + planning/hors scope + certificat de signature électronique).
- Modèle de données solide (`api/setup.js` : `accounts`, `addresses`, `projects`, `features`, `jobs`, `devis_versions`, `devis_signatures`).
- Champs déjà présents en base mais non rendus dans le PDF : `payment_terms`, `quote_validity`, `default_vat_rate`, `tva_intra`, `siren`.
- Signature électronique simple conforme à l'article 1367 du Code civil : hash SHA-256 du document, IP, horodatage, signataire identifié.

Un audit a identifié des trous majeurs en conformité légale (devis B2B), de gros défauts de lisibilité (descriptions tronquées), des bugs visibles (dates planning, accents cassés) et un déficit de finition esthétique. L'objectif de cette refonte est d'atteindre un niveau visuel et juridique comparable aux meilleurs SaaS (Stripe Invoice, Linear, Pennylane).

---

## 2. Objectifs

1. **Conformité juridique B2B française irréprochable** sur le devis et sur la facture.
2. **Lisibilité parfaite** du PDF : aucune information n'est tronquée, le total est immédiatement visible, le périmètre est sans ambiguïté.
3. **Esthétique de niveau premium** : typographie, espaces, hiérarchie, palette — l'objet doit valoriser le prestataire qui l'envoie.
4. **Cohérence devis ↔ facture** : même système visuel, même composants, génération à partir des mêmes briques.
5. **Robustesse** : ce qui est signé est archivé tel quel et reste reconstructible.

---

## 3. Chantiers issus de l'audit (référencés)

> Numérotation conservée depuis l'audit Cowork pour traçabilité. F2 et F5 retirés.

### A. Conformité légale française

**A1. Identifier explicitement le document comme un devis.**
- Bandeau ou en-tête : `DEVIS N° DEV-AAMMNN` (ex. `DEV-26-0403`).
- Renommer le préfixe `BDC` (bon de commande) en `DEV` (devis). Garder une compatibilité pour les anciennes références.
- Le mot "DEVIS" doit apparaître au moins une fois en première page, en visuel de premier niveau.

**A2. Mentions obligatoires du prestataire (SAS).**
À afficher dans le bloc PRESTATAIRE :
- Raison sociale, forme juridique, capital social.
- SIREN / SIRET.
- N° TVA intracommunautaire.
- RCS + ville d'immatriculation.
- Code APE/NAF.
- Adresse complète.
- Email + téléphone du contact projet.
- (Optionnel mais recommandé) RC Pro : assureur + n° de police.

**A3. Conditions de paiement (article L441-9 du Code de commerce).**
- Délai de règlement explicite (`accounts.payment_terms`, défaut 30 jours).
- Taux de pénalités de retard : taux BCE + 10 points (paramétrable, valeur par défaut affichée).
- Indemnité forfaitaire de recouvrement : 40 €.
- Mode de règlement (virement, chèque) + RIB.
- Acompte si applicable (cf. A8).

**A4. Durée de validité du devis.**
- Mention "Devis valable jusqu'au JJ/MM/AAAA" sur la première page, sous le numéro.
- Calcul à partir de `accounts.quote_validity` (défaut 30 jours, calé sur la date d'émission).
- Surlignage si la date approche (UI presta, pas dans le PDF).

**A5. Mention "Bon pour accord".**
- Au-dessus de la zone de signature : "Bon pour accord, valable engagement contractuel".
- Mention rendue manuscrite dans le PDF signé (rendu en script ou positionnée à côté du paraphe).

**A6. Conditions générales de vente.**
- Champ CGV au niveau `accounts` : soit texte riche, soit upload PDF.
- Concaténation automatique en annexe finale du devis (avant ou après le certificat de signature, à arbitrer pour ne pas casser le hash).
- Si pas de CGV uploadées : mention de renvoi vers une URL de CGV configurée au niveau du compte (champ `cgv_url`).
- Bloquer l'émission si ni texte CGV ni URL CGV ni PDF CGV n'est configuré.

**A7. RGPD et capture d'IP.**
- Au pied du certificat de signature, ajouter : "L'adresse IP du signataire est collectée à des fins probatoires (article 1367 du Code civil) et conservée 10 ans. Données traitées par [Raison sociale Iron Seal] en qualité de sous-traitant. Droits d'accès, rectification, suppression sur demande à [contact]."
- Page mentions légales / politique RGPD à prévoir au niveau de l'app (hors scope PDF mais à lister).

**A8. Modalités de règlement.**
- Bloc dédié sur la dernière page du devis (avant signature) :
  - Conditions de paiement (cf. A3).
  - Échéancier si applicable (acompte X% à la signature, solde à la livraison ; ou par jalon ; ou full au livrable final).
  - RIB du prestataire (IBAN + BIC) — champ au niveau compte.
- Échéancier paramétrable au niveau du devis (3 modes : full upfront, full delivery, échéancier custom). Par défaut : à définir avec le presta.

### B. Lisibilité du tableau de prix

**B1. Descriptions complètes — jamais de troncature.**
- Le tableau doit s'adapter en hauteur de ligne (wrap multi-ligne) et non couper avec "…".
- Si la description est très longue (> 200 caractères), garder les 200 premiers caractères dans le tableau et déplier le reste dans l'annexe A. Mais pas de troncature silencieuse en page 1.
- Préférer une description claire et concise dans le job ; encourager via UI (compteur de caractères, suggestion d'éclatement si trop long).

**B2. Hiérarchie visuelle du total.**
- Bloc total dans un encadré full-width sous le tableau.
- Total TTC en très grand (≥ 18pt), accent color, gras.
- HT et TVA en taille moyenne, alignement vertical sur le total.
- Espace généreux autour du bloc total.

**B3. TJM et calcul rendus visibles.**
- Sous le bloc total, ligne explicite : "Taux journalier appliqué : 500 € HT — 4,00 J/H × 500 € = 2 000 € HT".
- Italique ou couleur secondaire, mais lisible.

**B4. Préambule / objet du devis.**
- Bloc texte de 3-6 lignes au-dessus du tableau, sous le titre du projet.
- Champ libre côté presta, avec template par défaut suggéré par l'UI ("Suite à nos échanges du JJ/MM, voici la proposition couvrant…").
- Permet de poser le contexte commercial.

**B5. Légende des badges Type / Prio.**
- Petite légende discrète sous le tableau ou en pied de page : "NEW = nouveau développement, REFACTO = refonte de l'existant, MUST = essentiel, NICE = optionnel".
- Alternative : afficher Type/Prio uniquement dans l'annexe CDC, pas dans le tableau de prix qui doit être maximalement lisible pour le décideur. À arbitrer (Claude Code fait une recommandation argumentée).

### C. Annexe A — Cahier des charges

**C1. Code couleur "inclus / non retenu" doublé d'un signe.**
- Picto ou symbole : ✓ pour inclus, – ou ○ pour non retenu.
- Préfixe textuel possible : "[Inclus]" / "[Non retenu]".
- La couleur reste un renfort, pas l'unique signal.

**C2. Fiabiliser la règle d'inclusion.**
- Vérifier le rendu : tout job dont `included = true` doit être marqué visuellement comme inclus, sans exception.
- Test à automatiser si possible.

**C3. Récapitulatif scope retenu vs proposé.**
- Encart en haut de l'annexe A : "X jobs retenus sur Y proposés — Z J/H facturés sur W J/H estimés".

**C4. Options retenues vs écartées explicitées.**
- Si une option a été chiffrée mais non retenue (ex. "Option B"), une note dédiée dans l'annexe : "Option B — chiffrée à X J/H, non retenue dans le présent devis. Peut être réintégrée par avenant."

### D. Annexe B — Planning

**D1. Bug dates planning.**
- Les dates affichées (30 mars - 20 avril) ne sont pas cohérentes avec la date d'émission/signature (25 avril 2026). Identifier la cause :
  - Dates en dur dans le seed/test ?
  - Dates relatives mal calculées ?
  - Source des dates (champ projet ? `devis_versions.data_json` ?) ?
- Corriger pour que le planning soit toujours **postérieur** à la date d'émission.
- Ajouter validation côté UI : interdire un planning antérieur à la date d'émission.

**D2. Format planning en vrai tableau.**
- Tableau 3 colonnes : Semaine / Période / Livrables.
- Espacement aéré, alignement vertical correct.

**D3. Jalons de paiement.**
- Si l'échéancier (cf. A8) est jalonné, projeter les jalons sur le planning : "S2 — fin : facture à payer".

### E. Annexe C — Hors scope

**E1. Conserver l'annexe** (bonne pratique).

**E2. Mise en page propre** (cf. D2 : éviter les blocs textuels denses, préférer des blocs lisibles avec titre et description courte).

**E3. Reformuler les renvois "lot 2".**
- Pas d'engagement implicite.
- Standardiser : "Envisagé en lot 2 ultérieur, sous réserve d'un chiffrage séparé."
- Champ structuré au niveau du job/exclusion : "Reportable en lot ultérieur" (oui/non).

### F. Certificat de signature électronique

**F1. Conserver le socle technique** : référence, signataire, IP, date/heure, hash SHA-256, mention art. 1367. Ne rien casser.

**F3. Signature côté prestataire.**
- Pré-signature au moment de l'émission par le presta : signature électronique simple côté presta (modal équivalent à celui du client).
- La signature presta s'affiche au pied de la page 1 (zone signature classique d'un devis bilatéral) ET sur le certificat (deux blocs : "Signature prestataire" et "Signature client").
- Hash recalculé après contre-signature client, ou hash calculé sur le document hors zone signatures (à arbitrer techniquement).

**F4. Préciser la portée du hash.**
- Mention sur le certificat : "Empreinte SHA-256 calculée sur l'intégralité du présent document (pages 1 à N hors zone de signature électronique elle-même)."

### G. Branding et finition (cf. §6 pour le détail)

**G1. Accents et caractères Unicode.**
- Embarquer une police TrueType complète dans jsPDF (via VFS) ou migrer vers une stack PDF qui supporte nativement Unicode (Puppeteer + HTML/CSS).
- Police suggérée : Inter, Geist Sans, ou Source Sans 3 (libres de droit, excellent rendu).
- Tous les diacritiques français doivent rendre correctement (à, é, è, ê, ô, ç, œ, …).

**G2. Casse cohérente "Iron Seal".**
- Choisir une casse et la décliner partout : recommandé "Iron Seal" en titre, "iron seal" jamais.

**G3. Devise au symbole "€".**
- `2 400,00 €` (espace fine insécable avant le symbole).
- Format français des nombres : virgule décimale, espace insécable comme séparateur de milliers.

**G4. Tirets cadratin homogènes.**
- Annexes : tous en em-dash (—).
- Tirets dans les lignes de tableau ou listes : tiret moyen (–).

**G5. Heure retirée de la date d'émission devis.**
- Date d'émission : `25 avril 2026` (pas d'heure).
- L'heure est conservée sur le certificat de signature (utile pour la valeur probante).

**G6. Logo prestataire.**
- Upload depuis le compte (PNG/SVG, fond transparent recommandé).
- Affichage en en-tête de chaque page, à gauche.
- Taille : ~ 30-40mm de large max.
- Si pas de logo : fallback sur le nom de la raison sociale en typographie travaillée.

**G7. Footer paginé travaillé.**
- Footer fin (8-9pt, gris 400) : "DEV-26-0403 · CDC Cockpit Sales — CarJager · Page 2 / 4".
- Optionnel : URL Iron Seal en mention discrète (white-label désactivable au niveau plan).

**G8. Bloc contact projet.**
- Sous le bloc PRESTATAIRE (ou intégré) : "Responsable projet : Marc Inard — marc@blueheronlab.com — 06 …".
- Champ `account.project_contact_*` (name, email, phone, role).

### H. Architecture / produit

**H1. Génération PDF côté serveur (recommandation).**
- Migration jsPDF → Puppeteer/Playwright headless rendant un template HTML/CSS (Tailwind ou CSS pur).
- Avantages : polices unicode natives, CSS print complet, PDF identique partout, hash calculé serveur, archivage byte-stable.
- Le viewer client conserve une preview HTML interactive (le même template HTML stylé pour print) mais l'export PDF passe par le serveur.
- À arbitrer : décision majeure, Claude Code propose un plan avant exécution.

**H2. Versioning visible des devis.**
- Bandeau en page 1 : "Version 2.1 — remplace la version 1.4 du 18 avril 2026".
- Lien (côté UI presta, pas dans le PDF) vers les versions antérieures.
- Le schéma `devis_versions` existe ; à exploiter dans le rendu.

**H3. Wizard de complétion compte avant émission.**
- Avant qu'un presta puisse émettre un devis, vérifier la complétion de son compte :
  - Forme juridique, capital, RCS, APE, SIREN, TVA, adresse, contact projet, RIB, CGV.
- Bloquant : impossible d'émettre un devis tant qu'un champ obligatoire est vide.
- UX : checklist visuelle avec progression.

**H4. Bloc CGV configurable.**
- Cf. A6 : champ texte riche / upload PDF / URL.
- Une seule de ces trois options doit être renseignée pour permettre l'émission.

---

## 4. Modèle de données — évolutions suggérées

> Claude Code a la liberté d'ajuster, mais voici la cible fonctionnelle.

### Table `accounts` — colonnes à ajouter / utiliser
- `legal_form` (SAS, SARL, EI, EIRL, Auto-entrepreneur, …) — déjà partiellement présent ?
- `share_capital` (numérique, optionnel selon forme juridique).
- `rcs_city` (ville d'immatriculation RCS).
- `rcs_number` (n° RCS si distinct du SIREN).
- `ape_code` (5 caractères, ex. "6201Z").
- `iban`, `bic`.
- `phone`.
- `cgv_text` (texte riche) **OU** `cgv_pdf_url` **OU** `cgv_url`.
- `brand_color` (hex, défaut `#0A0A0A` ou couleur Iron Seal).
- `logo_url`.
- `project_contact_name`, `project_contact_email`, `project_contact_phone`, `project_contact_role`.
- `late_payment_rate_label` (texte affiché, défaut "BCE + 10 points").
- `recovery_fee_amount` (défaut 40.00).
- `rc_pro_insurer`, `rc_pro_policy_number` (optionnels).

### Table `projects` — évolutions
- `preamble` (texte du préambule, B4).
- `payment_schedule_mode` (`upfront` | `on_delivery` | `milestones`).
- `payment_schedule_json` (échéancier détaillé si `milestones`).
- `kickoff_date`, `delivery_date` (pour calcul planning, D1).

### Table `devis_versions` — évolutions
- `previous_version_id` (référence pour H2).
- `change_summary` (texte court : "remplace v1.4 — ajout FEAT 6").

### Nouvelle table `invoices` (cf. §7)
- `id`, `project_id`, `devis_signature_id` (référence au devis signé), `invoice_number` (ex. `FAC-26-0403-01`), `issued_at`, `due_at`, `amount_ht`, `amount_tva`, `amount_ttc`, `status` (`draft` | `sent` | `paid_partial` | `paid` | `overdue` | `cancelled`), `paid_at`, `payment_method`, `data_json` (snapshot pour archivage).
- `milestone_label` (si facture par jalon).

### Nouvelle table `invoice_payments`
- `id`, `invoice_id`, `amount`, `paid_at`, `method`, `reference`.

---

## 5. Parcours utilisateur — évolutions

### Côté presta — émission devis
1. Création / édition projet (existant).
2. Préambule éditable (B4).
3. Configuration échéancier de paiement (A8).
4. Configuration planning avec validation des dates (D1).
5. Wizard de complétion compte si manquant (H3).
6. Preview du PDF en HTML (rendu fidèle) avant émission.
7. Émission = pré-signature presta (F3) + envoi au client.

### Côté client — signature
1. Lecture du devis (préview HTML stylé).
2. Modal signature : nom, signature canvas/typée, mention "Bon pour accord" (A5).
3. Hash recalculé, certificat généré, PDF archivé.

### Côté presta — facturation
1. Depuis un devis signé : bouton "Générer une facture".
2. Choix : facture totale ou facture de jalon (selon échéancier).
3. Édition (date d'échéance, mention spécifique, ligne descriptive).
4. Émission = numérotation incrémentale + envoi au client (PDF facture en pièce jointe).
5. Suivi : marquer comme payée, paiement partiel, relance.

### Côté presta — configuration compte
1. Page dédiée "Informations légales" : tous les champs §4.
2. Page "Branding" : logo, couleur d'accent, white-label éventuel.
3. Page "CGV" : éditeur texte riche ou upload PDF ou URL.
4. Page "Coordonnées bancaires" : RIB.
5. Page "Contact projet" : référent par défaut.

---

## 6. Système visuel — guide approfondi

> Claude Code peut affiner mais doit respecter l'esprit : minimaliste premium, lisible, intemporel. Référence d'inspiration : Stripe Invoice, Linear, Pennylane, Notion exports, Vercel dashboard.

### 6.1 Typographie

**Famille principale** : Inter (poids 400 / 500 / 600 / 700) ou Geist Sans.
**Famille secondaire (optionnel)** : Inter Tight pour les très gros titres ; ou pas de secondaire (single-typeface design).
**Tabular numbers** : activés sur tous les chiffres (`font-variant-numeric: tabular-nums`).

**Échelle typographique cible (en points PDF)** :
- Display (titre projet en page de garde optionnelle) : 32-40pt, 700.
- H1 (titre projet en page 1) : 22-26pt, 600.
- H2 (titres d'annexe) : 16-18pt, 600.
- H3 (titres de feature, bloc total label) : 11-12pt, 600.
- Body : 9.5-10pt, 400, line-height 1.45.
- Caption / footer / mentions légales : 7.5-8.5pt, 400, gris 500.
- Total TTC (chiffre) : 20-24pt, 700.

**Embarquer la police complète** dans le PDF (TTF dans VFS jsPDF, ou nativement via Puppeteer). Aucun fallback police système.

### 6.2 Palette

**Neutres (base)** :
- Encre : `#0A0A0A` (titres, total).
- Gris 800 : `#1F2937` (body).
- Gris 500 : `#6B7280` (captions, métadonnées).
- Gris 200 : `#E5E7EB` (séparateurs).
- Gris 50 : `#F9FAFB` (zebra de tableau, fonds doux).
- Blanc cassé : `#FFFFFF` ou `#FAFAFA`.

**Accent** :
- Couleur configurable au niveau compte (`accounts.brand_color`).
- Défaut Iron Seal : à définir. Suggestion : un bleu nuit `#0F172A` ou un vert sapin `#0F3D2E` ou un orange brûlé `#C2410C` (cohérent avec l'orange actuel mais plus profond et premium).
- Utilisée pour : titres d'annexe, total TTC, mention "DEVIS", picto "✓ Inclus", badges.

**Sémantique (badges, statuts)** :
- Success : `#059669`.
- Warning : `#D97706`.
- Danger : `#DC2626`.
- Info : `#2563EB`.

### 6.3 Grille et espacement

- Format : A4 portrait (210 × 297 mm).
- Marges : 22mm haut, 18mm latérales, 22mm bas.
- Header utile : 28mm (logo + bloc référence à droite).
- Footer utile : 12mm.
- Zone de contenu : ~ 174 × 235 mm.
- Grille interne : colonnes de 12 unités, gouttières de 4mm. Permet d'aligner blocs prestataire/client sur 6/6 par exemple.
- Espacements verticaux : multiples de 4pt (4, 8, 12, 16, 24, 32, 48).

### 6.4 Composants

**En-tête de page** (toutes pages) :
- Gauche : logo presta (max 35 × 12 mm) ou nom typographié.
- Droite : `DEV-26-0403` en petit, gris 500.
- Filet fin gris 200 sous le header.

**Bloc identité (page 1)** :
- Deux colonnes alignées sur baseline.
- Label "PRESTATAIRE" / "CLIENT" en 8pt, 600, espacé (letter-spacing 0.05em), gris 500.
- Raison sociale en 11pt, 600.
- Détails (adresse, IDs, contact) en 9pt, gris 800.
- Email en accent color discret (souligné optionnel).

**Bloc titre projet** :
- Mention "DEVIS N° DEV-26-0403" en 9pt 600 letter-spaced, accent color.
- Titre projet en 22pt 600, encre.
- Métadonnées (version, date émission, date validité) en 9pt gris 500, séparées par "·".

**Préambule** :
- Bloc texte 9.5pt, line-height 1.5, encre 800.
- Largeur max 140mm pour confort de lecture.
- Marge basse 16pt.

**Tableau de prix** :
- Pas de bordures verticales.
- Header de tableau : fond blanc, texte 8.5pt 600 letter-spaced gris 500, séparé du body par filet 1px gris 200.
- Lignes : padding vertical 10pt, séparateur 1px gris 100 entre lignes.
- Description : encre 800, 9.5pt, wrap multi-ligne autorisé (B1).
- Type / Prio : en mini-pills à droite de la description **ou** en colonnes dédiées (à arbitrer selon B5). Si pills : background gris 50, border 1px gris 200, padding 2-4pt, 7.5pt.
- J/H : aligné à droite, tabular-nums, 9.5pt.
- Montant HT : aligné à droite, tabular-nums, 9.5pt 500.
- Pas de zebra ou zebra ultra-discrète (gris 50 1 ligne sur 2).

**Bloc total** :
- Encadré pleine largeur (ou 60% droite alignée), fond gris 50, border-radius léger (3-4pt), padding 14pt.
- Lignes "Total HT" / "TVA 20%" en 10pt, label gris 500, valeur encre 800 tabular-nums.
- Filet séparateur fin avant Total TTC.
- "Total TTC" : label 11pt 600 encre ; valeur 22pt 700 accent color tabular-nums.
- Sous le bloc : ligne italique 8.5pt gris 500 : "Taux journalier appliqué : 500 € HT — 4,00 J/H × 500 €".

**Bloc conditions de paiement & RIB** :
- Carte distincte sous le bloc total (ou sur la page suivante avant les annexes).
- Titre 11pt 600.
- Lignes structurées : Délai · Pénalités · Indemnité · Mode · IBAN · BIC.
- IBAN en typo monospace pour lisibilité.

**Bloc signature** :
- Zone "Bon pour accord" en 9pt 600 au-dessus.
- Deux colonnes : "Pour le prestataire" / "Pour le client".
- Chaque colonne : nom du signataire, fonction, lieu et date, paraphe (canvas image).
- Filet gris 200 pour les zones de signature non encore signées (preview).

**Annexes** :
- Page de saut visible (titre annexe en H2 accent color, marge généreuse au-dessus).
- Numérotation : "ANNEXE A" en 8.5pt 600 letter-spaced, accent ; titre en H2.
- Sections : H3 + corps texte + listes structurées.
- Listes : bullets propres (• ou ▸), indentation 12pt, line-height 1.5.

**Certificat de signature** :
- Page dédiée, dernière page.
- H1 "Certificat de signature électronique".
- Tableau clé/valeur en deux colonnes (label gris 500 / valeur encre 800).
- Bloc paraphe en bas, 60mm de large.
- Hash SHA-256 en monospace 8pt avec wrap.
- Mention art. 1367 + mention RGPD (A7) en 8pt italique gris 500.

**Footer** :
- Filet fin gris 200 au-dessus.
- Texte 8pt gris 500 : "DEV-26-0403 · CDC Cockpit Sales — CarJager · Page 2 / 4".
- Optionnel à droite : "Émis avec Iron Seal" (white-label désactivable).

### 6.5 Page de garde (option configurable)

Configurable par presta (par défaut OFF, ON pour les projets > X € ou activable manuellement) :
- Logo très grand format en haut.
- Mention "DEVIS" en display 40pt, accent color.
- Titre projet en 26-32pt.
- Date d'émission, validité, version.
- Bloc identité prestataire / client en bas, sobre.
- Image / illustration / pattern subtil optionnel (à concevoir, ou laisser vide proprement).

### 6.6 Accessibilité et impression

- Contraste AA minimum sur tous les textes.
- Tous les codes couleur doublés d'un signe textuel ou d'un picto (cf. C1).
- Lisibilité en noir et blanc garantie (test à la sortie).
- Tabular-nums obligatoires sur tous les chiffres comparables.
- Format A4, marges sécurisées pour impression sans bordure perdue.

### 6.7 Micro-interactions PDF (optionnel, si stack le permet)

Si génération HTML interactive en plus du PDF :
- Lien cliquable sur le SIREN (vers societe.com / pappers.fr).
- Lien cliquable sur l'IBAN pour copier dans le presse-papier.
- Sommaire cliquable en début de document.

---

## 7. Facture — spécifications dédiées

> Dérivée du système visuel devis ; mêmes composants, mêmes polices, mêmes blocs ; différences ciblées.

### 7.1 Structure

1. **En-tête identique** au devis (logo, référence facture en haut à droite : `FAC-26-0403-01`).
2. **Bloc identité** identique (PRESTATAIRE / CLIENT).
3. **Bloc titre** :
   - Mention "FACTURE N° FAC-26-0403-01" en accent color.
   - Titre projet (référence du devis signé).
   - Date d'émission · Date d'échéance (très visible) · Référence devis : DEV-26-0403.
4. **Tableau de lignes facturées** : repris du devis ou subset selon jalon facturé.
5. **Bloc total** identique en structure.
   - Si paiement partiel ou jalon : afficher "Montant facturé" + "Reste à payer global du projet".
6. **Bloc "À payer"** :
   - Très visible.
   - Montant TTC dû en display 24pt accent.
   - Date d'échéance.
   - IBAN / BIC en monospace.
   - Référence à rappeler dans le virement (ex. `FAC-26-0403-01`).
7. **Mentions légales facture** (cf. 7.2).
8. **Pas de signature** (la facture n'a pas à être signée). Acquit éventuel possible si paiement enregistré.

### 7.2 Mentions obligatoires facture (Code de commerce L441-9, CGI 242 nonies A)

- Date d'émission.
- Numéro unique séquentiel sans rupture (`FAC-AAAA-NNNN` ou `FAC-26-0403-01`).
- Identité complète émetteur (cf. A2).
- Identité complète client.
- Numéro de TVA des deux parties (si B2B intra-UE).
- Date de la prestation / livraison (ou période).
- Désignation précise et quantité des prestations.
- Prix unitaire HT, taux de TVA, montants HT et TTC.
- Réductions éventuelles.
- Date d'échéance.
- Pénalités de retard + indemnité 40 € (rappel).
- Conditions d'escompte (ou mention "pas d'escompte pour paiement anticipé" si tel est le cas).

### 7.3 Statuts et workflow

- `draft` : en cours d'édition.
- `sent` : envoyée, en attente de paiement.
- `paid_partial` : paiement partiel reçu.
- `paid` : soldée.
- `overdue` : impayée passée échéance.
- `cancelled` : annulée (avoir requis si déjà envoyée).

### 7.4 Avoir (facture rectificative)

- Hors scope du présent CDC mais à anticiper structurellement (un avoir = facture négative liée à une facture mère).

---

## 8. Parcours d'édition côté presta — détail UX

### 8.1 Écran d'édition devis (existant à enrichir)
- Bloc préambule (B4) avec compteur de caractères et template.
- Bloc échéancier (A8) avec aperçu des jalons.
- Bloc planning avec validation dates (D1).
- Toggle page de garde (6.5).
- Preview live à droite (rendu HTML fidèle au PDF).
- Bouton "Émettre et signer" → modal signature presta → génération PDF + envoi.

### 8.2 Modal signature presta (F3)
- Identique en UX à la modal client.
- Stocke : nom, paraphe, IP presta, horodatage.
- Le PDF émis contient déjà la signature presta ; le client n'a plus qu'à contre-signer.

### 8.3 Écran facture (nouveau)
- Liste des factures par projet (avec statut visuel).
- Création depuis un devis signé : pré-rempli (lignes, totaux), édition possible.
- Mode "facture de jalon" : sélection du jalon dans l'échéancier.
- Bouton "Marquer comme payée" / "Enregistrer un paiement partiel".

---

## 9. Configuration de compte (H3)

### 9.1 Page "Informations légales"
Champs A2 + table accounts évolutions §4. Validation obligatoire avant émission devis. Indicateur de complétion (jauge).

### 9.2 Page "Branding"
- Upload logo (PNG/SVG, max 1Mo).
- Couleur d'accent (color picker).
- Toggle "Page de garde par défaut".
- Toggle "Afficher 'Émis avec Iron Seal' en footer" (white-label, payant).
- Preview PDF live.

### 9.3 Page "CGV" (A6)
- Trois onglets : Texte riche / Upload PDF / URL.
- Validation : un seul mode actif.

### 9.4 Page "Coordonnées bancaires"
- IBAN, BIC.
- Validation format IBAN.

### 9.5 Page "Contact projet"
- Nom, fonction, email, téléphone du référent par défaut. Surchargeable par projet.

---

## 10. Polish et finition

- Tests visuels automatisés (snapshot PDF) sur 3-5 cas de figure (devis court, devis long avec page de garde, facture jalon, facture finale).
- Vérification accents et caractères spéciaux : devis avec œ, ç, à, î dans description, signataire avec apostrophe, etc.
- Test impression noir et blanc.
- Test rendu sur Acrobat / Preview macOS / Chrome PDF / Firefox PDF.
- Lighthouse / a11y sur la preview HTML.

---

## 11. Critères d'acceptation

Le travail est considéré terminé quand, sur un devis de test équivalent à BDC260403 :

1. ✅ Toutes les mentions légales A1-A8 sont présentes et correctes.
2. ✅ Aucune description n'est tronquée (B1).
3. ✅ Le total TTC est visible immédiatement (B2).
4. ✅ Le préambule, légendes, conditions de paiement, RIB sont rendus.
5. ✅ Les annexes A/B/C respectent C1-C4, D1-D3, E1-E3.
6. ✅ Les dates planning sont cohérentes avec la date d'émission (D1 corrigé).
7. ✅ La signature presta est présente (F3), la portée du hash est explicitée (F4), la mention RGPD est présente (A7).
8. ✅ Tous les accents/diacritiques s'affichent correctement (G1).
9. ✅ Devise au symbole €, formats français corrects (G3).
10. ✅ Logo presta affiché (G6), footer paginé propre (G7), bloc contact projet présent (G8).
11. ✅ Le système visuel §6 est respecté (typo, palette, espacements, composants).
12. ✅ Une facture peut être générée à partir du devis signé (§7).
13. ✅ Le compte presta est bloqué à l'émission tant que les champs obligatoires ne sont pas remplis (H3).
14. ✅ Une CGV est concaténée ou référencée (A6, H4).
15. ✅ Les devis déjà signés en base restent intacts et reconstructibles (compatibilité ascendante).
16. ✅ Le PDF est byte-identique entre la prévisualisation et la version archivée (H1, si migration faite).

---

## 12. Hors scope explicite

- Avoirs / factures rectificatives.
- Multi-devises (€ uniquement).
- Multi-langues (français uniquement, structure prête pour i18n).
- Signature électronique avancée ou qualifiée eIDAS (on reste sur la signature simple).
- Horodatage qualifié RFC 3161.
- Vérification automatique de l'identité du signataire (KYC).
- Intégration comptable (export Sage, FEC, e-invoicing PPF/PA — anticipable mais hors scope du présent lot).
- Relances automatiques de paiement.
- Page mentions légales / RGPD au niveau de l'app (à traiter dans un autre brief).

---

## 13. Livrables attendus

1. Migration DB consolidée.
2. Refonte du moteur PDF (devis + facture) avec tous les composants §6.
3. Nouveaux écrans de configuration compte (§9).
4. Nouveaux écrans facture (§8.3).
5. Modal signature presta (§8.2).
6. Tests snapshot PDF.
7. Court CHANGELOG documentant les évolutions de schéma et les choix de design (palette retenue, page de garde par défaut, etc.).

---

## 14. Prompt suggéré pour Claude Code

```
Lis docs/cowork-briefs/2026-04-25-devis-refonte.md en intégralité avant
toute action. C'est un cahier des charges complet pour refondre la
génération de devis et introduire la facture dans Iron Seal.

Tu as carte blanche sur l'implémentation, le product design, les
évolutions de schéma DB et de parcours utilisateur, dans le respect
des principes et garde-fous du §0.

Méthode :
1. Lis aussi docs/lynx-architecture.md, docs/methodo-discovery.md,
   api/setup.js et public/viewer.html pour comprendre l'existant.
2. Poste un plan d'exécution court (5-10 lignes) qui découpe en
   sprints, et liste les 3 décisions structurantes sur lesquelles tu
   veux mon arbitrage avant de coder (ex. moteur PDF, palette retenue,
   migration vs nouvelle table). Attends ma validation.
3. Une fois validé, exécute sprint par sprint. Après chaque sprint,
   poste un récap court : ce qui est fait, ce qui change pour
   l'utilisateur, ce qui reste.
4. Pour tout trade-off non trivial, propose 2 options avec
   recommandation argumentée. N'avance pas en silence sur les sujets
   à fort impact UX.
5. Les devis déjà signés en base ne doivent rien perdre — backward
   compatibility obligatoire sur les migrations.
6. Tests snapshot PDF en fin de parcours, sur au moins 3 cas
   (devis simple, devis long avec page de garde, facture).

Critères d'acceptation : §11 du CDC. Hors scope : §12.

Démarre.
```
