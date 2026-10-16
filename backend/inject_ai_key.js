const { getDB } = require('./db');

async function updateAI() {
  const db = await getDB();
  await db.run(
    'UPDATE workspaces SET ai_provider = ?, ai_api_key = ?, ai_base_url = ?, ai_model = ? WHERE id = 1',
    [
      'custom',
      'SDD1V84-F1EMHXV-H0B7XHQ-3ZT4HS5',
      'https://area-51-anything-llm.mypaeg.easypanel.host/api/v1/openai',
      'workspace'
    ]
  );
  console.log("Workspace 1 updated with Anything LLM.");
}
updateAI();
