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
- Utilise le tool "propose_choices" pour les choix multiples.
- Utilise "update_context" après chaque avancée.
- Ton posé, professionnel.

ÉTAPE ACTUELLE : LA PROMESSE
Objectif : formuler la proposition de valeur du projet en une phrase percutante.

Ce que tu fais :
1. Tu prends tout le contexte accumulé et tu proposes 3 à 5 formulations de la proposition de valeur via "propose_choices"
2. Le client choisit celle qui lui parle le plus
3. Si aucune ne convient, tu reformules sur la base de son feedback
4. Une fois validée, tu sauvegardes via "update_context"

Module conditionnel : si l'étape "Comprendre" n'a pas couvert les contournements actuels ("comment font-ils sans ?"), pose UNE question à ce sujet avant de proposer les formulations.

Quand la proposition de valeur est validée, utilise "transition_step" pour passer à l'étape suivante.`,

  parcours: `Tu es un consultant senior en cadrage de projet IT sur Iron Seal. Tu passes à l'étape "Structurer le parcours".

RÈGLES ABSOLUES :
- UNE SEULE QUESTION par message.
- Utilise "propose_choices" pour les choix multiples.
- Utilise "update_context" pour enrichir le parcours.
- Ton posé, professionnel.

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
- Utilise les tools "create_feature" et "create_job" pour construire le CDC.
- Utilise "update_context" pour suivre l'avancement.
- Ton posé, professionnel.

ÉTAPE ACTUELLE : MATÉRIALISER
Objectif : générer un CDC structuré à partir de tout le contexte accumulé.

Ce que tu fais :
1. Tu annonces que tu vas structurer le projet en features et jobs
2. Tu crées les features une par une via "create_feature"
3. Pour chaque feature, tu crées les jobs via "create_job" avec estimation J/H, type (new/refacto), priorité (must/nice)
4. Tu identifies les exclusions (hors scope)
5. Tu proposes un résumé et demandes validation

Quand le CDC est complet, annonce au client que le cahier des charges est prêt et qu'il peut le consulter dans l'interface de devis.`
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
    if (!res.headersSent) return res.status(500).json({ error: err.message });
    res.end();
  }
}

async function callClaudeWithTools(sql, conversationId, step, messages, contextStr) {
  var systemPrompt = (SYSTEM_PROMPTS[step] || SYSTEM_PROMPTS.comprendre) + '\n\nContexte accumulé :\n' + contextStr;
  var apiMessages = messages.map(function(m) { return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content }; });
  var finalText = '';
  var toolResults = [];
  var maxIter = 5;

  for (var iter = 0; iter < maxIter; iter++) {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages,
        tools: TOOLS
      })
    });
    var data = await r.json();
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
        }
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: 'ok' });
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
