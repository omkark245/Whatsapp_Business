const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const axios = require('axios');

const metaConfig = require('../src/config/meta');
const MetaService = require('../src/services/metaService');

const originalAppId = metaConfig.appId;
const originalPost = axios.post;

afterEach(() => {
  metaConfig.appId = originalAppId;
  axios.post = originalPost;
});

test('template header upload rejects invalid META_APP_ID before calling Meta', async () => {
  metaConfig.appId = 'not-a-number';
  let calledMeta = false;
  axios.post = async () => {
    calledMeta = true;
    return { data: {} };
  };

  await assert.rejects(
    () => new MetaService('token', 'phone-number-id').uploadTemplateHeaderHandleFromBuffer(
      Buffer.from('image-bytes'),
      { filename: 'header.jpg', mimeType: 'image/jpeg' }
    ),
    (error) => {
      assert.equal(error.code, 'META_APP_ID_INVALID');
      assert.equal(error.statusCode, 503);
      return true;
    }
  );

  assert.equal(calledMeta, false);
});

test('template header upload explains Meta app/token access mismatch', async () => {
  metaConfig.appId = '1234567890';
  axios.post = async (url) => {
    assert.match(url, /\/1234567890\/uploads$/);
    const error = new Error('Request failed with status code 400');
    error.response = {
      status: 400,
      data: {
        error: {
          code: 100,
          error_subcode: 33,
          message: 'Unsupported get request. Object with ID does not exist, cannot be loaded due to missing permissions, or does not support this operation.',
        },
      },
    };
    throw error;
  };

  await assert.rejects(
    () => new MetaService('token', 'phone-number-id').uploadTemplateHeaderHandleFromBuffer(
      Buffer.from('image-bytes'),
      { filename: 'header.jpg', mimeType: 'image/jpeg' }
    ),
    (error) => {
      assert.equal(error.code, 'META_TEMPLATE_HEADER_UPLOAD_APP_ACCESS');
      assert.equal(error.statusCode, 403);
      assert.match(error.message, /META_APP_ID/);
      assert.deepEqual(error.details[0], {
        provider: 'meta',
        providerCode: 100,
        providerSubcode: 33,
        appId: '1234567890',
        message: 'The app ID, access token, WABA ID, and Phone Number ID must belong to the same Meta app/business setup.',
      });
      return true;
    }
  );
});
