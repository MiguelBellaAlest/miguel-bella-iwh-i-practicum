require('dotenv').config({ quiet: true });
const path = require('node:path');
const express = require('express');
const axios = require('axios');

const PROPERTIES = ['name', 'author', 'genre'];
const MAX_LENGTH = { name: 200, author: 200, genre: 120 };
const LABELS = { name: 'Título', author: 'Autor', genre: 'Gênero' };

function validateConfig(env) {
  if (env.HUBSPOT_TEST_ACCOUNT_CONFIRMED !== 'true') {
    throw new Error('Confirme a developer TEST account no .env antes de iniciar.');
  }
  if (!env.HUBSPOT_PRIVATE_APP_TOKEN?.trim()) {
    throw new Error('Preencha HUBSPOT_PRIVATE_APP_TOKEN no .env. Nunca envie o token ao GitHub.');
  }
  if (!/^2-\d+$/.test(env.HUBSPOT_OBJECT_TYPE_ID || '')) {
    throw new Error('Execute npm run setup ou preencha HUBSPOT_OBJECT_TYPE_ID com o ID 2-... real.');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535.');
  }
  return { token: env.HUBSPOT_PRIVATE_APP_TOKEN.trim(), objectType: env.HUBSPOT_OBJECT_TYPE_ID, port };
}

function createClient(token) {
  return axios.create({
    baseURL: 'https://api.hubapi.com',
    timeout: 15000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
}

function isRecordId(value) {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function formData(body) {
  const values = {};
  const errors = [];
  for (const key of PROPERTIES) {
    const value = body?.[key];
    values[key] = typeof value === 'string' ? value.trim() : '';
    if (!values[key]) errors.push(`${LABELS[key]} é obrigatório.`);
    else if (values[key].length > MAX_LENGTH[key]) {
      errors.push(`${LABELS[key]} deve ter no máximo ${MAX_LENGTH[key]} caracteres.`);
    }
  }
  return { values, errors };
}

function createApp({ client, objectType, logger = console }) {
  if (!/^2-\d+$/.test(objectType || '')) throw new Error('Object type ID inválido.');
  const app = express();
  const objectPath = `/crm/v3/objects/${objectType}`;
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  app.disable('x-powered-by');
  app.set('view engine', 'pug');
  app.set('views', path.join(__dirname, 'views'));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store'
    });
    next();
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // ROUTE 1: list custom object records and render the new homepage template.
  app.get('/', asyncRoute(async (req, res) => {
    const after = req.query.after;
    if (after !== undefined && !isRecordId(after)) {
      return res.status(400).render('error', { title: 'Página inválida', message: 'Cursor de paginação inválido.' });
    }
    const params = { properties: PROPERTIES.join(','), limit: 100, archived: false };
    if (after) params.after = after;
    const response = await client.get(objectPath, { params });
    const nextAfter = response.data.paging?.next?.after;
    res.render('homepage', {
      title: 'Custom Objects | Integrating With HubSpot I Practicum',
      data: response.data.results,
      nextPage: nextAfter == null ? null : `/?after=${encodeURIComponent(String(nextAfter))}`
    });
  }));

  // ROUTE 2: render the form. An optional record ID enables editing.
  app.get('/update-cobj', asyncRoute(async (req, res) => {
    const id = req.query.id;
    if (id !== undefined && !isRecordId(id)) {
      return res.status(400).render('error', { title: 'Registro inválido', message: 'ID de registro inválido.' });
    }
    let values = {};
    if (id) {
      const response = await client.get(`${objectPath}/${id}`, { params: { properties: PROPERTIES.join(',') } });
      values = response.data.properties || {};
    }
    res.render('updates', {
      title: 'Update Custom Object Form | Integrating With HubSpot I Practicum',
      values, errors: [], recordId: id || ''
    });
  }));

  // ROUTE 3: create or update one custom object record, then redirect home.
  app.post('/update-cobj', asyncRoute(async (req, res) => {
    const origin = req.get('origin');
    if (origin && origin !== `http://${req.get('host')}`) {
      return res.status(403).render('error', { title: 'Solicitação bloqueada', message: 'Abra o formulário neste aplicativo antes de enviar.' });
    }
    const { values, errors } = formData(req.body);
    const recordId = req.body.recordId === undefined ? '' : req.body.recordId;
    if (typeof recordId !== 'string' || (recordId !== '' && !isRecordId(recordId))) {
      return res.status(400).render('error', { title: 'Registro inválido', message: 'ID de registro inválido.' });
    }
    if (errors.length) {
      return res.status(400).render('updates', {
        title: 'Update Custom Object Form | Integrating With HubSpot I Practicum',
        values, errors, recordId
      });
    }
    const payload = { properties: values };
    if (recordId) await client.patch(`${objectPath}/${recordId}`, payload);
    else await client.post(objectPath, payload);
    res.redirect(303, '/');
  }));

  app.use((req, res) => res.status(404).render('error', {
    title: 'Página não encontrada', message: 'Este endereço não existe no aplicativo.'
  }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.response?.status;
    const messages = {
      401: 'Token inválido ou expirado. Confira o private app da conta de teste.',
      403: 'Acesso negado. Confira os scopes e a disponibilidade de custom objects na conta de teste.',
      404: 'Objeto ou registro não encontrado. Confira HUBSPOT_OBJECT_TYPE_ID e a conta de teste.',
      429: 'Limite temporário da API. Aguarde um pouco antes de tentar novamente.'
    };
    // Do not log Axios errors: they may contain the Authorization header/token.
    logger.error('Falha na operação', { upstreamStatus: Number.isInteger(status) ? status : null });
    if (error.type === 'entity.too.large') {
      return res.status(413).render('error', { title: 'Formulário muito grande', message: 'Reduza o tamanho dos campos e tente novamente.' });
    }
    res.status(status === 429 ? 503 : 502).render('error', {
      title: 'Não foi possível concluir',
      message: messages[status] || 'Não foi possível comunicar com a API. Confira a conexão, o schema e as propriedades e tente novamente.'
    });
  });
  return app;
}

if (require.main === module) {
  try {
    const config = validateConfig(process.env);
    const app = createApp({ client: createClient(config.token), objectType: config.objectType });
    const server = app.listen(config.port, '127.0.0.1', () => {
      console.log(`Aplicativo local: http://localhost:${config.port}`);
    });
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? 'Porta ocupada. Altere PORT no .env.' : 'Não foi possível iniciar o servidor.');
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createApp, createClient, validateConfig, formData };
