require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('../index');
const ROOT = path.resolve(__dirname, '..');
const SCHEMAS_PATH = '/crm-object-schemas/v3/schemas';

const schema = {
  name: 'practicum_books',
  labels: { singular: 'Livro', plural: 'Livros' },
  primaryDisplayProperty: 'name',
  secondaryDisplayProperties: ['author', 'genre'],
  requiredProperties: ['name', 'author', 'genre'],
  searchableProperties: ['name', 'author', 'genre'],
  associatedObjects: ['CONTACT'],
  properties: [
    { name: 'name', label: 'Name', type: 'string', fieldType: 'text' },
    { name: 'author', label: 'Author', type: 'string', fieldType: 'text' },
    { name: 'genre', label: 'Genre', type: 'string', fieldType: 'text' }
  ]
};

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(content) ? content.replace(pattern, () => line) : `${content.trimEnd()}\n${line}\n`;
}

function verifyExistingSchema(existing) {
  if (existing.primaryDisplayProperty !== 'name') throw new Error('Objeto existente com display property diferente. Nenhuma alteração realizada.');
  for (const required of schema.properties) {
    const found = existing.properties?.find(property => property.name === required.name);
    if (!found || found.type !== required.type || found.fieldType !== required.fieldType) {
      throw new Error('Objeto existente incompatível. Confira name, author e genre; nenhuma alteração realizada.');
    }
  }
}

async function ensureSchema(client) {
  const response = await client.get(SCHEMAS_PATH);
  if (!Array.isArray(response.data.results)) throw new Error('Resposta de schemas inesperada. Nenhuma criação realizada.');
  const existing = response.data.results.find(item => item.name === schema.name && !item.archived);
  if (existing) { verifyExistingSchema(existing); return { object: existing, created: false }; }
  const created = await client.post(SCHEMAS_PATH, schema);
  return { object: created.data, created: true };
}

async function main() {
  if (process.env.HUBSPOT_TEST_ACCOUNT_CONFIRMED !== 'true') {
    throw new Error('Confira token e Portal ID da developer TEST account e configure HUBSPOT_TEST_ACCOUNT_CONFIRMED=true.');
  }
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim();
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  if (!token) throw new Error('Preencha HUBSPOT_PRIVATE_APP_TOKEN no .env.');
  if (!/^\d+$/.test(portalId || '')) throw new Error('Preencha HUBSPOT_PORTAL_ID com o número real da conta de teste.');
  const result = await ensureSchema(createClient(token));
  const objectTypeId = result.object.objectTypeId || result.object.id;
  if (!/^2-\d+$/.test(objectTypeId || '')) throw new Error('A API não retornou um objectTypeId válido. Confira a conta de teste antes de repetir.');
  const envPath = path.join(ROOT, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  fs.writeFileSync(envPath, setEnvValue(envContent, 'HUBSPOT_OBJECT_TYPE_ID', objectTypeId), { mode: 0o600 });
  const url = `https://app.hubspot.com/contacts/${portalId}/objects/${objectTypeId}/views/all/list`;
  const readmePath = path.join(ROOT, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  fs.writeFileSync(readmePath, readme.replace(/(\*\*HubSpot developer test account custom objects URL:\*\* )[^\r\n]*/, (_, prefix) => `${prefix}${url}`));
  console.log(result.created ? 'Custom object Livros criado na conta informada.' : 'Custom object Livros compatível já existe; foi reutilizado.');
  console.log('HUBSPOT_OBJECT_TYPE_ID preenchido no .env. Link preenchido no README.');
  console.log('Confira o portal ao abrir o link; a confirmação de conta de teste é manual.');
  console.log(url);
  console.log('Próximo passo: npm test e npm start.');
}

if (require.main === module) {
  main().catch(error => {
    const status = error.response?.status;
    if (status) console.error(`HubSpot respondeu HTTP ${status}. Confira scopes, token e disponibilidade de custom objects na developer test account.`);
    else if (error.isAxiosError) console.error('Falha de rede ao acessar HubSpot. Confira a conexão e tente novamente.');
    else console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { schema, setEnvValue, ensureSchema, verifyExistingSchema, SCHEMAS_PATH };
