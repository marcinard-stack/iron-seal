import { neon } from '@neondatabase/serverless';

var SYSTEM_PROMPT_DEFAULT = `Tu es un consultant senior en cadrage de projet IT. Tu guides un client dans la discovery de son projet, étape par étape.

Ton ton : posé, professionnel, jamais dans l'enthousiasme artificiel. Pas de "Quelle excellente idée !" ni de "C'est super intéressant !". Tu reformules intelligemment pour montrer que tu as compris.

Tu poses des questions à but clair — jamais pour rien. Tu extrais du contexte important en demandant un effort minimal de réflexion au client. Pas d'acronymes, pas de jargon produit.

Tu t'adaptes au rythme du client : s'il est loquace, tu avances vite. S'il hésite, tu reformules, tu proposes des angles.

Étape actuelle : COMPRENDRE
Objectif : comprendre qui est le client, quel problème il veut résoudre, à quelle fréquence, pour qui, et à quoi ressemblerait la situation idéale.

Ce que tu fais :
- Tu commences par comprendre qui il est et ce que fait son entreprise
- Tu identifies le problème concret au quotidien
- Tu creuses : pourquoi c'est un problème, à quelle fréquence, quelle gravité, qui est touché
- Tu fais décrire le scénario rêvé ("Si demain tout marchait parfaitement, à quoi ressemblerait la journée de votre utilisateur ?")
- Tu ne poses PAS ces questions comme une checklist — tu rebondis sur ce que le client dit

Ce que tu ne fais PAS :
- Pas de demande de métriques long terme
- Pas de questions sur le budget ou les délais (ça viendra plus tard)
- Pas d'analyse historique sauf si le client l'aborde spontanément
- Pas de propositions de solutions techniques

Commence par te présenter brièvement et poser ta première question ouverte.`;

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

      // Create new conversation
      if (action === 'create') {
        if (!project_id) return res.status(400).json({ error: 'project_id required' });
        var convs = await sql`
          INSERT INTO conversations (project_id, created_by_user_id, current_step, context_json)
          VALUES (${project_id}, ${user ? user.id : null}, 'comprendre', '{}')
          RETURNING *
        `;
        var newConvId = convs[0].id;

        // Generate initial greeting via Claude
        var initialMessages = [
          { role: 'user', content: 'Commence la session de discovery.' }
        ];

        var response = await callClaude(SYSTEM_PROMPT_DEFAULT, initialMessages, '{}');

        // Save assistant message
        await sql`INSERT INTO chat_messages (conversation_id, role, content) VALUES (${newConvId}, 'assistant', ${response})`;

        return res.json({ conversation: convs[0], initial_message: response });
      }

      // Send message in existing conversation
      if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });
      if (!message) return res.status(400).json({ error: 'message required' });

      // Save user message
      await sql`INSERT INTO chat_messages (conversation_id, role, content, user_id) VALUES (${conversationId}, 'user', ${message}, ${user ? user.id : null})`;

      // Load conversation context + recent messages
      var conv = await sql`SELECT * FROM conversations WHERE id = ${conversationId}`;
      if (!conv.length) return res.status(404).json({ error: 'Conversation not found' });

      var recentMsgs = await sql`
        SELECT role, content FROM chat_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at DESC LIMIT 20
      `;
      recentMsgs.reverse();

      var contextStr = JSON.stringify(conv[0].context_json || {});

      // Stream response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      var systemPrompt = SYSTEM_PROMPT_DEFAULT + '\n\nContexte accumulé du projet :\n' + contextStr;

      var anthropicMessages = recentMsgs.map(function(m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
      });

      // Call Claude with streaming
      var anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: anthropicMessages,
          stream: true
        })
      });

      var fullResponse = '';
      var reader = anthropicRes.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      while (true) {
        var { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var line of lines) {
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              var parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
                fullResponse += parsed.delta.text;
                res.write('data: ' + JSON.stringify({ text: parsed.delta.text }) + '\n\n');
              }
            } catch (e) {}
          }
        }
      }

      // Save assistant response
      if (fullResponse) {
        await sql`INSERT INTO chat_messages (conversation_id, role, content) VALUES (${conversationId}, 'assistant', ${fullResponse})`;
        await sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}`;
      }

      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
    res.end();
  }
}

async function callClaude(systemPrompt, messages, contextStr) {
  var r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt + '\n\nContexte accumulé :\n' + contextStr,
      messages: messages.map(function(m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
      })
    })
  });
  var data = await r.json();
  return data.content && data.content[0] ? data.content[0].text : '';
}
