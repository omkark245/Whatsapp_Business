const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');

const metaConfig = require('../src/config/meta');
const { __test__ } = require('../src/controllers/waAccountController');

const originalAppId = metaConfig.appId;
const originalAppSecret = metaConfig.appSecret;
const graphPrefix = `${metaConfig.graphUrl}/${metaConfig.apiVersion}`;

afterEach(() => {
  metaConfig.appId = originalAppId;
  metaConfig.appSecret = originalAppSecret;
});

test('verifyWhatsAppCredentials keeps the submitted WABA when the phone belongs to it', async () => {
  metaConfig.appId = '1976255276268790';
  metaConfig.appSecret = 'secret';

  const calls = [];
  const result = await __test__.verifyWhatsAppCredentials({
    accessToken: 'token',
    phoneNumberId: 'phone-1',
    wabaId: 'waba-1',
    verifyTokenApp: async () => ({ appId: metaConfig.appId, isValid: true }),
    axiosClient: {
      get: async (url) => {
        calls.push(url);
        if (url === `${graphPrefix}/phone-1`) {
          return { data: { display_phone_number: '+91 90000 00001', verified_name: 'Fallback Name' } };
        }
        if (url === `${graphPrefix}/debug_token`) {
          return {
            data: {
              data: {
                granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['waba-1'] }],
              },
            },
          };
        }
        if (url === `${graphPrefix}/waba-1/phone_numbers`) {
          return {
            data: {
              data: [{ id: 'phone-1', display_phone_number: '+91 90000 00001', verified_name: 'Primary WABA' }],
            },
          };
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    },
  });

  assert.deepEqual(result, {
    wabaId: 'waba-1',
    phoneNumber: '+91 90000 00001',
    businessName: 'Primary WABA',
  });
  assert.deepEqual(calls, [
    `${graphPrefix}/phone-1`,
    `${graphPrefix}/debug_token`,
    `${graphPrefix}/waba-1/phone_numbers`,
  ]);
});

test('verifyWhatsAppCredentials resolves the owning WABA when the submitted WABA is wrong', async () => {
  metaConfig.appId = '1976255276268790';
  metaConfig.appSecret = 'secret';

  const calls = [];
  const result = await __test__.verifyWhatsAppCredentials({
    accessToken: 'token',
    phoneNumberId: 'phone-2',
    wabaId: 'wrong-waba',
    verifyTokenApp: async () => ({ appId: metaConfig.appId, isValid: true }),
    axiosClient: {
      get: async (url) => {
        calls.push(url);
        if (url === `${graphPrefix}/phone-2`) {
          return { data: { display_phone_number: '+91 90000 00002', verified_name: 'Fallback Name' } };
        }
        if (url === `${graphPrefix}/debug_token`) {
          return {
            data: {
              data: {
                granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['correct-waba'] }],
              },
            },
          };
        }
        if (url === `${graphPrefix}/wrong-waba/phone_numbers`) {
          return { data: { data: [] } };
        }
        if (url === `${graphPrefix}/correct-waba/phone_numbers`) {
          return {
            data: {
              data: [{ id: 'phone-2', display_phone_number: '+91 90000 00002', verified_name: 'Resolved WABA' }],
            },
          };
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    },
  });

  assert.deepEqual(result, {
    wabaId: 'correct-waba',
    phoneNumber: '+91 90000 00002',
    businessName: 'Resolved WABA',
  });
  assert.deepEqual(calls, [
    `${graphPrefix}/phone-2`,
    `${graphPrefix}/debug_token`,
    `${graphPrefix}/wrong-waba/phone_numbers`,
    `${graphPrefix}/correct-waba/phone_numbers`,
  ]);
});

test('verifyWhatsAppCredentials returns actionable mismatch details when no accessible WABA owns the phone', async () => {
  metaConfig.appId = '1976255276268790';
  metaConfig.appSecret = 'secret';

  await assert.rejects(
    () => __test__.verifyWhatsAppCredentials({
      accessToken: 'token',
      phoneNumberId: 'phone-3',
      wabaId: 'wrong-waba',
      verifyTokenApp: async () => ({ appId: metaConfig.appId, isValid: true }),
      axiosClient: {
        get: async (url) => {
          if (url === `${graphPrefix}/phone-3`) {
            return { data: { display_phone_number: '+91 90000 00003', verified_name: 'Fallback Name' } };
          }
          if (url === `${graphPrefix}/debug_token`) {
            return {
              data: {
                data: {
                  granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['candidate-waba'] }],
                },
              },
            };
          }
          if (url === `${graphPrefix}/wrong-waba/phone_numbers`) {
            return { data: { data: [] } };
          }
          if (url === `${graphPrefix}/candidate-waba/phone_numbers`) {
            return { data: { data: [] } };
          }
          throw new Error(`Unexpected URL ${url}`);
        },
      },
    }),
    (error) => {
      assert.equal(error.code, 'WHATSAPP_ACCOUNT_IDS_MISMATCH');
      assert.equal(error.statusCode, 400);
      assert.equal(
        error.details.find((detail) => detail.field === 'submittedWabaId')?.message,
        'wrong-waba'
      );
      assert.equal(
        error.details.find((detail) => detail.field === 'availableWabaIds')?.message,
        'candidate-waba'
      );
      return true;
    }
  );
});
