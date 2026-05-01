const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, it } = require('node:test');

const { server, messages } = require('../webhook-server');

const VERIFY_TOKEN = '533fe35fb07f1005ced1b699a28e11113b6d8e6a5ce3f78e1acaad8a35a4d4da';
let baseUrl;

function listen(serverInstance) {
  return new Promise((resolve) => {
    serverInstance.listen(0, '127.0.0.1', () => {
      const address = serverInstance.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('legacy webhook server error handling', () => {
  before(async () => {
    baseUrl = await listen(server);
  });

  after(async () => {
    await close(server);
  });

  beforeEach(() => {
    messages.length = 0;
  });

  it('preserves the valid Meta challenge response', async () => {
    const response = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc123`);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'abc123');
  });

  it('returns normalized JSON for invalid verification tokens', async () => {
    const response = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc123`);
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.success, false);
    assert.equal(payload.code, 'WEBHOOK_VERIFY_TOKEN_INVALID');
    assert.equal(response.headers.get('x-request-id'), payload.requestId);
  });

  it('returns normalized JSON for malformed webhook JSON', async () => {
    const response = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json',
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.success, false);
    assert.equal(payload.code, 'WEBHOOK_PAYLOAD_INVALID');
    assert.equal(payload.errorInfo.status, 400);
  });

  it('returns normalized JSON for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/unknown`);
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.success, false);
    assert.equal(payload.code, 'ROUTE_NOT_FOUND');
  });
});
