const axios = require('axios');
const metaConfig = require('../config/meta');
const { AppError } = require('./errors');

function getProviderMessage(error, fallback) {
  return (
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    fallback
  );
}

function getConfiguredMetaAppCredentials() {
  const appId = String(metaConfig.appId || '').trim();
  const appSecret = String(metaConfig.appSecret || '').trim();
  if (!/^\d+$/.test(appId) || !appSecret) return null;
  return { appId, appAccessToken: `${appId}|${appSecret}` };
}

function buildTokenAppMismatchError({ appId, tokenAppId = '', providerCode, providerSubcode, providerMessage }) {
  return new AppError(
    403,
    'WHATSAPP_TOKEN_APP_MISMATCH',
    'WhatsApp access token was generated from a different Meta app than this server uses. Generate a new permanent token from the configured META_APP_ID, then reconnect the account.',
    [{
      provider: 'meta',
      providerCode,
      providerSubcode,
      appId,
      tokenAppId,
      message: providerMessage || 'The access token must belong to the configured Meta app.',
    }]
  );
}

async function verifyTokenMatchesConfiguredMetaApp(accessToken, { axiosClient = axios } = {}) {
  const token = String(accessToken || '').trim();
  const credentials = getConfiguredMetaAppCredentials();
  if (!token || !credentials) return null;

  try {
    const { data } = await axiosClient.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/debug_token`, {
      params: {
        input_token: token,
        access_token: credentials.appAccessToken,
      },
    });

    const tokenData = data?.data || {};
    const tokenAppId = String(tokenData.app_id || '').trim();

    if (tokenData.is_valid === false) {
      throw new AppError(
        401,
        'META_ACCESS_TOKEN_EXPIRED',
        'WhatsApp access token is invalid or expired. Generate a new permanent token from the configured Meta app, then reconnect this account.',
        [{ provider: 'meta', appId: credentials.appId, tokenAppId }]
      );
    }

    if (tokenAppId && tokenAppId !== credentials.appId) {
      throw buildTokenAppMismatchError({
        appId: credentials.appId,
        tokenAppId,
        providerMessage: `Token app ID ${tokenAppId} does not match configured META_APP_ID ${credentials.appId}.`,
      });
    }

    return { appId: tokenAppId || null, isValid: tokenData.is_valid !== false };
  } catch (error) {
    if (error instanceof AppError) throw error;

    const providerError = error.response?.data?.error || {};
    const providerCode = Number(providerError.code || 0) || undefined;
    const providerSubcode = Number(providerError.error_subcode || 0) || undefined;
    const providerMessage = getProviderMessage(
      error,
      'Meta could not inspect this access token with the configured app credentials.'
    );

    if (providerCode === 190 || /expired|invalid.*token|error validating access token/i.test(providerMessage)) {
      throw new AppError(
        401,
        'META_ACCESS_TOKEN_EXPIRED',
        'WhatsApp access token is invalid or expired. Generate a new permanent token from the configured Meta app, then reconnect this account.',
        [{ provider: 'meta', providerCode, providerSubcode, appId: credentials.appId, message: providerMessage }]
      );
    }

    throw buildTokenAppMismatchError({
      appId: credentials.appId,
      providerCode,
      providerSubcode,
      providerMessage,
    });
  }
}

module.exports = {
  verifyTokenMatchesConfiguredMetaApp,
  __test__: {
    getConfiguredMetaAppCredentials,
  },
};
