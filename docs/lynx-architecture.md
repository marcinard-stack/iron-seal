Ok c# LYNX — Architecture technique du module conversationnel IA

> Ce document décrit l'architecture technique de l'agent conversationnel IA d'Iron Seal.
> Référence méthodologique : `docs/methodo-discovery.md`

---

## 1. Comment on exploite le LLM

### Le modèle

On utilise l'API Anthropic (Claude Sonnet ou Haiku) via des appels HTTP depuis notre API serverless Vercel. Le LLM ne tourne pas chez nous — on envoie un prompt, on reçoit une réponse.

### Le flow d'un message

```
User tape un message dans le chat
       ↓
Frontend envoie le message à notre API (/api/chat)
       ↓
Notre API construit le payload :
  - System prompt (instructions de comportement)
  - Contexte accumulé (résumé structuré du projet)
  - Historique récent de la conversation (derniers N messages)
  - Le nouveau message du user
       ↓
Notre API appelle l'API Anthropic (POST /v1/messages)
       ↓
Claude répond (texte + éventuellement des tool calls)
       ↓
Notre API traite les tool calls (ex: créer une feature en DB)
       ↓
Notre API renvoie la réponse au frontend
       ↓
Le frontend affiche la réponse + met à jour le side panel si besoin
```

### Ce qu'on envoie à chaque appel

À chaque message, on envoie à Claude :

1. **System prompt** (~1000-2000 tokens) : les instructions de comportement, le ton, la méthodologie, l'étape actuelle
2. **Contexte structuré** (~500-2000 tokens) : un JSON/texte résumé de tout ce qu'on sait du projet (pas la conversation brute, un résumé intelligent)
3. **Historique récent** (~derniers 10-20 messages) : pour la continuité conversationnelle
4. **Tools disponibles** : les fonctions que Claude peut appeler

**On n'envoie PAS toute la conversation** — ça coûterait trop cher et on dépasserait la fenêtre de contexte. On maintient un résumé.

---

## 2. Les types de prompts

### System Prompt (le cerveau)

C'est l'instruction principale qui définit le comportement de l'agent. Il change selon l'étape :

```
Étape 1 → system_prompt_comprendre.md
Étape 2 → system_prompt_promesse.md
Étape 3 → system_prompt_parcours.md
Étape 5 → system_prompt_materialiser.md
```

Chaque system prompt contient :
- **Rôle** : "Tu es un consultant en cadrage de projet IT..."
- **Ton** : "Posé, professionnel, pas d'enthousiasme artificiel..."
- **Objectif de l'étape** : "Comprendre le contexte, identifier les use cases..."
- **Ce qu'il faut faire** : les axes de questionnement
- **Ce qu'il ne faut PAS faire** : les erreurs à éviter
- **Format de sortie** : comment structurer les tool calls
- **Critères de transition** : quand proposer de passer à l'étape suivante

### Contexte accumulé (la mémoire)

Un document structuré qui s'enrichit au fil de la conversation :

```json
{
  "etape_courante": "comprendre",
  "client": {
    "nom": "CarJager",
    "secteur": "Automobile, marketplace B2B",
    "taille": "15 personnes, 5 commerciaux"
  },
  "problemes": [
    {
      "description": "Les commerciaux perdent 2h/jour à chercher les leads",
      "frequence": "Quotidien",
      "gravite": "Haute",
      "personas": ["Commercial terrain", "Manager sales"]
    }
  ],
  "scenario_ideal": "Le commercial ouvre son CRM le matin et voit immédiatement...",
  "use_case_principal": "Centraliser le suivi des leads en un cockpit unique",
  "proposition_valeur": null,
  "parcours": [],
  "features_draft": []
}
```

Ce contexte est :
- **Mis à jour par les tool calls** de Claude (ex: `update_context("problemes", [...])`)
- **Injecté dans chaque appel** comme partie du system prompt
- **Stocké en DB** sur la conversation (pas perdu si le user revient demain)
- **La base du futur RAG** — aujourd'hui le contexte vient de la conversation, demain il viendra aussi de documents uploadés

### Prompts métier (les instructions spécifiques)

En plus du system prompt, on peut injecter des instructions contextuelles :
- Si le client est dans le secteur "SaaS" → ajouter des questions sur le modèle de pricing
- Si le freelance a configuré des templates de features → les proposer comme base
- Si le projet est un "refacto" vs "création" → adapter les questions

Ces prompts métier sont des fragments injectés conditionnellement dans le system prompt.

---

## 3. Les Tool Calls (les actions)

Claude peut appeler des fonctions pour agir sur les données. C'est natif dans l'API Anthropic :

### Outils de contexte
```
update_context(section, data)     → Met à jour une section du contexte structuré
propose_choices(question, options) → Affiche un choix multiple au user (UI)
transition_step(next_step)        → Propose de passer à l'étape suivante
```

### Outils de CDC
```
create_feature(title, description, priority, is_transverse)
create_job(feature_code, description, jh, type, priority)
update_feature(feature_code, updates)
create_exclusion(title, description)
```

### Outils d'interaction
```
ask_freelance(question)           → Pose une question au freelance spécifiquement
summarize_for_client(content)     → Reformule un contenu technique pour le client
request_document(type, reason)    → Demande au client de fournir un document
```

Quand Claude renvoie un tool call, notre API :
1. Exécute la fonction (ex: INSERT INTO features...)
2. Renvoie le résultat à Claude
3. Claude continue sa réponse en tenant compte du résultat

---

## 4. Le RAG (futur)

### Ce que c'est

RAG = Retrieval Augmented Generation. Au lieu de tout mettre dans le prompt (limité en taille), on stocke les documents du client dans une base vectorielle et on récupère les passages pertinents à la volée.

### Comment ça marchera

```
1. Le client upload un document (PDF, slides, Notion export...)
2. On découpe le document en chunks (~500 tokens chacun)
3. On génère un embedding (vecteur numérique) pour chaque chunk via l'API
4. On stocke les embeddings dans une base vectorielle (pgvector sur Neon, ou Pinecone)
5. Quand le user pose une question, on cherche les chunks les plus pertinents
6. On injecte ces chunks dans le prompt comme contexte supplémentaire
```

### Ce qu'on prépare maintenant

- La structure de contexte accumulé EST déjà une forme de RAG simplifié
- On stocke le contexte en JSONB dans la DB — quand le RAG arrivera, il viendra enrichir ce contexte
- L'architecture est compatible : le system prompt accepte déjà un bloc "contexte" variable

### Ce qu'on NE fait PAS maintenant

- Pas de base vectorielle
- Pas d'upload de documents
- Pas d'embeddings
- On se concentre sur le flow conversationnel pur

---

## 5. Les Skills — pertinence ici ?

### Ce que c'est

Une "skill" dans Claude Code c'est un prompt réutilisable encapsulé, déclenché par un slash command. C'est spécifique à Claude Code CLI, pas à l'API.

### Pour notre SaaS

On n'utilise PAS les skills Claude Code. On construit notre propre système équivalent via les **system prompts par étape** + les **tool calls**. C'est le même concept mais adapté à notre architecture :

- Skill Claude Code = `/commit` → déclenche un prompt pré-défini
- Notre équivalent = l'étape "Comprendre" → déclenche le system prompt de l'étape 1 avec les tools appropriés

Les "skills" de notre agent sont les étapes de la méthodologie, chacune avec son propre comportement.

---

## 6. L'entraînement / amélioration continue

### Ce qu'on NE fait PAS

On n'entraîne pas le modèle (fine-tuning). C'est coûteux, complexe, et inutile pour notre cas. Claude Sonnet est déjà excellent en cadrage de projet.

### Ce qu'on fait : le prompt engineering itératif

L'amélioration se fait en affinant les prompts :

1. **Test & learn** : on fait tourner des conversations de test, on identifie les faiblesses
2. **On ajuste les system prompts** : reformuler les instructions, ajouter des exemples, des contraintes
3. **On enrichit les few-shot examples** : donner à Claude des exemples de "bonne conversation" dans le prompt
4. **On affine les critères de transition** : quand exactement proposer de passer à l'étape suivante

### Le feedback loop en production

```
Conversation terminée
       ↓
Le freelance rate la conversation (1-5 étoiles) + commentaire libre
       ↓
On analyse les conversations mal notées
       ↓
On identifie le pattern (mauvaise question, transition trop tôt, ton inadapté)
       ↓
On ajuste le system prompt correspondant
       ↓
Toutes les futures conversations bénéficient de l'amélioration
```

### Les métriques à suivre

- **Taux de complétion** : combien de conversations arrivent jusqu'à la génération du CDC
- **Temps par étape** : une étape trop longue = questions pas assez ciblées
- **Nombre de messages par étape** : indicateur d'efficacité
- **Rating freelance** : satisfaction sur la qualité du CDC généré
- **Taux de modification post-génération** : si le freelance modifie beaucoup → le CDC généré n'était pas assez bon

---

## 7. Architecture technique résumée

```
┌─────────────────────────────────────────────┐
│                  Frontend                     │
│  Chat UI  │  Side Panel (contexte/parcours)   │
└─────────┬───────────────────────────┬─────────┘
          │ POST /api/chat            │ GET /api/chat/context
          ▼                           ▼
┌─────────────────────────────────────────────┐
│                  API (Vercel)                 │
│                                               │
│  1. Charge le system prompt de l'étape        │
│  2. Charge le contexte accumulé (DB)          │
│  3. Charge les N derniers messages (DB)       │
│  4. Construit le payload Anthropic            │
│  5. Appelle l'API Claude                      │
│  6. Traite les tool calls (DB writes)         │
│  7. Sauve le message + réponse en DB          │
│  8. Renvoie la réponse au frontend            │
│                                               │
└──────┬──────────────────────┬─────────────────┘
       │                      │
       ▼                      ▼
┌──────────────┐    ┌──────────────────┐
│  Neon (DB)   │    │  Anthropic API   │
│              │    │                  │
│ conversations│    │  Claude Sonnet   │
│ messages     │    │  (ou Haiku)      │
│ context_json │    │                  │
│ features     │    └──────────────────┘
│ jobs         │
│ ...          │
└──────────────┘
```

---

## Décisions à prendre

1. **Clé API Anthropic** : à configurer dans Vercel env vars
2. **Modèle** : Sonnet (meilleur) vs Haiku (moins cher) — tester les deux
3. **Streaming** : réponses en streaming (comme ChatGPT) ou en bloc ? Le streaming est mieux UX mais plus complexe côté Vercel serverless (max 30s de timeout)
4. **Limite de messages** : combien de messages garder dans l'historique envoyé à Claude ? (recommandation : 20 derniers)
5. **Limite de tokens** : budget max par appel ? (recommandation : 4096 tokens de réponse)
