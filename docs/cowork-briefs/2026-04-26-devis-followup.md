# Follow-up devis & facture — Sprints 5 à 9

> **Statut** : brief Cowork → Claude Code, validé par Marc le 26 avril 2026.
> **Source** : audit critique des PDFs livrés en sprint 1-4 (devis BDC260403 v1.3 + facture FAC-26-0005).
> **Référentiels** : `docs/cowork-briefs/2026-04-25-devis-refonte.md` (CDC initial) + `docs/cowork-briefs/2026-04-26-livraison-sprint1-4.md` (note de livraison Claude Code).
> **Périmètre** : 5 sprints additionnels couvrant bugs visibles, robustesse contractuelle, échéancier de facturation, polish UX, différenciateurs.

---

## 0. Brief méta pour Claude Code

**Carte blanche maintenue** sur :
- L'implémentation technique, refonte de tout module si pertinent.
- Évolutions DB (migrations backward-compatible obligatoires).
- UX presta côté viewer / settings / dashboards.
- Choix de design dans le respect du système visuel défini au CDC initial §6.

**Garde-fous** :
1. Avant tout changement structurant majeur (nouveau moteur, refonte parcours, suppression de table), poste un plan court et attends mon arbitrage.
2. Pour tout trade-off non trivial, propose 2 options avec recommandation.
3. **Ne casse pas les devis et factures déjà signés en base**. Tout changement doit être ascendant compatible. Si une migration nécessite un backfill, l'expliciter.
4. **Ne casse pas la chaîne probante** : hash, IP, signature image, timestamps doivent rester intègres.
5. À la fin de chaque sprint, poste un récap succinct (réalisé / partiel / non fait + raison).

**Méthodologie suggérée** :
- Sprint 5 : bugs visibles + demandes Marc bloquantes (logo, CGV, IBAN, totals split, footer).
- Sprint 6 : robustesse contractuelle (snapshot data, byte-stability, conformité facture).
- Sprint 7 : échéancier de paiement et facturation enrichie (acompte, jalons).
- Sprint 8 : polish UX (preview, préambule, planning, formats).
- Sprint 9 : différenciateurs (page de garde, push desktop, dashboard facturation, relances).

---

## 1. Contexte

Les PDFs livrés en sprint 1-4 ont apporté un saut qualitatif majeur (typo Inter, palette bleu nuit, composants propres, certificat bilatéral). Restent des bugs visibles qui empêchent un usage en production, des trous de conformité (CGV non rendues, date de prestation manquante sur la facture), et des chantiers du CDC initial encore partiels (échéancier, byte-stability, page de garde).

Ce brief priorise une mise en production sereine sur sprint 5-6, puis enrichit les flows facturation et UX sur sprint 7-8, et ouvre les différenciateurs commerciaux sur sprint 9.

---

## 2. Process de facturation B2B — référentiel pour le sprint 7

Le presta peut émettre 3 types de factures sur un projet :

1. **Facture d'acompte** — émise **après signature du devis et avant kickoff**. Montant souvent 30-50% du Total TTC. Paiement par le client avant démarrage.
2. **Facture de jalon** — émise **après livraison d'un jalon contractuel** (sprint, démo, MEP). Plusieurs possibles sur un projet.
3. **Facture de solde** — émise **à la livraison finale**, couvre le reste à payer après acomptes/jalons éventuels. Si pas d'acompte ni de jalon : c'est la facture unique du projet.

L'UX doit guider le presta selon le statut du projet :

| Statut projet | Type de facture suggéré | Type(s) autorisé(s) |
|---|---|---|
| `signed` (à peine signé, kickoff non démarré) | Acompte | Acompte, Solde |
| `active` (kickoff fait, projet en cours) | Jalon | Jalon, Solde |
| `delivered` (livraison faite) | Solde | Solde |
| `completed` (toutes factures payées) | — | — |

Délais légaux à respecter :
- Délai de paiement max : 60 jours date facture ou 45 jours fin de mois (loi LME, art. L441-10).
- Numérotation séquentielle continue par exercice fiscal, sans rupture.
- Mention obligatoire date de prestation (CGI 242 nonies A).

---

## 3. SPRINT 5 — Bugs visibles & demandes Marc

> Objectif : rendre le PDF présentable en clientèle réelle. Sprint le plus prioritaire.

### FU-1 — Pied de page paginé sur toutes les pages (P0)
- Footer fixe sur **toutes les pages** des devis et factures.
- Format : `[Réf document] · [Titre projet] · Page X / N` à gauche, mentions légales courtes (`Raison sociale · SAS au capital de X · SIREN · RCS · TVA`) à droite, ou alterné selon largeur.
- Implémentation suggérée : `displayHeaderFooter` de Puppeteer avec `footerTemplate`, ou overlay HTML positionnée en `fixed` reproduite à chaque page via CSS `@page`.
- À tester sur PDFs de 1 à 10 pages.

### FU-2 — Pas de saut de page au milieu des blocs critiques (P0)
- Bloc Total HT / TVA / Total TTC : `page-break-inside: avoid` strict.
- Bloc Conditions de paiement : idem.
- Bloc Signatures bilatéral : idem.
- Bloc "À payer" de la facture : idem.
- Bloc Identité PRESTATAIRE/CLIENT : idem.
- Annexe — si une feature commence en bas de page, déplacer la feature entière sur la page suivante (`page-break-before: auto` + heuristique sur la hauteur restante).

### FU-3 — Logo prestataire qui s'affiche réellement (P0)
- Diagnostiquer le rendu actuel (base64 + `<img>` dans Puppeteer ne fonctionne pas).
- Solution préférée : endpoint dédié `/api/account/logo?id=X` qui sert le binaire avec `Content-Type` adapté + cache headers. Le template HTML appelle cette URL au lieu d'embarquer base64.
- Alternative si SVG : injection inline `<svg>...</svg>` dans le template.
- Tests : logo PNG transparent, logo PNG fond blanc, logo SVG, logo grand format, logo très petit. Aucun ne doit casser le layout.
- Si pas de logo : conserver le fallback nom typographié.

### FU-4 — CGV rendues dans le PDF (P0)
- Si `accounts.cgv_text` renseigné : annexe dédiée "Conditions générales de vente" insérée **après l'annexe C, avant le certificat de signature**. Pagination propre. Le hash inclut cette annexe.
- Si `accounts.cgv_url` renseigné : mention en pied de page de chaque page **et** ligne dédiée dans le bloc Conditions de paiement : "Devis soumis aux CGV consultables sur [URL cliquable]".
- Si les deux renseignés : annexe + mention URL.
- Si aucun : émission devis bloquée (déjà géré côté wizard mais à confirmer).
- Tester : CGV de 1 ligne, CGV de 5 pages.

### FU-5 — Pictos "Inclus" / "Non retenu" rendus correctement (P0)
- Diagnostiquer pourquoi le caractère picto disparaît (police Inter sans glyphe ? pseudo-élément non rendu ?).
- Solution robuste : utiliser des glyphes Unicode courants (✓ U+2713, × U+00D7) ou des SVG inline 12×12 dans le HTML.
- Doubler systématiquement avec un texte ("Inclus" / "Non retenu") et une couleur (vert / gris).
- Vérifier rendu sur Acrobat, Preview macOS, Chrome PDF viewer.

### FU-6 — Signature image client rendue dans le PDF (P0)
- Diagnostic : la signature presta s'affiche, la signature client non. Vérifier que le canvas client stocke bien `signature_image` en base64 dans `devis_signatures` et que le template lit ce champ pour le côté client.
- Pour les signatures clients antérieures à la migration (sans canvas image) : afficher un fallback explicite (le nom en police italique signature-style, ou une mention "Signature électronique enregistrée — voir certificat page N").
- Test : signature canvas standard, signature longue, signature très petite.

### FU-7 — IBAN affiché au bon endroit (P0)
- L'IBAN actuel s'affiche dans le bloc "À payer" de la facture ✓ et dans la grille Conditions de paiement du devis ✓. Maintenir.
- **Ajouter** dans le devis un bloc visible en page de signature : `IBAN: FR76 ... · BIC: ...` au-dessus ou à côté du bloc signatures, pour que le client puisse anticiper le mode de règlement avant de signer.
- Ajouter dans Settings une **prévisualisation masquée** de l'IBAN après saisie : `FR76 ●●●● ●●●● ●●●● ●●●● ●●●● 185` avec un toggle "Voir l'IBAN complet". Le presta doit voir confirmation que sa saisie a été enregistrée.
- Documenter : `ENCRYPTION_KEY` est sensible, sa rotation casserait les anciens IBANs.

### FU-9 — Heure de signature sur le certificat (P0)
- Format cible : `26 avril 2026 à 14:32 — IP 82.125.139.137 (Rennes)`.
- Stocker l'heure dans `devis_signatures.signed_at` (déjà le cas via `timestamptz`), juste l'afficher.

### FU-11 — UX Settings : feedback de saisie (P0)
- Pour chaque champ critique (logo, IBAN, CGV texte, CGV URL), afficher un **état visuel** :
  - "Détecté · sera utilisé dans le PDF" (vert)
  - "Manquant · à compléter pour émission" (orange)
  - "Optionnel" (gris)
- Bouton "Tester avec un devis fictif" → génère un PDF de démo avec les données du compte (projet bidon, ligne unique 1 J/H × TJM, signature non requise).
- Ajouter une section "Aperçu de mes blocs PDF" qui rend en HTML les blocs Identité + Conditions + Signature à partir des données compte, mis à jour en live.

### FU-13 — Concaténation des CGV en annexe PDF
- Cf. FU-4 : la livraison de FU-4 absorbe ce ticket. Marquer FU-13 comme remplacé par FU-4.

**Livrable Sprint 5** : un PDF de devis et un PDF de facture avec logo, CGV, footer paginé, pictos visibles, signatures bilatérales rendues, totals jamais coupés. Settings donne du feedback sur ce qui est sauvegardé.

---

## 4. SPRINT 6 — Robustesse contractuelle & conformité

> Objectif : rendre la chaîne probante incassable et la facture juridiquement irréprochable.

### FU-19 — Byte-stability du PDF signé (P0)
- À la signature finale (contre-signature client), figer le PDF en blob immutable :
  - Stockage : Vercel Blob Storage (préféré) ou bytea PostgreSQL si pas de Blob.
  - Hash SHA-256 calculé sur ce blob exact, stocké dans `devis_signatures.devis_hash` (override de la valeur calculée pré-signature si nécessaire).
  - URL `/api/pdf?slug=X&version=signed` sert ce blob byte-for-byte, jamais une régénération.
- Pour les devis signés avant cette migration : à la première lecture post-déploiement, générer + freezer le PDF avec un avertissement loggé "Snapshot post-hoc, hash recalculé".
- Idem facture : à l'envoi (statut `sent`), figer le PDF facture.
- Test : télécharger un même devis signé 3 fois, comparer SHA-256 des fichiers — doivent être identiques.

### FU-45 — Snapshot des données compte au moment de l'émission (P1)
- Quand un devis est émis (pré-signature presta), figer dans `devis_versions.data_json` un snapshot des données compte :
  - Raison sociale, forme juridique, capital, SIREN, TVA, RCS, APE, adresse complète, IBAN, BIC, contact projet, CGV texte/URL, brand_color, logo (URL ou hash).
- Le rendu PDF lit ce snapshot **par défaut**, jamais la table `accounts` live.
- Permet : changement d'adresse demain n'impacte pas l'historique. Changement d'IBAN n'impacte pas les anciens devis.
- Pour les devis pré-migration : générer le snapshot au premier rendu post-déploiement, à partir de l'état actuel du compte.

### FU-24 — Date / période de prestation sur la facture (P0)
- Mention obligatoire CGI 242 nonies A.
- Nouveau champ `invoices.delivery_date` ou `invoices.delivery_period_start` + `delivery_period_end`.
- UI : sur la modal facture, champ "Période de prestation" (date unique ou plage), pré-rempli intelligemment :
  - Acompte → date d'émission devis → date d'émission facture
  - Jalon → dates du sprint correspondant
  - Solde → date de kickoff → date de livraison
- Rendu PDF : sous le titre facture, ligne `Prestation délivrée du [start] au [end]` (ou `le [date]` si jour unique).

### FU-25 — Référence à la signature dans la facture (P1)
- Ligne sous-titre facture : `Réf. devis : BDC260403 · signé le 26 avril 2026 à 14:32`.
- Idéal : récupérer `devis_signatures.id` et `signed_at` du devis source, intégrer dans le `data_json` de la facture pour snapshot.

### FU-26 — Mention "Jalon" intelligente (P1)
- Si la facture est de type `solde` ET qu'il n'y a aucun acompte ni jalon précédent : ne pas afficher "Jalon : Facture complète". Afficher juste le nom du projet.
- Si type `acompte` : afficher "Acompte (X% du devis)".
- Si type `jalon` : afficher "Jalon : [label personnalisé]".
- Si type `solde` après acomptes/jalons : "Solde de prestation".

### FU-27 — Numérotation séquentielle sans rupture (P1)
- Audit : vérifier que `FAC-AA-NNNN` ne saute jamais de numéro.
- Suppression d'une facture interdite si `status = sent` ou plus avancé. Seul l'annulation (statut `cancelled`) est permise — la facture reste en base, le numéro est conservé.
- Si suppression d'un draft : OK, mais le numéro n'est pas attribué tant que la facture n'est pas en `sent`. Ajouter un champ `invoices.number` nullable jusqu'à émission, attribué uniquement au passage `draft → sent`.
- Compteur incrémental atomique en DB (sequence Postgres ou `MAX + 1` avec lock).

### FU-28 — Préparation structurelle des avoirs (P2 mais maintenant)
- Modèle : ajouter `invoices.invoice_type` (`acompte` | `jalon` | `solde` | `unique` | `credit_note`) et `invoices.parent_invoice_id` (référence à la facture mère pour les avoirs).
- Pas d'UI ni de rendu PDF pour les avoirs dans ce sprint, juste le schéma prêt pour ne pas refaire de migration douloureuse.
- `credit_note` accepte des montants négatifs.

### FU-12 — Wizard de complétion étoffé (P1)
- Ajouter logo, IBAN, CGV (texte ou URL) au wizard, avec :
  - Logo manquant → warning non bloquant ("Le PDF affichera votre nom typographié au lieu de votre logo.")
  - IBAN manquant → warning non bloquant pour le devis, **bloquant pour la facture** ("Une facture sans IBAN ne peut pas être réglée.")
  - CGV manquantes → bloquant pour l'émission devis (déjà le cas, à confirmer)
- Affichage du score de complétion en haut de Settings : "Compte complété à 78% — 3 champs recommandés à compléter".

### FU-20 — UI versions antérieures (P1)
- Dans le viewer presta, dropdown "Historique des versions" listant toutes les `devis_versions` du projet avec date, libellé, statut.
- Lien vers le PDF figé de chaque version (cf. FU-19).
- Permet la transparence sur les itérations.

**Livrable Sprint 6** : devis et factures byte-stables, snapshot des données compte, facture conforme CGI, UI versions, wizard complet.

---

## 5. SPRINT 7 — Échéancier de paiement & facturation enrichie

> Objectif : couvrir le process facturation complet (acompte → jalons → solde).

### FU-14 — UI échéancier de paiement sur le devis (P1)
- Composant dédié dans le viewer presta (mode draft) :
  - Toggle "Mode de facturation" : `Facture unique à la livraison` (défaut) / `Acompte + solde` / `Jalonné`
  - Si Acompte : champ "Acompte" en % ou en € fixe + date prévisionnelle
  - Si Jalonné : éditeur de jalons (label + % ou € + date prévisionnelle), réordonnable
- Calcul automatique : la somme des jalons doit faire 100% du Total HT (warning sinon).
- Stockage : `projects.payment_schedule_mode` + `projects.payment_schedule_json` (déjà présents).
- Rendu dans le devis : tableau "Échéancier de paiement" en page 3 sous Conditions de paiement.

### FU-15 — Jalons projetés sur le planning (P2)
- Si l'échéancier a des jalons, ajouter une colonne "Facturation prévue" dans le tableau planning de l'annexe B.
- Marqueur visuel discret (€ ou puce colorée).

### FU-16 — Édition "Reportable lot 2" dans le viewer (P1)
- Pour chaque exclusion / hors-scope, checkbox "Reportable en lot ultérieur".
- Si coché : rendu PDF "Cockpit manager — envisagé en lot ultérieur, sous réserve d'un chiffrage séparé".
- Si non coché : rendu PDF "Cockpit manager — hors scope du présent devis".
- Migration : flag déjà existant (`exclusions.reportable_lot2`), juste l'éditer.

### FU-26-bis — Workflow facture par type (cf. §2)
- La modal facture du viewer s'adapte au statut projet :
  - Statut `signed` : sélecteur affiche par défaut "Facture d'acompte" + montant pré-rempli depuis l'échéancier.
  - Statut `active` : "Facture de jalon" + sélecteur du jalon parmi ceux non encore facturés.
  - Statut `delivered` : "Facture de solde" + montant calculé = Total TTC – sommes déjà facturées.
- Validation : empêcher d'émettre 2 factures de solde sur le même projet ; empêcher de facturer un jalon déjà facturé.
- Tableau récap "Facturation du projet" dans le viewer : ligne par jalon (prévu / facturé / payé), barre de progression visuelle.

### FU-27 (rappel) — Numérotation continue
- Cf. sprint 6, à finaliser dans le contexte d'émission par type.

### FU-31 — Dashboard facturation (presta) (P2)
- Nouvelle page `/dashboard/billing` (ou intégrée au dashboard existant) :
  - KPIs : Total facturé YTD, Total encaissé YTD, Reste à encaisser, Factures en retard.
  - Tableau factures récentes avec statut visuel, filtres par statut/projet/client.
  - Alerte rouge si facture > 30 jours après échéance.

**Livrable Sprint 7** : un projet peut être facturé en acompte + jalons + solde, le presta voit l'avancement de sa facturation, le devis affiche l'échéancier prévisionnel.

---

## 6. SPRINT 8 — Polish UX

> Objectif : finitions qui élèvent l'expérience presta et client.

### FU-8 — Annexe B planning : format homogène (P2)
- Toutes les lignes du tableau planning doivent avoir une période, pas une date isolée :
  - S0 : `S0 — 20-26 avril 2026 — Définition du besoin`
  - Kick-off : ligne dédiée hors tableau, ou intégrée comme S0.5 avec format cohérent.
- Surlignage : soit tous les jalons clés, soit aucun. Recommandé : surlignage uniquement de la dernière ligne (MEP) en accent color.
- Format date : préférer `JJ/MM/AAAA` partout dans le tableau (déjà le cas).

### FU-10 — GeoIP snapshot à la signature (P2)
- Au moment de la signature, résoudre la ville depuis l'IP **une seule fois**, stocker dans `devis_signatures.city`.
- Le rendu PDF lit ce snapshot, jamais ne re-résout.
- Évite les incohérences "même IP, deux villes différentes".

### FU-17 — Légende badges Type/Prio (P2)
- Bandeau discret sous le titre Annexe A : `NEW · nouveau développement   REFACTO · refonte de l'existant   MUST · essentiel   NICE · optionnel`.

### FU-18 — Note pour options non retenues (P2)
- Quand une feature contient à la fois des jobs `included = true` ET des jobs `included = false` qui sont des "options" (Option A/B/C dans le titre par exemple), ajouter une note de bas de section :
  - `Option B chiffrée à 1,50 J/H, non retenue dans le présent devis. Réintégrable par avenant.`
- Heuristique simple : détecter le préfixe "Option X" ou marquer manuellement via un champ `jobs.is_alternative`.

### FU-29 — Préambule avec placeholder & suggestion IA (P1)
- Placeholder par défaut dans le viewer : `Suite à nos échanges du JJ/MM, nous vous proposons de [...]. Le présent devis couvre [...].`
- Bouton "Suggestion IA" qui, à partir du titre projet, des features incluses et du nom du client, génère un préambule de 3-5 lignes via un appel LLM (Claude API).
- Editeur texte simple (pas de markdown ni rich text dans le devis pour préserver la pagination).

### FU-30 — Preview PDF live dans le viewer (P1)
- Panneau latéral droit dans le viewer presta : iframe sur `/api/pdf?slug=X&format=html` avec rafraîchissement on-blur des champs édités.
- Toggle "Pleine largeur" pour basculer en preview seule.
- Effet "Stripe Invoice editor" : le presta voit l'effet de chaque modif sans téléchargement.

### FU-33 — Formats nombres et espaces fines insécables (P2)
- Forcer `Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })` sur tous les montants.
- Capital social : même formatage (`1 000 €` et non `1000 €`).
- Espace fine insécable U+202F entre nombre et symbole `€`.
- Vérifier : tableaux, totaux, ligne TJM, blocs identité, "À payer".

### FU-34 — "Prestations offertes" : titre clarifié (P2)
- Titre unique : `Prestations incluses sans frais` (au lieu du double titre actuel).
- Chaque ligne : libellé · J/H estimée · badge `Offert`.

### FU-35 — Quantification valeur des offerts (P2)
- À côté de chaque prestation offerte, J/H estimée si renseignée.
- Ligne récap en bas du bloc : `Soit X J/H offertes — équivalent Y € HT au TJM appliqué.`
- Effet commercial de valorisation.

### FU-36 — Watermark "BROUILLON" (P2)
- Si statut devis `draft` ET téléchargement PDF : filigrane diagonal `BROUILLON` en gris transparent à 8% d'opacité, taille 80pt, rotation -30°.
- Empêche l'envoi accidentel d'un draft non finalisé.

### FU-37 — Watermark "ANNULÉ" / "REMPLACÉ" (P2)
- Devis ou facture remplacé par une version ultérieure : watermark `REMPLACÉ — voir version X` (avec lien si possible).
- Facture `cancelled` : watermark `ANNULÉ`.

### FU-38 — Densité annexe A (P2)
- Réduire le `padding-vertical` des lignes de tableau de ~20%.
- Tester impression : viser annexe A sur 1.5 page max pour 18 jobs.

**Livrable Sprint 8** : preview live, formats homogènes, planning propre, watermarks, préambule assisté.

---

## 7. SPRINT 9 — Différenciateurs

> Objectif : éléments qui marquent vs concurrence (Pennylane, Indy, Tiime).

### FU-21 — Page de garde optionnelle (P2)
- Toggle au niveau projet (`projects.use_cover_page`) ou au niveau compte (défaut on/off).
- Page 0 ajoutée : logo très grand format, mention `DEVIS` en display 40pt, titre projet 28pt, version + dates, identité presta/client en bas en sobre.
- Espace pour image/illustration optionnelle (champ `projects.cover_image_url`).

### FU-22 — Liens cliquables dans le PDF (P2)
- Email signataire/contact : `mailto:`
- SIREN : lien vers `https://www.pappers.fr/entreprise/SIREN`
- IBAN : pas de protocole standard, ajouter une note "(copier dans votre app bancaire)".
- URL CGV : lien direct.
- Puppeteer rend les `<a href>` en liens PDF nativement.

### FU-23 — Tests visuels automatisés (P2)
- Snapshot tests `pdf-diff` ou screenshots des pages via Puppeteer.
- 5 cas couverts : devis simple, devis avec page de garde, devis avec préambule long, facture acompte, facture solde avec watermark `ANNULÉ`.
- CI : si différence visuelle détectée, fail + screenshot diff archivé.

### FU-32 — Relances automatiques impayés (P2)
- Cron quotidien (Vercel Cron) qui scanne les factures `sent` ou `overdue` :
  - J+1 après échéance : email "Rappel doux" au client.
  - J+15 : email "Relance" au client + notif au presta.
  - J+30 : email "Mise en demeure" au client + notif au presta + suggestion d'escalade.
- Templates personnalisables au niveau compte.
- Toggle on/off par presta et par facture.

### FU-43 (révisé) — Notifications push desktop (P2)
> **Note pour Marc** : oui, les notifications push desktop fonctionnent bien sur le web. Web Push API + Notification API + Service Workers. Supportées sur Chrome, Firefox, Edge desktop ; Safari macOS depuis macOS 13. Demande de permission utilisateur explicite, fonctionnent même quand l'onglet est fermé tant que le navigateur tourne. Pas de Slack ici.

- Service Worker enregistré côté frontend, ask permission au login presta.
- Subscriptions stockées en DB (`push_subscriptions` : user_id, endpoint, keys p256dh + auth).
- API serveur déclenche un push sur événements :
  - Devis signé par le client → "✅ Vincent Deboeuf vient de signer le devis BDC260403 — 2 400 € HT"
  - Facture payée → "💰 Paiement reçu sur FAC-26-0005 — 2 400 € HT"
  - Facture en retard → "⏰ FAC-26-0005 a dépassé l'échéance"
- Lib suggérée : `web-push` côté Node, gestion VAPID keys.
- Toggle dans Settings : choix granulaire des événements à notifier.

### FU-44 — Score de complétude du compte (P2)
- Settings affiche en haut : barre de progression `Compte complété à 78%` avec liste pondérée des champs manquants.
- Pondération suggérée : raison sociale (10%), SIREN (10%), TVA (10%), RCS (5%), capital (5%), adresse (10%), IBAN (15%), CGV (15%), logo (10%), brand_color (5%), contact projet (5%).
- Effet gamification.

### FU-41 — Page post-signature client (P2)
- Après signature client, redirection vers `/signed/:slug/thanks` :
  - Récap visuel du devis signé.
  - "Prochaines étapes" : kickoff date, contact projet, télécharger le PDF, ajouter au calendrier (`.ics`).
  - CTA "Restez en contact avec [Marc Inard]".

### FU-42 — Export comptable (P2)
- Bouton "Exporter pour ma compta" dans le dashboard facturation :
  - Export CSV : toutes les factures de l'exercice (numéro, date, client, HT, TVA, TTC, statut, date paiement).
  - Export ZIP de tous les PDFs facture de l'exercice.
- Pas de FEC complet (hors scope), mais base exploitable par un comptable.

**Livrable Sprint 9** : page de garde, liens PDF, tests CI, relances, push desktop, dashboard complétude, page thanks, export compta.

---

## 8. Backlog parking lot (non priorisés)

Idées explorables ultérieurement, conservées pour mémoire :

- **FU-39 — QR code SEPA Credit Transfer** sur la facture (norme EPC069-12) — stylé mais pas prioritaire.
- **FU-40 — Lien de paiement Stripe / Mollie / Lemon Squeezy** — différenciateur fort, à explorer plus tard.
- **Multi-langues** (anglais d'abord) — structure i18n à anticiper.
- **Multi-devises** (€ d'abord, USD/GBP plus tard).
- **Signature électronique avancée eIDAS** (DocuSign-like).
- **Horodatage qualifié RFC 3161**.
- **KYC signataire** (vérification identité par lien magique + double opt-in email).
- **E-invoicing PPF/PA** (obligation 2026-2027 en France).
- **App mobile** native ou PWA installable.
- **Intégration calendrier presta** (Google Calendar, Cal.com) pour bloquer les jalons sur l'agenda.

---

## 9. Critères d'acceptation transverses

À chaque fin de sprint, vérifier que :

1. ✅ Aucun devis ni facture précédemment signé n'est cassé (téléchargement, hash, certificat intacts).
2. ✅ Les migrations DB sont backward-compatible (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).
3. ✅ Le PDF reste valide sur Acrobat, Preview macOS, Chrome PDF viewer, Firefox PDF viewer.
4. ✅ Aucun bloc critique (totals, signatures, conditions, "À payer") n'est jamais coupé en deux pages.
5. ✅ Les accents et caractères spéciaux français rendent correctement (à, é, è, ê, î, ô, û, ç, œ, …).
6. ✅ Tous les nombres respectent le format `fr-FR` avec espace fine insécable.
7. ✅ Le footer paginé apparaît sur toutes les pages.
8. ✅ Les tests snapshot passent.

---

## 10. Hors scope (rappel)

- Avoirs / factures rectificatives (juste préparation structurelle au sprint 6).
- Multi-devises, multi-langues, eIDAS avancé, KYC, RFC 3161.
- Intégration comptable complète (FEC, e-invoicing PPF).
- App mobile.
- Lien de paiement en ligne et QR SEPA (parking lot).

---

## 11. Prompt suggéré pour Claude Code

```
Lis docs/cowork-briefs/2026-04-26-devis-followup.md en intégralité avant
toute action. C'est le brief de suivi des sprints 5 à 9 sur la refonte
devis & facture, qui s'inscrit dans la continuité du CDC initial
docs/cowork-briefs/2026-04-25-devis-refonte.md et de ta note de livraison
docs/cowork-briefs/2026-04-26-livraison-sprint1-4.md.

Tu as carte blanche sur l'implémentation, le product design, les
évolutions DB et de parcours, dans le respect des principes et
garde-fous du §0.

Méthode :
1. Relis aussi api/pdf.js, api/setup.js, public/viewer.html,
   public/settings.html, api/projects.js pour comprendre l'état actuel.
2. Démarre par le Sprint 5 — c'est le plus prioritaire (bugs visibles
   et demandes Marc bloquantes pour usage en prod).
3. Pour chaque sprint, poste un plan court (5-10 lignes) avant
   d'attaquer, et liste 1-3 décisions structurantes sur lesquelles tu
   veux mon arbitrage. Attends ma validation.
4. Exécute le sprint, puis poste un récap court : réalisé / partiel /
   non fait + raison.
5. **Sprint 5 prioritaire absolu** sur FU-1, FU-2, FU-3, FU-4, FU-5,
   FU-6, FU-7. Ces 7 items sont bloquants pour mise en prod.
6. **Sprint 6 priorité haute** sur FU-19 (byte-stability) et FU-45
   (snapshot) — la valeur juridique du produit en dépend.
7. Les sprints 7-8-9 peuvent être réordonnés selon trade-offs si
   besoin, mais respectent l'esprit (échéancier → polish →
   différenciateurs).
8. Tests snapshot PDF en fin de sprint 5 et fin de sprint 9.
9. Backward-compat obligatoire sur toutes les migrations.
10. Pas de Slack pour les notifs push (FU-43) : web push desktop
    natif uniquement.

Critères d'acceptation transverses : §9 du brief. Hors scope : §10.
Backlog parking lot : §8 (ne PAS implémenter).

Pour la facturation (Sprint 7), respecte le process B2B décrit en §2 :
acompte avant kickoff, jalons en cours d'exécution, solde à la
livraison, paiement à 30j max sauf exception.

Démarre par poser ton plan Sprint 5 avec décisions à arbitrer.
```
