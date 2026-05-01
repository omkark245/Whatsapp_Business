const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const express = require('express');
const { body } = require('express-validator');

const auth = require('../src/middlewares/auth');
const errorHandler = require('../src/middlewares/errorHandler');
const requestId = require('../src/middlewares/requestId');
const validate = require('../src/middlewares/validate');
const {
  AppError,
  formatErrorPayload,
  normalizeError,
} = require('../src/utils/errors');

const openServers = [];

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      openServers.push(server);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function requestJson(app, path, options = {}) {
  const baseUrl = await listen(app);
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  return { response, payload };
}

function buildErrorApp() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.get('/protected', auth, (req, res) => res.json({ ok: true }));
  app.post('/validate', body('name').notEmpty().withMessage('Name is required'), validate, (req, res) => res.json({ ok: true }));
  app.get('/resource/:id', (req, res, next) => next(new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found')));
  app.use((req, res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found')));
  app.use(errorHandler);
  return app;
}

after(async () => {
  await Promise.all(openServers.map((server) => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  })));
});

test('formatErrorPayload emits legacy fields and nested errorInfo', () => {
  const normalized = {
    statusCode: 422,
    code: 'VALIDATION_FAILED',
    message: 'Validation failed',
    details: [{ field: 'name', message: 'Name is required' }],
  };
  const payload = formatErrorPayload(normalized, 'req-123', new Error('Validation failed'));

  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Validation failed');
  assert.equal(payload.code, 'VALIDATION_FAILED');
  assert.equal(payload.requestId, 'req-123');
  assert.deepEqual(payload.details, normalized.details);
  assert.deepEqual(payload.errorInfo, {
    message: 'Validation failed',
    code: 'VALIDATION_FAILED',
    status: 422,
    requestId: 'req-123',
    details: normalized.details,
  });
});

test('normalizeError handles AppError, validation, JWT, payload, Meta, Sequelize, and unknown errors', () => {
  assert.deepEqual(normalizeError(new AppError(404, 'CONTACT_NOT_FOUND', 'Contact not found')), {
    statusCode: 404,
    code: 'CONTACT_NOT_FOUND',
    message: 'Contact not found',
    details: [],
  });

  assert.equal(normalizeError({ name: 'TokenExpiredError' }).code, 'AUTH_TOKEN_EXPIRED');
  assert.equal(normalizeError({ type: 'entity.too.large' }).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(normalizeError({ code: 'LIMIT_FILE_SIZE' }).code, 'UPLOAD_TOO_LARGE');

  const meta = normalizeError({
    response: { status: 400, data: { error: { code: 131047, message: 'Outside window' } } },
  });
  assert.equal(meta.code, 'WHATSAPP_REENGAGEMENT_REQUIRED');
  assert.equal(meta.statusCode, 400);

  const metaObjectAccess = normalizeError({
    response: {
      status: 400,
      data: {
        error: {
          code: 100,
          error_subcode: 33,
          message: 'Unsupported get request. Object with ID does not exist, cannot be loaded due to missing permissions, or does not support this operation.',
        },
      },
    },
  });
  assert.equal(metaObjectAccess.code, 'META_PERMISSION_ERROR');
  assert.equal(metaObjectAccess.statusCode, 403);
  assert.match(metaObjectAccess.message, /WABA ID and Phone Number ID/);

  const duplicate = normalizeError({
    name: 'SequelizeUniqueConstraintError',
    errors: [{ path: 'email', message: 'email must be unique' }],
  });
  assert.equal(duplicate.code, 'DUPLICATE_RECORD');
  assert.deepEqual(duplicate.details, [{ field: 'email', message: 'email must be unique' }]);

  const unknown = normalizeError(new Error('boom'));
  assert.equal(unknown.statusCode, 500);
  assert.equal(unknown.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(unknown.message, 'Internal server error');
});

test('API errors include request IDs and the dual error shape', async () => {
  const app = buildErrorApp();
  const { response, payload } = await requestJson(app, '/missing', {
    headers: { 'X-Request-Id': 'test-request-id' },
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-request-id'), 'test-request-id');
  assert.equal(payload.success, false);
  assert.equal(payload.error, 'Route not found');
  assert.equal(payload.code, 'ROUTE_NOT_FOUND');
  assert.equal(payload.requestId, 'test-request-id');
  assert.equal(payload.errorInfo.status, 404);
});

test('auth-required errors use the normalized contract', async () => {
  const app = buildErrorApp();
  const { response, payload } = await requestJson(app, '/protected');

  assert.equal(response.status, 401);
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'AUTH_REQUIRED');
  assert.equal(payload.errorInfo.message, 'Authentication required');
});

test('validation errors expose details in both legacy and nested fields', async () => {
  const app = buildErrorApp();
  const { response, payload } = await requestJson(app, '/validate', {
    method: 'POST',
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 422);
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'VALIDATION_FAILED');
  assert.deepEqual(payload.details, [{ field: 'name', message: 'Name is required' }]);
  assert.deepEqual(payload.errorInfo.details, payload.details);
});

test('resource errors from controllers preserve standardized codes', async () => {
  const app = buildErrorApp();
  const { response, payload } = await requestJson(app, '/resource/1');

  assert.equal(response.status, 404);
  assert.equal(payload.code, 'CONTACT_NOT_FOUND');
  assert.equal(payload.errorInfo.status, 404);
});
