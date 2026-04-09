# LYNX — Plan d'action détaillé

> Lot 1 : Chat conversationnel + Discovery + Génération CDC
> Streaming activé dès le départ

---

## Sprint 1 — Infrastructure chat (fondations)

### 1.1 Base de données
- [ ] Table `conversations` (id, project_id, created_by_user_id, current_step, context_json, created_at)
- [ ] Table `chat_messages` (id, conversation_id, role [user|assistant|system], content, tool_calls_json, user_id, created_at)
- [ ] Migration dans setup.js

### 1.2 API Chat
- [ ] Endpoint `/api/chat` (POST — envoyer un message, GET — charger l'historique)
- [ ] Configurer la clé API Anthropic dans Vercel
- [ ] Proxy vers l'API Anthropic avec streaming (SSE — Server-Sent Events)
- [ ] Sauvegarde des messages en DB (user + assistant)
- [ ] Chargement du contexte accumulé + derniers N messages
- [ ] Gestion du timeout Vercel (streaming contourne le 30s)

### 1.3 Interface chat basique
- [ ] Nouvelle page `/chat/:slug` (ou `/discovery/:slug`)
- [ ] Route dans vercel.json
- [ ] UI chat : liste de messages + input en bas
- [ ] Streaming : affichage progressif de la réponse (caractère par caractère)
- [ ] Design : charte Iron Seal, inspiré Claude/ChatGPT
- [ ] Responsive mobile

### 1.4 Premier system prompt (test)
- [ ] Un prompt générique "consultant en cadrage de projet" pour tester le flow
- [ ] Pas encore les étapes — juste valider que le chat marche end-to-end

**Livrable Sprint 1** : on peut ouvrir un chat, taper un message, voir la réponse streamée en temps réel. Les messages sont persistés en DB.

---

## Sprint 2 — Étape 1 "Comprendre" (premier vrai parcours)

### 2.1 System prompt étape 1
- [ ] Rédiger `system_prompt_comprendre.md` basé sur la méthodo
- [ ] Axes : contexte, problème, scénario rêvé, use cases
- [ ] Ton : consultant posé, pas de jargon, pas d'enthousiasme artificiel
- [ ] Modules conditionnels (analyse historique)
- [ ] Critères de transition vers étape 2

### 2.2 Contexte accumulé
- [ ] Structure JSON du contexte (client, problèmes, scénario idéal, etc.)
- [ ] Tool call `update_context` : Claude met à jour le contexte au fil de la conversation
- [ ] Stockage en `conversations.context_json`
- [ ] Le contexte est injecté dans chaque appel

### 2.3 Side panel — Fiche contexte
- [ ] Panel latéral droit qui affiche le contexte accumulé en live
- [ ] Se met à jour quand Claude appelle `update_context`
- [ ] Affichage : sections (Contexte, Problèmes, Scénario idéal, Use case principal)
- [ ] Indicateur de complétion par section (vide → en cours → complété)

### 2.4 Transition d'étape
- [ ] Tool call `transition_step` : Claude propose de passer à l'étape suivante
- [ ] UI : bandeau/bouton "Passer à l'étape suivante" que le user peut accepter ou reporter
- [ ] La transition met à jour `conversations.current_step`

**Livrable Sprint 2** : une vraie conversation de discovery étape 1. L'IA pose les bonnes questions, le contexte s'enrichit dans le side panel en live, et l'IA propose de passer à l'étape 2 quand c'est prêt.

---

## Sprint 3 — Étape 2 "La promesse" + Étape 3 "Parcours"

### 3.1 System prompt étape 2
- [ ] Rédiger `system_prompt_promesse.md`
- [ ] L'IA propose 3-5 formulations de proposition de valeur
- [ ] Tool call `propose_choices` : affiche un composant UI de sélection par clic
- [ ] Le client sélectionne, la proposition est stockée dans le contexte

### 3.2 Composant UI choix multiple
- [ ] Cards/pills cliquables (pas un select, pas du texte à taper)
- [ ] Possibilité de demander des reformulations
- [ ] Validation → stockage dans le contexte

### 3.3 System prompt étape 3
- [ ] Rédiger `system_prompt_parcours.md`
- [ ] Questions sur le parcours utilisateur, embranchements, décisions
- [ ] On parle features maintenant (blocs fonctionnels, pas technique)
- [ ] Tool call `update_context("parcours", [...])` pour structurer le parcours

### 3.4 Side panel — Parcours
- [ ] Affichage du parcours en blocs (bullet points indentés pour le MVP)
- [ ] Chaque bloc = une étape/décision/feature macro
- [ ] Se met à jour en live pendant la conversation

### 3.5 Point de bascule client → freelance
- [ ] À partir de l'étape 3, le freelance peut rejoindre la conversation
- [ ] L'IA adapte son ton/questions selon qui parle
- [ ] Indicateur visuel de qui est dans la conversation

**Livrable Sprint 3** : les 3 premières étapes de discovery fonctionnent. Le client peut passer de "Comprendre" → "Promesse" → "Parcours" avec l'IA qui guide à chaque étape.

---

## Sprint 4 — Étape 5 "Matérialiser" (génération CDC)

### 4.1 System prompt étape 5
- [ ] Rédiger `system_prompt_materialiser.md`
- [ ] L'IA prend tout le contexte et génère des features/jobs
- [ ] Tool calls : `create_feature`, `create_job`, `create_exclusion`

### 4.2 Génération CDC en DB
- [ ] L'IA appelle les tool calls pour insérer features/jobs dans la DB existante
- [ ] Les features générées apparaissent dans le side panel en live
- [ ] Lien vers le viewer pour voir le CDC complet

### 4.3 Itération via le chat
- [ ] Le user (freelance ou client) peut demander des ajustements via le chat
- [ ] "Ajoute un job pour les tests", "Monte ce job à 0.5 J/H", "Passe en nice to have"
- [ ] L'IA exécute les modifications via tool calls

### 4.4 Transition vers le draft
- [ ] Quand le CDC est stabilisé, le presta clique "Valider le CDC"
- [ ] Le projet passe en statut "draft" avec le CDC complet
- [ ] Redirection vers le viewer existant

**Livrable Sprint 4** : l'IA génère un CDC complet à partir de la conversation. Le CDC est visible dans le viewer existant. Le presta peut itérer via le chat avant de valider.

---

## Sprint 5 — Lien avec le parcours existant

### 5.1 Entrée dans le flow
- [ ] Depuis le dashboard, "Créer un projet" → choix : "Commencer la discovery" ou "Créer un draft vide"
- [ ] "Commencer la discovery" → crée un projet + conversation → ouvre le chat
- [ ] "Créer un draft vide" → comportement actuel

### 5.2 Navigation
- [ ] Le projet en mode "discovery" a un badge/statut spécifique dans le dashboard
- [ ] Accès au chat depuis le viewer (bouton "Revenir à la conversation")
- [ ] Accès au viewer depuis le chat (side panel ou bouton "Voir le CDC")

### 5.3 Multi-user
- [ ] Le freelance peut inviter le client dans la conversation (email + magic link)
- [ ] Rôles : le client peut parler dans le chat, le freelance peut parler + valider/publier
- [ ] Indicateur de présence dans le chat (qui est en ligne)

### 5.4 Polish
- [ ] Indicateur de progression des étapes (stepper en haut du chat)
- [ ] Historique : pouvoir relire les étapes précédentes
- [ ] Export : télécharger la fiche contexte en PDF

**Livrable Sprint 5** : le flow complet est intégré dans Iron Seal. Un freelance crée un projet, lance la discovery, invite son client, et arrive à un CDC validé prêt pour le devis.

---

## Décisions actées

| Décision | Choix |
|---|---|
| Streaming | Oui, dès le Sprint 1 (SSE) |
| Modèle initial | Sonnet (test Haiku en parallèle pour le coût) |
| Historique envoyé | 20 derniers messages |
| Tokens max réponse | 4096 |
| RAG | Pas dans le Lot 1 |
| Front low-fi | Pas dans le Lot 1 |
| Fine-tuning | Non, prompt engineering itératif |

---

## Ordre d'exécution

```
Sprint 1 (infra)     ████████░░░░░░░░░░░░  ~2-3 sessions
Sprint 2 (étape 1)   ░░░░░░░░████████░░░░  ~2-3 sessions
Sprint 3 (étapes 2+3)░░░░░░░░░░░░░░██████  ~2-3 sessions
Sprint 4 (étape 5)   ░░░░░░░░░░░░░░░░████  ~1-2 sessions
Sprint 5 (intégration)░░░░░░░░░░░░░░░░░░██  ~1-2 sessions
```
