import { neon } from '@neondatabase/serverless';

var SYSTEM_PROMPTS = {
  comprendre: `Tu es un consultant senior en cadrage de projet IT sur la plateforme Iron Seal. Tu guides un client dans la discovery de son projet.

RÈGLES ABSOLUES :
- UNE SEULE QUESTION par message. Jamais deux. Jamais trois. Une seule.
- Quand tu proposes des options/possibilités, utilise TOUJOURS le tool "propose_choices" au lieu de les lister dans ton texte. Le tool affichera un composant visuel cliquable.
- Après chaque réponse du client, utilise le tool "update_context" pour sauvegarder ce que tu as appris.
- Ton : posé, professionnel, pas d'enthousiasme artificiel. Pas de "Quelle excellente idée !" ni de "C'est super intéressant !". Tu reformules intelligemment.
- Pas d'acronymes, pas de jargon produit.
- Tu t'adaptes : client loquace = tu avances vite, client hésitant = tu reformules.

ÉTAPE ACTUELLE : COMPRENDRE
Objectif : comprendre qui est le client, quel problème il veut résoudre, pour qui, et à quoi ressemblerait la situation idéale.

Progression (dans cet ordre, UNE question à la fois) :
1. Qui il est, ce que fait son entreprise/activité
2. Pourquoi il est là, qu'est-ce qui l'a poussé à vouloir ce projet
3. Quel est le problème concret au quotidien
4. Qui est touché par ce problème (quels profils/personas)
5. À quelle fréquence et quelle gravité
6. Le scénario rêvé : "Si demain tout marchait parfaitement, à quoi ressemblerait la journée de votre utilisateur ?"
7. Reformuler le use case principal et l'indicateur de réussite

Après 7-10 échanges, quand tu as couvert les points essentiels, utilise le tool "transition_step" pour proposer de passer à l'étape suivante.

Ce que tu ne fais PAS :
- Pas de métriques long terme
- Pas de questions sur le budget ou les délais
- Pas d'analyse historique sauf si le client l'aborde spontanément
- Pas de solutions techniques

Commence par te présenter brièvement (une phrase) et poser ta première question ouverte.`,

  promesse: `Tu es un consultant senior en cadrage de projet IT sur Iron Seal. Tu as terminé l'étape "Comprendre" et tu passes à l'étape "La promesse en une phrase".

RÈGLES ABSOLUES :
- UNE SEULE QUESTION par message.
- Utilise le tool "propose_choices" UNIQUEMENT pour le premier set de formulations. Pas en boucle.
- Utilise "update_context" après chaque avancée.
- Ton posé, professionnel.

ÉTAPE ACTUELLE : LA PROMESSE
Objectif : formuler la proposition de valeur du projet en une phrase percutante.

Machine à états (suis-la STRICTEMENT) :

État A — Premier passage :
1. Si l'étape "Comprendre" n'a pas couvert les contournements actuels ("comment font-ils sans aujourd'hui ?"), pose UNE question à ce sujet. Pas de propose_choices à ce stade.
2. Sinon, propose 3 à 5 formulations de proposition de valeur via "propose_choices". Une seule fois.

État B — Le client a répondu (notamment avec "[Sélection validée par le client dans le QCM] ...") :
- Le client a CHOISI. Tu ne reproposes JAMAIS de QCM à ce stade.
- Tu accuses réception en une phrase ("Très bien, on retient : ...")
- Tu sauvegardes via "update_context" (section: proposition_valeur)
- Tu appelles immédiatement "transition_step" avec next_step="parcours" et un summary court.
- C'est tout. Pas de question supplémentaire.

État C — Le client refuse explicitement les options ("aucune ne me parle", "je n'aime pas") :
- Tu lui demandes UNE question ouverte pour qu'il reformule lui-même.
- Tu ne reproposes PAS de QCM. Tu attends sa formulation libre, puis tu valides via update_context + transition_step.

INTERDICTIONS :
- Ne JAMAIS appeler "propose_choices" deux fois dans cette étape.
- Ne JAMAIS demander au client de "valider", "confirmer" ou "préciser" une option qu'il vient de cliquer dans un QCM. Le clic VAUT validation.`,

  parcours: `Tu es un consultant senior en cadrage de projet IT sur Iron Seal. Tu passes à l'étape "Structurer le parcours".

RÈGLES ABSOLUES :
- UNE SEULE QUESTION par message.
- Utilise "propose_choices" UNIQUEMENT quand tu offres un vrai choix discret au client (jamais en boucle sur la même question).
- Utilise "update_context" pour enrichir le parcours.
- Ton posé, professionnel.
- Quand le client répond avec "[Sélection validée par le client dans le QCM] ...", c'est une validation finale : tu accuses réception et tu avances. Tu NE reproposes JAMAIS la même question en QCM.

ÉTAPE ACTUELLE : STRUCTURER LE PARCOURS
Objectif : identifier le parcours utilisateur en blocs fonctionnels (étapes, décisions, features macro).

Ce que tu fais :
1. Tu questionnes sur le parcours utilisateur : "Votre utilisateur arrive, il fait quoi d'abord ?"
2. Tu explores les embranchements : "Et là il a des choix ?"
3. Tu identifies les features macro (pas techniques, fonctionnelles)
4. Tu couvres la largeur avant la profondeur
5. Tu mets à jour le parcours via "update_context" au fur et à mesure

On parle FEATURES maintenant — des blocs fonctionnels ("un tableau de bord", "une étape de validation"), pas de solutions techniques.

Après avoir couvert les parcours principaux (5-8 échanges), utilise "transition_step" pour passer à la matérialisation.`,

  materialiser: `Tu es un consultant senior en cadrage de projet IT sur Iron Seal. Tu passes à l'étape "Matérialiser" — génération du CDC.

RÈGLES ABSOLUES :
- Utilise les tools "create_feature", "create_job" et "create_exclusion" pour construire le CDC.
- Ton posé, professionnel, factuel.
- PAS de longue dissertation. Le client n'a pas besoin de relire ce qu'il vient de te dire.

ÉTAPE ACTUELLE : MATÉRIALISER
Objectif : générer un CDC structuré et complet à partir de tout le contexte accumulé, en UN SEUL message.

PROTOCOLE STRICT (suis-le à la lettre) :

1. Tu commences par UN SEUL court paragraphe d'intro (3-4 lignes max) annonçant ce que tu vas faire.

2. Puis tu enchaînes IMMÉDIATEMENT, dans le MÊME message, une série d'appels d'outils :
   - Pour chaque feature identifiée à partir du contexte parcours/use cases : un appel à "create_feature" (avec position 1, 2, 3...).
   - Juste après chaque feature, les "create_job" qui lui correspondent (avec feature_position pointant sur la feature qui vient d'être créée). 2 à 5 jobs par feature en moyenne.
   - À la fin, 3 à 6 "create_exclusion" pour les éléments hors scope identifiés (ce qui ne sera PAS fait — utile pour cadrer les attentes).

3. Tu génères TOUS les tool calls dans ce SEUL et même message. Pas de "je vais commencer par" → "voilà la première" → "maintenant la deuxième". Tu output tout d'un coup.

4. Une fois tous les tool calls passés, tu termines par un court message de conclusion (4-6 lignes) qui annonce :
   - Le nombre de features et jobs créés
   - Le total approximatif en jours/homme
   - Que le CDC est prêt à être consulté dans l'interface de devis

RÈGLES DE CHIFFRAGE :
- jh : utilise des valeurs réalistes (0.25, 0.5, 1, 2, 3, 5). Une feature complète se chiffre généralement entre 1 et 8 J/H au total.
- type : "new" pour création, "refacto" pour modification d'existant.
- priority : "must" pour l'essentiel (MVP), "nice" pour les options qui peuvent attendre une v2.
- Vise un total cohérent avec un projet de 15 à 40 J/H selon l'ampleur. Si le contexte évoque un MVP rapide, vise plus bas.

INTERDICTIONS :
- Ne JAMAIS lister les features en texte avant de les créer via le tool. Le tool EST la création — pas besoin de répéter en texte.
- Ne JAMAIS poser de question. C'est l'étape de génération automatique.
- Ne JAMAIS attendre une validation avant d'enchaîner les tool calls. Tout doit sortir d'un seul jet.`

};

var TOOLS = [
  {
    name: 'update_context',
    description: 'Met à jour une section du contexte structuré du projet. Utilise cet outil après chaque réponse du client pour sauvegarder ce que tu as appris.',
    input_schema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'Section à mettre à jour : client, problemes, scenario_ideal, use_case_principal, indicateur_reussite, proposition_valeur, parcours, contournements' },
        data: { description: 'Les données à stocker (objet ou texte)' }
      },
      required: ['section', 'data']
    }
  },
  {
    name: 'propose_choices',
    description: 'Affiche un composant de choix multiple cliquable au client. Utilise cet outil à chaque fois que tu proposes des options ou des possibilités au lieu de les lister dans ton texte.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'La question posée' },
        options: { type: 'array', items: { type: 'string' }, description: 'Les options proposées. Inclus toujours "Toutes ces réponses" si pertinent et "Autre (précisez)" en dernier.' }
      },
      required: ['question', 'options']
    }
  },
  {
    name: 'transition_step',
    description: 'Propose de passer à l\'étape suivante de la discovery. Utilise quand tu estimes avoir assez de contexte pour l\'étape courante.',
    input_schema: {
      type: 'object',
      properties: {
        next_step: { type: 'string', enum: ['promesse', 'parcours', 'materialiser'], description: 'L\'étape suivante' },
        summary: { type: 'string', description: 'Un bref résumé de ce qui a été couvert dans l\'étape courante' }
      },
      required: ['next_step', 'summary']
    }
  },
  {
    name: 'create_feature',
    description: 'Crée une feature (fonctionnalité macro) du cahier des charges. À appeler en premier, avant les jobs associés.',
    input_schema: {
      type: 'object',
      properties: {
        position: { type: 'integer', description: 'Ordre de la feature dans le CDC, à partir de 1' },
        code: { type: 'string', description: 'Code court ex: "FEAT 1". Optionnel.' },
        title: { type: 'string', description: 'Titre court de la feature' },
        description: { type: 'string', description: 'Description fonctionnelle' },
        is_transverse: { type: 'boolean', description: 'true si la feature est transverse (ex: prestations incluses, nettoyage)' }
      },
      required: ['position', 'title']
    }
  },
  {
    name: 'create_job',
    description: 'Crée un job (tâche technique chiffrée) appartenant à une feature. La feature doit avoir été créée plus tôt dans la même conversation. Référence par position.',
    input_schema: {
      type: 'object',
      properties: {
        feature_position: { type: 'integer', description: 'La position de la feature parent (telle que passée à create_feature)' },
        position: { type: 'integer', description: 'Ordre du job dans la feature, à partir de 1' },
        description: { type: 'string', description: 'Description technique du job' },
        jh: { type: 'number', description: 'Estimation en jours/homme (ex: 0.25, 0.5, 1, 2)' },
        type: { type: 'string', enum: ['new', 'refacto'], description: 'new = création, refacto = modification d\'existant' },
        priority: { type: 'string', enum: ['must', 'nice'], description: 'must = essentiel, nice = optionnel/v2' }
      },
      required: ['feature_position', 'description', 'jh', 'type', 'priority']
    }
  },
  {
    name: 'create_exclusion',
    description: 'Crée une exclusion (élément hors scope du projet, à expliciter au client).',
    input_schema: {
      type: 'object',
      properties: {
        position: { type: 'integer' },
        title: { type: 'string', description: 'Titre court' },
        description: { type: 'string', description: 'Pourquoi c\'est hors scope' }
      },
      required: ['title']
    }
  }
];

async function getUser(sql, req) {
  var auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (!auth) return null;
  var rows = await sql`SELECT u.id, u.name, u.email, u.account_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${auth} AND s.expires_at > NOW()`;
  return rows.length ? rows[0] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var sql = neon(process.env.DATABASE_URL);
  var conversationId = req.query.conversation_id;

  try {
    // GET: load conversation + messages
    if (req.method === 'GET') {
      if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });
      var conv = await sql`SELECT * FROM conversations WHERE id = ${conversationId}`;
      if (!conv.length) return res.status(404).json({ error: 'Conversation not found' });
      var msgs = await sql`SELECT id, role, content, user_id, created_at FROM chat_messages WHERE conversation_id = ${conversationId} ORDER BY created_at ASC`;
      return res.json({ conversation: conv[0], messages: msgs });
    }

    // POST: send a message (or create conversation)
    if (req.method === 'POST') {
      var user = await getUser(sql, req);
      var { action, message, project_id } = req.body;

      // Create new conversation (or load existing)
      if (action === 'create') {
        if (!project_id) return res.status(400).json({ error: 'project_id required' });
        // Check if conversation already exists for this project
        var existing = await sql`SELECT * FROM conversations WHERE project_id = ${project_id} ORDER BY created_at DESC LIMIT 1`;
        if (existing.length) {
          var msgs = await sql`SELECT id, role, content, tool_calls_json, user_id, created_at FROM chat_messages WHERE conversation_id = ${existing[0].id} ORDER BY created_at ASC`;
          return res.json({ conversation: existing[0], messages: msgs });
        }
        var convs = await sql`
          INSERT INTO conversations (project_id, created_by_user_id, current_step, context_json)
          VALUES (${project_id}, ${user ? user.id : null}, 'comprendre', '{}')
          RETURNING *
        `;
        var newConvId = convs[0].id;
        var response = await callClaudeWithTools(sql, newConvId, 'comprendre', [{ role: 'user', content: 'Commence la session de discovery.' }], '{}');
        await sql`INSERT INTO chat_messages (conversation_id, role, content, tool_calls_json) VALUES (${newConvId}, 'assistant', ${response.text}, ${response.toolResults ? JSON.stringify(response.toolResults) : null})`;
        return res.json({ conversation: convs[0], initial_message: response.text, tool_results: response.toolResults });
      }

      // Send message in existing conversation
      if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });
      if (!message) return res.status(400).json({ error: 'message required' });

      await sql`INSERT INTO chat_messages (conversation_id, role, content, user_id) VALUES (${conversationId}, 'user', ${message}, ${user ? user.id : null})`;

      var conv = await sql`SELECT * FROM conversations WHERE id = ${conversationId}`;
      if (!conv.length) return res.status(404).json({ error: 'Conversation not found' });

      var recentMsgs = await sql`SELECT role, content FROM chat_messages WHERE conversation_id = ${conversationId} ORDER BY created_at DESC LIMIT 20`;
      recentMsgs.reverse();

      var currentStep = conv[0].current_step || 'comprendre';
      var contextStr = JSON.stringify(conv[0].context_json || {});

      // Use non-streaming approach (reliable, handles tool calls properly)
      var response = await callClaudeWithTools(sql, parseInt(conversationId), currentStep, recentMsgs, contextStr);

      // Return as JSON (frontend will handle display)
      if (response.text.trim() || (response.toolResults && response.toolResults.length)) {
        await sql`INSERT INTO chat_messages (conversation_id, role, content, tool_calls_json) VALUES (${conversationId}, 'assistant', ${response.text.trim()}, ${response.toolResults ? JSON.stringify(response.toolResults) : null})`;
        await sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}`;
      }

      return res.json({ text: response.text, tool_results: response.toolResults, step: currentStep });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      var status = err.anthropicHttpStatus || 500;
      return res.status(status).json({
        error: err.message || 'Internal error',
        error_type: err.anthropicErrorType || 'server_error'
      });
    }
    res.end();
  }
}

async function callClaudeWithTools(sql, conversationId, step, messages, contextStr) {
  var systemPrompt = (SYSTEM_PROMPTS[step] || SYSTEM_PROMPTS.comprendre) + '\n\nContexte accumulé :\n' + contextStr;
  var apiMessages = messages.map(function(m) { return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content }; });
  var finalText = '';
  var toolResults = [];
  var isMaterialiser = step === 'materialiser';
  var maxIter = isMaterialiser ? 8 : 5;
  var maxTokens = isMaterialiser ? 8192 : 4096;

  // Fetch the project_id once — needed for create_feature/create_job/create_exclusion
  var convRow = await sql`SELECT project_id FROM conversations WHERE id = ${conversationId}`;
  var projectId = convRow.length ? convRow[0].project_id : null;

  for (var iter = 0; iter < maxIter; iter++) {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: maxTokens,
        system: systemPrompt,
        messages: apiMessages,
        tools: TOOLS
      })
    });
    var data = await r.json();
    // Anthropic returns { type: 'error', error: { type, message } } on failure
    if (data.type === 'error' || !r.ok) {
      var errMsg = data.error && data.error.message ? data.error.message : ('Anthropic API error (HTTP ' + r.status + ')');
      var errType = data.error && data.error.type ? data.error.type : 'api_error';
      var e = new Error(errMsg);
      e.anthropicErrorType = errType;
      e.anthropicHttpStatus = r.status;
      throw e;
    }
    if (!data.content) break;

    var hasToolUse = false;
    var toolResultBlocks = [];
    var iterText = '';

    for (var block of data.content) {
      if (block.type === 'text') {
        iterText += block.text;
      }
      if (block.type === 'tool_use') {
        hasToolUse = true;
        var resultContent = 'ok';
        if (block.name === 'update_context' && block.input) {
          var conv = await sql`SELECT context_json FROM conversations WHERE id = ${conversationId}`;
          var ctx = conv.length ? (conv[0].context_json || {}) : {};
          ctx[block.input.section] = block.input.data;
          await sql`UPDATE conversations SET context_json = ${JSON.stringify(ctx)}::jsonb WHERE id = ${conversationId}`;
          toolResults.push({ tool: 'update_context', section: block.input.section });
        } else if (block.name === 'propose_choices' && block.input) {
          toolResults.push({ tool: 'propose_choices', question: block.input.question, options: block.input.options });
        } else if (block.name === 'transition_step' && block.input) {
          await sql`UPDATE conversations SET current_step = ${block.input.next_step} WHERE id = ${conversationId}`;
          toolResults.push({ tool: 'transition_step', next_step: block.input.next_step, summary: block.input.summary });
        } else if (block.name === 'create_feature' && block.input && projectId) {
          var fi = block.input;
          var fcode = fi.code || ('FEAT ' + fi.position);
          try {
            var fRows = await sql`
              INSERT INTO features (project_id, position, code, title, description, is_transverse)
              VALUES (${projectId}, ${fi.position}, ${fcode}, ${fi.title}, ${fi.description || null}, ${fi.is_transverse || false})
              RETURNING id, position
            `;
            toolResults.push({ tool: 'create_feature', feature_id: fRows[0].id, position: fRows[0].position, title: fi.title });
            resultContent = 'Feature créée (id=' + fRows[0].id + ', position=' + fRows[0].position + ')';
          } catch (insErr) {
            resultContent = 'Erreur insertion feature : ' + insErr.message;
          }
        } else if (block.name === 'create_job' && block.input && projectId) {
          var ji = block.input;
          try {
            var feat = await sql`SELECT id FROM features WHERE project_id = ${projectId} AND position = ${ji.feature_position} ORDER BY id DESC LIMIT 1`;
            if (!feat.length) {
              resultContent = 'Erreur : aucune feature trouvée à la position ' + ji.feature_position + '. Crée la feature avant le job.';
            } else {
              var jRows = await sql`
                INSERT INTO jobs (feature_id, position, description, jh, type, priority, is_offered, included)
                VALUES (${feat[0].id}, ${ji.position || 1}, ${ji.description}, ${ji.jh}, ${ji.type}, ${ji.priority}, false, ${ji.priority === 'must'})
                RETURNING id
              `;
              toolResults.push({ tool: 'create_job', job_id: jRows[0].id, feature_position: ji.feature_position, jh: ji.jh });
              resultContent = 'Job créé (id=' + jRows[0].id + ')';
            }
          } catch (insErr2) {
            resultContent = 'Erreur insertion job : ' + insErr2.message;
          }
        } else if (block.name === 'create_exclusion' && block.input && projectId) {
          var ei = block.input;
          try {
            var eRows = await sql`
              INSERT INTO exclusions (project_id, position, title, description)
              VALUES (${projectId}, ${ei.position || 1}, ${ei.title}, ${ei.description || null})
              RETURNING id
            `;
            toolResults.push({ tool: 'create_exclusion', exclusion_id: eRows[0].id, title: ei.title });
            resultContent = 'Exclusion créée (id=' + eRows[0].id + ')';
          } catch (insErr3) {
            resultContent = 'Erreur insertion exclusion : ' + insErr3.message;
          }
        }
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: resultContent });
      }
    }

    finalText += iterText;

    if (!hasToolUse) break;

    // Append assistant turn (full content) + user tool_result turn for next iteration
    apiMessages.push({ role: 'assistant', content: data.content });
    apiMessages.push({ role: 'user', content: toolResultBlocks });
  }

  return { text: finalText, toolResults: toolResults.length ? toolResults : null };
}
