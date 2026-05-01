const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, it } = require('node:test');

const { server, processUserMessage, conversations, messages } = require('./chatbot-server');

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

async function readJson(response) {
  return response.json();
}

describe('Finlec Technologies Chatbot legacy server', () => {
  before(async () => {
    baseUrl = await listen(server);
  });

  after(async () => {
    await close(server);
  });

  beforeEach(() => {
    for (const key in conversations) delete conversations[key];
    messages.length = 0;
  });

  describe('webhook verification flow', () => {
    it('returns challenge text when token is valid', async () => {
      const response = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1158201444`);

      assert.equal(response.status, 200);
      assert.equal(await response.text(), '1158201444');
    });

    it('returns the dual error shape when token is invalid', async () => {
      const response = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=FAKE_HACKER_TOKEN&hub.challenge=1158201444`);
      const payload = await readJson(response);

      assert.equal(response.status, 403);
      assert.equal(payload.success, false);
      assert.equal(payload.error, 'Forbidden');
      assert.equal(payload.code, 'WEBHOOK_VERIFY_TOKEN_INVALID');
      assert.equal(payload.errorInfo.status, 403);
      assert.ok(payload.requestId);
      assert.equal(response.headers.get('x-request-id'), payload.requestId);
    });

    it('returns a normalized error for malformed webhook JSON', async () => {
      const response = await fetch(`${baseUrl}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad-json',
      });
      const payload = await readJson(response);

      assert.equal(response.status, 400);
      assert.equal(payload.success, false);
      assert.equal(payload.code, 'WEBHOOK_PAYLOAD_INVALID');
      assert.equal(payload.errorInfo.status, 400);
      assert.ok(payload.requestId);
    });

    it('returns a normalized not-found error for unknown routes', async () => {
      const response = await fetch(`${baseUrl}/does-not-exist`);
      const payload = await readJson(response);

      assert.equal(response.status, 404);
      assert.equal(payload.success, false);
      assert.equal(payload.code, 'ROUTE_NOT_FOUND');
      assert.deepEqual(payload.errorInfo.details[0].available, ['/webhook', '/api/status', '/api/courses', '/api/messages', '/api/conversations', '/']);
    });
  });

  describe('chatbot conversation logic', () => {
    const TEST_PHONE = '1234567890';

    it('welcomes a new user and stores them in the greeting state', () => {
      const reply = processUserMessage('Hi there!', TEST_PHONE);

      assert.match(reply, /Welcome to Finlec Technologies/);
      assert.ok(conversations[TEST_PHONE]);
      assert.equal(conversations[TEST_PHONE].state, 'greeting');
    });

    it('shifts user to viewing-course state when they select a course', () => {
      const reply = processUserMessage('java', TEST_PHONE);

      assert.match(reply, /Full Stack Java Development/);
      assert.equal(conversations[TEST_PHONE].state, 'viewing-course');
      assert.equal(conversations[TEST_PHONE].currentCourse, 'full-stack-java');
    });

    it('processes a multi-step enrollment flow', () => {
      processUserMessage('hello', TEST_PHONE);
      processUserMessage('data', TEST_PHONE);
      const finalReply = processUserMessage('enroll', TEST_PHONE);

      assert.match(finalReply, /Great choice/);
      assert.match(finalReply, /Data Science & AI/);
    });

    it('handles unexpected input in a course view', () => {
      processUserMessage('java', TEST_PHONE);
      const confusedReply = processUserMessage('what is up?', TEST_PHONE);

      assert.match(confusedReply, /I didn't quite understand that/);
    });
  });
});
