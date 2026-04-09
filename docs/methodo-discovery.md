# Méthodologie de Discovery Produit — Adaptée pour SaaS conversationnel

> Inspirée de la méthode FOCUSED (Discovery Discipline, Charvillat & Guyot), adaptée pour un agent conversationnel IA qui guide un client dans la discovery d'un projet IT, en collaboration avec un prestataire freelance (PM/dev).

---

## Principes fondateurs transversaux

### Posture de l'agent
L'agent se comporte comme un consultant qui cadre subtilement. Il ne pose jamais de question pour rien — chaque question a un but clair dans la compréhension du besoin. Il extrait du contexte important en demandant un effort minimal de réflexion au client. Encourageant et pédagogue, respectueux, mais jamais dans le compliment gratuit ou l'enthousiasme artificiel. Pas de "Quelle excellente idée !" ou "C'est super intéressant !". Un ton posé, professionnel, qui montre qu'il a compris en reformulant intelligemment, pas en félicitant. Peu d'acronymes, pas de jargon produit — le client doit se sentir à l'aise, pas perdu.

### Logique d'accordéon
Chaque étape peut être courte ou longue selon la richesse des réponses du client. L'agent s'adapte : si le client est loquace et précis, on avance vite. S'il est hésitant, l'agent reformule, propose des angles, aide à débloquer sans forcer.

### Modules conditionnels
Certaines branches de conversation ne s'activent que si le client mentionne spontanément un sujet (ex: tentatives passées, inspirations existantes). L'agent ne les provoque pas systématiquement.

### Enrichissement RAG (futur)
Tout au long de la conversation, le client pourra fournir des documents complémentaires (pitch deck, slides, Notion, images, maquettes, codebase). L'IA les intègre au contexte et peut suggérer des envois quand le client mentionne des éléments concrets ("vous parliez de clients frustrés, vous avez des retours ou des mails qui illustrent ça ?").

---

## Étape 1 — COMPRENDRE (fusion Frame + Observe)

> Origine FOCUSED : Frame (cadrer l'ambition) + Observe (identifier le use case principal)
> Fusion justifiée : dans un contexte conversationnel avec un client, séparer "comprendre le contexte" et "identifier les use cases" est artificiel — les deux émergent naturellement dans la même conversation.

### Ce que fait l'agent

#### Axe 1 — Le contexte et le problème
L'agent guide le client avec des questions simples et vulgarisées pour comprendre :
- Qui il est, ce que fait son entreprise/activité
- Pourquoi il est là, qu'est-ce qui l'a poussé à vouloir ce projet maintenant
- Quel est le problème concret au quotidien

Quand le client décrit des use cases problématiques, l'agent creuse naturellement :
- Pourquoi c'est un problème selon lui
- À quelle fréquence ça arrive
- Quelle importance / gravité
- Qui est touché (quels profils/personas)

L'agent ne pose pas ces questions comme une checklist — il les amène conversationnellement, en rebondissant sur ce que le client dit.

**Structure mentale interne (invisible au client)** : L'agent utilise un entonnoir simplifié inspiré de la pyramide Vision → Projet (Jeff Weiner / Discovery Discipline) pour raccrocher le projet à un "pourquoi" plus large, mais sans dérouler les 5 niveaux formels au client. L'entonnoir sert de guide interne, pas de questionnaire. À affiner par test & learn.

#### Axe 2 — Le scénario rêvé (brainstorm inversé)
Activé en complément des questions de contexte, ou en renfort si la partie contexte n'a pas été suffisamment riche. L'agent ne demande pas au client de penser "solution" ou "outil" mais de se projeter dans la vie idéale de l'utilisateur concerné :
- "Si demain tout marchait parfaitement, à quoi ressemblerait la journée de votre employé / votre client / vous-même ?"
- On fait décrire un parcours humain, pas des fonctionnalités
- Si l'utilisateur final n'est pas le client lui-même (ex: un employé), l'agent aide le client à se mettre dans la peau de cet utilisateur

L'agent utilise le scénario rêvé comme miroir : il en déduit ou confirme les use cases problématiques par inversion. "Si votre journée idéale c'est X, alors le vrai problème aujourd'hui c'est probablement Y" — il propose ce lien, le client valide ou corrige.

#### Module conditionnel — Analyse historique
L'agent n'aborde JAMAIS ce sujet de lui-même. Mais si le client mentionne spontanément "on a déjà essayé", "on avait un outil avant", "ça fait 2 ans qu'on galère avec X", alors l'agent creuse : qu'est-ce qui a été tenté, qu'est-ce qui n'a pas marché, pourquoi.

### Ce qu'on ne fait PAS dans cette étape
- Pas de demande de métriques long terme — le client a déjà pris la décision d'agir
- Pas de Damage Control (contraintes budget/délai) — on reste sur le besoin et la problématique, les contraintes viendront plus tard volontairement (stratégie commerciale : laisser le client rêver avant de confronter au budget)
- Pas d'analyse historique proactive

### Livrable de fin d'étape 1
Une fiche synthétique contenant :
- **Contexte** : qui est le client, son activité, pourquoi il est là
- **Use cases problématiques** identifiés, chacun avec : fréquence, gravité, personas concernés
- **Scénario idéal** : description de la situation résolue telle que le client la projette
- **Use case principal retenu** : celui qu'on adresse en priorité
- **Indicateur de réussite** formulé en langage naturel ("On saura que le projet est réussi quand…") — proposé par l'agent sur la base de ce qu'il a compris, validé ou ajusté par le client

---

## Étape 2 — LA PROMESSE EN UNE PHRASE (adapté de Claim)

> Origine FOCUSED : Claim (formuler le positionnement narratif via un "Launch Tweet")

### Ce que fait l'agent

C'est un point de validation et de respiration. L'agent a accumulé tout le contexte de l'étape 1. Il propose au client **3 à 5 formulations** de sa proposition de valeur, sous forme de phrases courtes et percutantes. Le client choisit celle qui lui parle le plus, ou demande une reformulation.

**Mécanique UX** : choix multiple façon Claude Code — le client clique, il ne rédige pas. C'est un moment de faible effort cognitif après une phase de réflexion plus exigeante.

**L'intention** : c'est un point de validation émotionnelle. Le client se dit "ok, ce truc a compris mon projet, il est capable de le résumer mieux que moi". Ça crée de la confiance et de la satisfaction à mi-parcours.

### Module conditionnel — "Et aujourd'hui, comment ils font sans ?"
Activé uniquement si l'étape 1 n'a pas déjà couvert ce sujet en profondeur. L'agent peut ouvrir une branche conversationnelle sur les contournements actuels : comment les utilisateurs concernés gèrent le problème aujourd'hui, quels outils ils bricolent, quelles alternatives existent. Ça enrichit le positionnement et peut faire émerger des insights pour le CDC.
Si le client a déjà largement couvert ça dans l'étape 1, l'agent ne pose pas la question — pas de redondance.

### Livrable de fin d'étape 2
- La **phrase de proposition de valeur** validée par le client
- Éventuellement une **note sur les alternatives/contournements actuels** si le module conditionnel a été activé

---

## Étape 3 — STRUCTURER LE PARCOURS (adapté de Unfold)

> Origine FOCUSED : Unfold (identifier les 5 touchpoints clés de l'expérience)
> Adaptation : on ne cherche pas à réduire à 5 touchpoints (la capacité de livraison est plus élevée avec IA + dev), on cherche à vérifier que l'agent a bien compris ce qui crée de la valeur, à quel endroit et pourquoi.

### Ce que fait l'agent

L'agent questionne le client sur le parcours utilisateur de manière conversationnelle — les étapes, les embranchements, les décisions, les moments clés. On ne cherche pas l'exhaustivité d'un user journey mapping complet, on cherche la structure :
- "Votre utilisateur arrive, il fait quoi d'abord ?"
- "Et là il a des choix ?"
- "Qu'est-ce qui se passe s'il va à gauche vs à droite ?"

**On parle features maintenant** — pas de solution technique ("une API REST qui…") mais oui des blocs fonctionnels ("un tableau de bord", "une étape de validation", "une notification"). Le "comment" fonctionnel est bienvenu, c'est le "comment technique" qu'on n'arbitre pas.

**Les ramifications** : l'agent explore les embranchements du parcours sans partir dans un détail excessif. "Et si l'utilisateur est un admin plutôt qu'un simple utilisateur, le parcours change ?" — "Qu'est-ce qui se passe si la validation est refusée ?" On couvre la largeur avant la profondeur.

### Le side panel en live
Pendant que la conversation avance, le panneau latéral construit et met à jour un schéma du parcours — des blocs "moment / étape / décision" reliés entre eux, chaque bloc commençant à être cadré dans une logique de feature macro. C'est le début de la transformation visible du besoin en CDC produit. Le client voit son projet prendre forme en temps réel.

Technologie et niveau de dynamisme à définir (mermaid, React, canvas…).

### Point de bascule potentiel client → freelance
Cette étape est possiblement le moment où l'input client commence à ne plus suffire et où le freelance intervient pour enrichir/structurer. Le séquençage exact des interactions client / IA / freelance est défini par ailleurs dans le parcours SaaS.

### Livrable de fin d'étape 3
- Le **schéma du parcours utilisateur** structuré en blocs fonctionnels macro (moments, étapes, décisions, features), avec les ramifications principales identifiées
- C'est le **premier artefact qui ressemble à un début de CDC visuel**

---

## Étape 4 — INSPIRATIONS & RÉFÉRENCES (adapté de Steal)

> Origine FOCUSED : Steal (les Gold Nuggets — s'inspirer de l'existant)
> Adaptation : deux modules distincts avec des temporalités et des destinataires différents.

### Module A — Côté client (optionnel, dans la conversation)

L'agent demande simplement si le client a des inspirations, des références, des produits qu'il aime bien. Si oui, le client peut :
- Nommer des produits
- Envoyer des liens (même une landing page suffit)
- Faire des screenshots
- Partager des slides

L'agent/LLM est capable de bencher seul ce qu'il reçoit — il regarde le lien, identifie ce qui est intéressant, et demande des précisions si besoin ("C'est le parcours d'inscription qui vous plaît chez eux, ou plutôt le dashboard ?"). Si le client n'a pas d'inspiration particulière, on passe, on ne le force pas.

C'est un module d'enrichissement RAG quand il sera en place côté client.

**Livrable module A** : une collection de références brutes annotées par l'IA (raisons de pertinence, features concernées).

### Module B — Côté IA → Presta (feature à part entière, en différé)

L'IA prend tout le contexte accumulé (contexte, use cases, parcours, proposition de valeur, éventuelles références client) et produit un **benchmark préliminaire d'inspirations**. Elle cherche des produits, des patterns, des approches qui répondent à des problématiques similaires, et elle explique pourquoi c'est pertinent et quelles features du projet sont concernées.

Le presta reçoit ce travail, l'enrichit avec ses propres connaissances et arbitrages, et le restitue au client dans un format très visuel — moodboard, pitch deck, vidéos courtes, screenshots annotés. Du contenu trié sur le volet qui projette le client dans ce que son produit pourrait être.

**Objectif business** : décharger le presta d'une tâche chronophage (le benchmark est du data crunching + mise en forme, délégable à l'IA), et renforcer la valeur perçue aux yeux du client ("ils ont fait un vrai travail de recherche") sur un livrable qui impressionne visuellement. Analogie : les tables de comparables de valorisation financière produites par les juniors en banque d'affaire.

**Livrable module B** : un **pitch deck / moodboard d'inspirations annexe** — ce n'est PAS dans le CDC, c'est un livrable offert au client "courtesy of your freelance". Chaque référence est associée aux features et étapes du parcours qu'elle concerne, avec les raisons de pertinence.

---

## Étape 5 — MATÉRIALISER (adapté de Execute)

> Origine FOCUSED : Execute (construire le Happy Path / prototype)
> Adaptation : on génère un CDC v1 et optionnellement un front low-fi, puis on entre en boucle d'itération co-construite.

### Ce qui se passe

L'IA prend toute la matière accumulée et génère deux livrables potentiels, selon la nature du projet :

#### Livrable 1 — Le CDC v1 (toujours produit)
Un cahier des charges structuré, généré à partir de tout le contexte conversationnel. Premier passage du "besoin exprimé" à un "document exploitable par un dev".

#### Livrable 2 — Le front low-fi (optionnel, selon le projet)
Pour les projets visuels, un prototype front dynamique (desktop ou mobile first selon le projet) avec les parcours cliquables mais raccordé à rien en back. Les clics et actions de parcours existent. Déployé sur Vercel, code sur GitHub, partageable en un lien.

Pas une maquette pixel perfect — juste assez pour que le client se projette dans le parcours. Pas en mode "maquette", en mode "projection rapide".

L'arbitrage de produire ou non le front low-fi est soit automatique (basé sur la nature du projet), soit fait par le presta.

Généré par des agents exécutants orchestrés, en quelques clics du presta.

### La boucle d'itération (co-construction du CDC)

Le CDC v1 + front optionnel sont partagés au client. À partir de là, le mode change — on passe en co-construction :

- Le **client** ET le **presta** peuvent interagir avec le bot conversationnel, en synchrone ou asynchrone
- Le client donne ses retours, l'IA les reformule et les structure pour le presta
- Le presta échange avec l'IA pour construire les itérations
- **Seul le presta** peut déclencher la publication d'une nouvelle version au client — mécanisme de validation qui évite que le client voie du travail en cours non arbitré
- Sur action du presta uniquement : itération du CDC + en option mise à jour du front

**Multi-user** : prévoir un système de rôles côté presta comme côté client — certains sont commentateurs, d'autres éditeurs / conversateurs avec l'IA. Pour les phases de review de CDC impliquant plusieurs intervenants.

### Livrable de fin d'étape 5
- **CDC vN** (itéré et stabilisé après N boucles de co-construction)
- Optionnellement : **front low-fi déployé** et partageable

---

## Étape 6 — FINALISER ET S'ENGAGER (adapté de Decide)

> Origine FOCUSED : Decide (Go / No Go)
> Adaptation : ce n'est plus un Go/No Go binaire interne, c'est la phase d'engagement commercial — la réalité budget rencontre les ambitions du CDC.

### Ce qui se passe

On sort du bot conversationnel, on est sur de l'interface SaaS et de l'interaction directe presta/client :

- **Édition détaillée du CDC** : mode éditeur, pas conversation
- **Génération du devis** : inputs pour générer le devis à moindre effort, avec ses différentes sections à valeur ajoutée
- **Arbitrage scope/budget** : sélection de features in/out, estimation j/h, négociation planning
- **Clarification finale du scope** : la réalité budget confronte les ambitions du CDC
- **Validation et signature** : le client valide un scope + budget + planning

### Le rôle de l'IA
Support et automatisation ponctuelle — générer un planning à partir du scope, pré-remplir des sections du devis, proposer des scénarios de découpage en lots, scripts assistés. Mais le moteur c'est l'interaction humaine dans l'interface : commentaires, cases à cocher, inputs modifiables, validations, signature.

### Livrable final
- **CDC finalisé** et validé par les deux parties
- **Devis signé** avec scope, budget et planning
- Le Go qui déclenche l'exécution du projet

### Note de design
La fluidité de la transition entre "CDC stabilisé" (fin étape 5) et "début de la négociation commerciale" (étape 6) est un sujet de design UX à part entière. Ce n'est pas un switch binaire, c'est un glissement progressif. La séparation volontaire entre construction du rêve et confrontation au budget est une stratégie commerciale : le client qui a vu son projet matérialisé est beaucoup plus engagé que celui à qui on parle d'argent au deuxième échange.

---

## Récapitulatif des étapes et livrables

| Étape | Nom adapté | Mode principal | Livrable |
|-------|-----------|----------------|----------|
| 1 | Comprendre | Conversation IA ↔ Client | Fiche contexte + use cases + scénario idéal + indicateur de réussite |
| 2 | La promesse en une phrase | Choix multiple (IA propose, client sélectionne) | Phrase de proposition de valeur validée |
| 3 | Structurer le parcours | Conversation IA ↔ Client + schéma live side panel | Schéma parcours en blocs fonctionnels macro |
| 4 | Inspirations & Références | Module A : conversation client (optionnel) / Module B : IA → Presta (différé) | A : Références annotées / B : Pitch deck inspirations (annexe, hors CDC) |
| 5 | Matérialiser | IA génère CDC v1 + front optionnel → boucle co-construction Client ↔ Presta ↔ IA | CDC vN stabilisé + front low-fi optionnel |
| 6 | Finaliser et s'engager | Interface SaaS, interaction directe Presta ↔ Client | CDC final + Devis signé + Planning |

---

## Correspondance avec FOCUSED original

| FOCUSED | Étape adaptée | Ce qui a changé |
|---------|--------------|-----------------|
| Frame | → Étape 1 (fusionné avec Observe) | Simplifié, pas de Damage Control ni métriques, entonnoir vulgarisé |
| Observe | → Étape 1 (fusionné avec Frame) | Pas d'observation terrain, le client décrit ses use cases, l'agent creuse |
| Claim | → Étape 2 | Launch Tweet → choix multiple de phrases de proposition de valeur |
| Unfold | → Étape 3 | Pas de réduction à 5 touchpoints, on structure le parcours en blocs features |
| Steal | → Étape 4 | Scindé en 2 modules (client optionnel + IA→Presta en différé) |
| Execute | → Étape 5 | Prototype → CDC v1 + front low-fi optionnel + boucle d'itération |
| Decide | → Étape 6 | Go/No Go → phase commerciale complète (devis, négo, signature) |

---

## Notes d'implémentation pour Claude Code

### Contexte produit
Ce document décrit la méthodologie de discovery produit qui doit être transcrite en prompts, skills et logique conversationnelle pour l'agent IA du SaaS. L'agent guide principalement le client (étapes 1-3), puis le presta intervient progressivement (étapes 3-5), avant que l'interface SaaS prenne le relais pour la phase commerciale (étape 6).

### Parcours multi-utilisateurs
Au-delà de cette méthodologie, il existe un parcours d'interaction séquencé et adaptable entre client / IA / freelance. La méthodologie décrite ici concerne le "quoi demander et dans quel ordre" — le parcours SaaS gère le "qui interagit quand et avec quels droits". Les deux doivent être mergés.

### Principes de design à respecter
- Ton du consultant posé, pas d'enthousiasme artificiel
- Questions à but clair, jamais de question pour rien
- Effort de réflexion minimal pour le client
- Pas de jargon produit, pas d'acronymes
- Modules conditionnels (pas de branches systématiques)
- Side panel live pour le schéma de parcours (étape 3)
- Choix multiples pour les moments de validation (étape 2)
- Multi-user avec rôles (commentateur / éditeur) dans la boucle d'itération (étape 5)
- Séparation volontaire rêve / budget (contraintes financières en étape 6 uniquement)
