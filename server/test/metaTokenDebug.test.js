const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const metaConfig = require('../src/config/meta');
const { verifyTokenMatchesConfiguredMetaApp, __test__ } = require('../src/utils/metaTokenDebug');

const originalAppId = metaConfig.appId;
const originalAppSecret = metaConfig.appSecret;

afterEach(() => {
  metaConfig.appId = originalAppId;
  metaConfig.appSecret = originalAppSecret;
});

test('configured Meta app credentials are available only when app ID and secret are valid', () => {
  metaConfig.appId = '1253404666963796';
  metaConfig.appSecret = 'secret';
  assert.deepEqual(__test__.getConfiguredMetaAppCredentials(), {
    appId: '1253404666963796',
    appAccessToken: '1253404666963796|secret',
  });

  metaConfig.appId = 'not-a-number';
  assert.equal(__test__.getConfiguredMetaAppCredentials(), null);

  metaConfig.appId = '1253404666963796';
  metaConfig.appSecret = '';
  assert.equal(__test__.getConfiguredMetaAppCredentials(), null);
});

test('token app verification is skipped when server app credentials are incomplete', async () => {
  metaConfig.appId = '';
  metaConfig.appSecret = '';
  let calledMeta = false;

  const result = await verifyTokenMatchesConfiguredMetaApp('token', {
    axiosClient: {
      get: async () => {
        calledMeta = true;
        return { data: {} };
      },
    },
  });

  assert.equal(result, null);
  assert.equal(calledMeta, false);
});

test('token app verification accepts tokens from the configured Meta app', async () => {
  metaConfig.appId = '1253404666963796';
  metaConfig.appSecret = 'secret';

  const result = await verifyTokenMatchesConfiguredMetaApp('token', {
    axiosClient: {
      get: async (url, options) => {
        assert.match(url, /\/debug_token$/);
        assert.deepEqual(options.params, {
          input_token: 'token',
          access_token: '1253404666963796|secret',
        });
        return { data: { data: { app_id: '1253404666963796', is_valid: true } } };
      },
    },
  });

  assert.deepEqual(result, { appId: '1253404666963796', isValid: true });
});

test('token app verification rejects tokens from another Meta app', async () => {
  metaConfig.appId = '1253404666963796';
  metaConfig.appSecret = 'secret';

  await assert.rejects(
    () => verifyTokenMatchesConfiguredMetaApp('token', {
      axiosClient: {
        get: async () => ({ data: { data: { app_id: '999999999999999', is_valid: true } } }),
      },
    }),
    (error) => {
      assert.equal(error.code, 'WHATSAPP_TOKEN_APP_MISMATCH');
      assert.equal(error.statusCode, 403);
      assert.equal(error.details[0].appId, '1253404666963796');
      assert.equal(error.details[0].tokenAppId, '999999999999999');
      return true;
    }
  );
});

test('token app verification converts Meta debug failures into actionable app mismatch errors', async () => {
  metaConfig.appId = '1253404666963796';
  metaConfig.appSecret = 'secret';

  await assert.rejects(
    () => verifyTokenMatchesConfiguredMetaApp('token', {
      axiosClient: {
        get: async () => {
          const error = new Error('Request failed with status code 400');
          error.response = {
            status: 400,
            data: {
              error: {
                code: 100,
                error_subcode: 33,
                message: 'The App_id in the input_token did not match the Viewing App',
              },
            },
          };
          throw error;
        },
      },
    }),
    (error) => {
      assert.equal(error.code, 'WHATSAPP_TOKEN_APP_MISMATCH');
      assert.equal(error.statusCode, 403);
      assert.equal(error.details[0].providerCode, 100);
      assert.equal(error.details[0].providerSubcode, 33);
      assert.equal(error.details[0].appId, '1253404666963796');
      return true;
    }
  );
});
