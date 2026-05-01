const axios = require('axios');
const metaConfig = require('../config/meta');
const { WaAccount } = require('../models');
const MetaService = require('../services/metaService');
const { AppError } = require('../utils/errors');
const { verifyTokenMatchesConfiguredMetaApp } = require('../utils/metaTokenDebug');

function getProviderMessage(error, fallback) {
  return (
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    fallback
  );
}

function isMetaTokenError(error) {
  const providerCode = error.response?.data?.error?.code;
  const providerMessage = getProviderMessage(error, '');
  return (
    providerCode === 190 ||
    /session has expired|error validating access token|access token|token/i.test(providerMessage)
  );
}

function getBearerHeaders(accessToken) {
  return { Authorization: `Bearer ${String(accessToken || '').trim()}` };
}

function assertCredentialFields({ accessToken, phoneNumberId, wabaId }) {
  if (!String(accessToken || '').trim()) {
    throw new AppError(400, 'WHATSAPP_ACCESS_TOKEN_REQUIRED', 'Access token is required');
  }
  if (!String(phoneNumberId || '').trim()) {
    throw new AppError(400, 'WHATSAPP_PHONE_NUMBER_ID_REQUIRED', 'Phone Number ID is required');
  }
  if (!String(wabaId || '').trim()) {
    throw new AppError(400, 'WHATSAPP_WABA_ID_REQUIRED', 'WABA ID is required');
  }
}

function getDebugTokenWabaIds(debugData = {}) {
  const scopes = Array.isArray(debugData.granular_scopes) ? debugData.granular_scopes : [];
  const ids = new Set();

  for (const scope of scopes) {
    if (!['whatsapp_business_management', 'whatsapp_business_messaging'].includes(scope?.scope)) continue;
    const targetIds = Array.isArray(scope?.target_ids) ? scope.target_ids : [];
    for (const targetId of targetIds) {
      const value = String(targetId || '').trim();
      if (value) ids.add(value);
    }
  }

  return [...ids];
}

function buildIdsMismatchError({ phoneNumberId, submittedWabaId, candidateWabaIds = [] }) {
  return new AppError(
    400,
    'WHATSAPP_ACCOUNT_IDS_MISMATCH',
    'Phone Number ID is not part of the selected WABA ID. Use IDs from the same WhatsApp Business Account in Meta API Setup.',
    [
      { field: 'phoneNumberId', message: 'This Phone Number ID was not found under the provided WABA ID.' },
      { field: 'wabaId', message: 'Use the WABA ID that owns this phone number.' },
      ...(submittedWabaId ? [{ field: 'submittedWabaId', message: submittedWabaId }] : []),
      ...(candidateWabaIds.length ? [{ field: 'availableWabaIds', message: candidateWabaIds.join(', ') }] : []),
    ]
  );
}

async function fetchWabaPhoneNumbers(wabaId, headers, { axiosClient = axios } = {}) {
  const response = await axiosClient.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/${wabaId}/phone_numbers`, {
    headers,
    params: { fields: 'id,display_phone_number,verified_name' },
  });
  return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function verifyWhatsAppCredentials({ accessToken, phoneNumberId, wabaId, axiosClient = axios, verifyTokenApp = verifyTokenMatchesConfiguredMetaApp }) {
  const token = String(accessToken || '').trim();
  const phoneId = String(phoneNumberId || '').trim();
  const waba = String(wabaId || '').trim();

  assertCredentialFields({ accessToken: token, phoneNumberId: phoneId, wabaId: waba });
  const tokenAppResult = await verifyTokenApp(token, { axiosClient });
  const configuredAppId = String(metaConfig.appId || '').trim();
  const configuredAppSecret = String(metaConfig.appSecret || '').trim();
  const appAccessToken = configuredAppId && configuredAppSecret ? `${configuredAppId}|${configuredAppSecret}` : null;

  const headers = getBearerHeaders(token);
  const [phoneRes, debugRes, submittedWabaPhones] = await Promise.all([
    axiosClient.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/${phoneId}`, { headers }),
    appAccessToken
      ? axiosClient.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/debug_token`, {
        params: {
          input_token: token,
          access_token: appAccessToken,
        },
      })
      : Promise.resolve({ data: { data: tokenAppResult || {} } }),
    fetchWabaPhoneNumbers(waba, headers, { axiosClient }),
  ]);

  const submittedMatch = submittedWabaPhones.find((phone) => String(phone.id) === phoneId);
  if (submittedMatch) {
    return {
      wabaId: waba,
      phoneNumber: submittedMatch.display_phone_number || phoneRes.data.display_phone_number || null,
      businessName: submittedMatch.verified_name || phoneRes.data.verified_name || null,
    };
  }

  const candidateWabaIds = [
    waba,
    ...getDebugTokenWabaIds(debugRes.data?.data || {}),
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  for (const candidateWabaId of candidateWabaIds) {
    if (candidateWabaId === waba) continue;
    const candidatePhones = await fetchWabaPhoneNumbers(candidateWabaId, headers, { axiosClient });
    const candidateMatch = candidatePhones.find((phone) => String(phone.id) === phoneId);
    if (!candidateMatch) continue;

    return {
      wabaId: candidateWabaId,
      phoneNumber: candidateMatch.display_phone_number || phoneRes.data.display_phone_number || null,
      businessName: candidateMatch.verified_name || phoneRes.data.verified_name || null,
    };
  }

  throw buildIdsMismatchError({
    phoneNumberId: phoneId,
    submittedWabaId: waba,
    candidateWabaIds: candidateWabaIds.filter((candidate) => candidate !== waba),
  });
}

exports.connectAccount = async (req, res) => {
  try {
    const { code } = req.body;
    const tokenRes = await axios.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/oauth/access_token`, {
      params: { client_id: metaConfig.appId, client_secret: metaConfig.appSecret, code },
    });
    const { access_token } = tokenRes.data;

    const debugRes = await axios.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/debug_token`, {
      params: { input_token: access_token, access_token: `${metaConfig.appId}|${metaConfig.appSecret}` },
    });

    const wabaId = debugRes.data.data?.granular_scopes
      ?.find(s => s.scope === 'whatsapp_business_management')?.target_ids?.[0];

    let phoneNumberId = null, phoneNumber = null, businessName = null;

    if (wabaId) {
      const phoneRes = await axios.get(`${metaConfig.graphUrl}/${metaConfig.apiVersion}/${wabaId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (phoneRes.data.data?.length > 0) {
        const p = phoneRes.data.data[0];
        phoneNumberId = p.id;
        phoneNumber = p.display_phone_number;
        businessName = p.verified_name;
      }
    }

    const accountPayload = {
      userId: req.user.id, wabaId, phoneNumberId, phoneNumber, businessName,
      accessToken: access_token, status: phoneNumberId ? 'active' : 'pending',
    };

    const existingAccount = phoneNumberId
      ? await WaAccount.findOne({ where: { userId: req.user.id, phoneNumberId } })
      : null;

    const account = existingAccount
      ? await existingAccount.update(accountPayload)
      : await WaAccount.create(accountPayload);

    res.status(201).json({
      message: existingAccount ? 'WhatsApp account reconnected' : 'WhatsApp account connected',
      account: { id: account.id, wabaId, phoneNumber, businessName, status: account.status },
    });
  } catch (error) {
    throw error;
  }
};

exports.connectManual = async (req, res) => {
  try {
    const { accessToken, phoneNumberId, wabaId } = req.body;
    const token = String(accessToken || '').trim();
    const phoneId = String(phoneNumberId || '').trim();
    const waba = String(wabaId || '').trim();
    const verified = await verifyWhatsAppCredentials({
      accessToken: token,
      phoneNumberId: phoneId,
      wabaId: waba,
    });
    const existingAccount = await WaAccount.findOne({
      where: { userId: req.user.id, phoneNumberId: phoneId },
    });

    const accountPayload = {
      userId: req.user.id,
      wabaId: verified.wabaId,
      phoneNumberId: phoneId,
      phoneNumber: verified.phoneNumber,
      businessName: verified.businessName,
      accessToken: token,
      status: 'active',
    };

    const account = existingAccount
      ? await existingAccount.update(accountPayload)
      : await WaAccount.create(accountPayload);

    res.status(201).json({
      message: existingAccount ? 'WhatsApp account reconnected' : 'WhatsApp account connected',
      account: {
        id: account.id, wabaId: account.wabaId,
        phoneNumber: account.phoneNumber,
        businessName: account.businessName,
        status: 'active',
      },
    });
  } catch (error) {
    throw error;
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const accounts = await WaAccount.findAll({
      where: { userId: req.authContext.ownerUserId },
      attributes: ['id', 'wabaId', 'phoneNumberId', 'phoneNumber', 'businessName', 'status', 'createdAt'],
    });
    res.json({ accounts });
  } catch (error) {
    throw error;
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const account = await WaAccount.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    await account.destroy();
    res.json({ message: 'Account disconnected' });
  } catch (error) {
    throw error;
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const account = await WaAccount.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');

    const { accessToken, phoneNumberId, wabaId } = req.body;

    // Use incoming values or fall back to existing ones
    const token    = accessToken  || account.accessToken;
    const phoneId  = phoneNumberId || account.phoneNumberId;
    const waba     = wabaId       || account.wabaId;

    const verified = await verifyWhatsAppCredentials({
      accessToken: token,
      phoneNumberId: phoneId,
      wabaId: waba,
    });

    await account.update({
      accessToken:   token,
      phoneNumberId: phoneId,
      wabaId:        verified.wabaId,
      phoneNumber:   verified.phoneNumber,
      businessName:  verified.businessName,
      status:        'active',
    });

    res.json({
      message: 'Account updated',
      account: {
        id:           account.id,
        wabaId:       account.wabaId,
        phoneNumber:  account.phoneNumber,
        businessName: account.businessName,
        status:       account.status,
      },
    });
  } catch (error) {
    throw error;
  }
};

module.exports.__test__ = {
  getDebugTokenWabaIds,
  buildIdsMismatchError,
  fetchWabaPhoneNumbers,
  verifyWhatsAppCredentials,
};

exports.getBusinessProfile = async (req, res) => {
  try {
    const account = await WaAccount.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (!account.accessToken || !account.phoneNumberId) {
      throw new AppError(400, 'WHATSAPP_CREDENTIALS_INCOMPLETE', 'WhatsApp account credentials are incomplete');
    }

    const meta = new MetaService(account.accessToken, account.phoneNumberId);
    const profile = await meta.getBusinessProfile();
    const businessProfile = profile?.data?.[0] || {};

    res.json({ profile: businessProfile });
  } catch (error) {
    const tokenExpired = isMetaTokenError(error);
    if (tokenExpired) {
      await WaAccount.update({ status: 'inactive' }, { where: { id: req.params.id, userId: req.user.id } });
    }
    throw error;
  }
};

exports.updateBusinessProfile = async (req, res) => {
  try {
    const account = await WaAccount.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!account) throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (!account.accessToken || !account.phoneNumberId) {
      throw new AppError(400, 'WHATSAPP_CREDENTIALS_INCOMPLETE', 'WhatsApp account credentials are incomplete');
    }

    const {
      about = '',
      address = '',
      description = '',
      email = '',
      websites = [],
      vertical = '',
    } = req.body || {};

    const normalizedWebsites = Array.isArray(websites)
      ? websites.map((website) => String(website || '').trim()).filter(Boolean).slice(0, 2)
      : [];

    const payload = {
      about: String(about || '').trim(),
      address: String(address || '').trim(),
      description: String(description || '').trim(),
      email: String(email || '').trim(),
      vertical: String(vertical || '').trim(),
      websites: normalizedWebsites,
    };

    const meta = new MetaService(account.accessToken, account.phoneNumberId);
    await meta.updateBusinessProfile(payload);
    const profile = await meta.getBusinessProfile();
    const businessProfile = profile?.data?.[0] || {};

    res.json({
      message: 'Business profile updated',
      profile: businessProfile,
    });
  } catch (error) {
    const tokenExpired = isMetaTokenError(error);
    if (tokenExpired) {
      await WaAccount.update({ status: 'inactive' }, { where: { id: req.params.id, userId: req.user.id } });
    }
    throw error;
  }
};
