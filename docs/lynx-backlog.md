# LYNX — Backlog features

## Retours test conversation #1 (2026-04-09)

### Fait / En cours
- [x] QCM cliquable quand l'IA propose des choix (+ "Toutes ces réponses" + custom)
- [x] Une seule question à la fois (pas 3-4 dans un message)
- [x] Tool calls : update_context, propose_choices, transition_step
- [x] Side panel fiche contexte live
- [x] Transition d'étape automatique

### Backlog features
- [ ] Ligne de vie / % de progression dans la discovery
- [ ] CTA "Accélérer" (⏩) — mode succinct, warning qualité
- [ ] CTA "Passer cette étape" (⏭) — skip avec avertissement
- [ ] Calibrer le nombre de questions par étape (6-8 max avant transition)
- [ ] Historique : pouvoir recharger une conversation existante (pas recréer)

## Retours test conversation #2 (2026-04-10)
- [x] Indicateur "est en train d'écrire" sur le PREMIER message aussi
- [x] Restaurer un effet de "unfold" / unwrap progressif du texte (typewriter word-by-word avec pauses naturelles)
- [x] Fix bug critique : réponse vide quand Claude ne fait qu'un tool_use (boucle agentique côté serveur)
- [x] Étape 2 (promesse) bouclait en QCM : QCM tagué "[Sélection validée]" + prompt machine à états strict
