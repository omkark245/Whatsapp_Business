const axios = require('axios');
const metaConfig = require('../config/meta');
const { AppError, normalizeError } = require('../utils/errors');

function buildMediaPayload(mediaReference = {}, extras = {}) {
  if (typeof mediaReference === 'string') {
    return { link: String(mediaReference).trim(), ...extras };
  }

  if (mediaReference && typeof mediaReference === 'object') {
    if (mediaReference.id) {
      return { id: String(mediaReference.id).trim(), ...extras };
    }
    if (mediaReference.link) {
      return { link: String(mediaReference.link).trim(), ...extras };
    }
  }

  return { ...extras };
}

function getTemplateUploadAppId() {
  const appId = String(metaConfig.appId || '').trim();
  if (!/^\d+$/.test(appId)) {
    throw new AppError(
      503,
      'META_APP_ID_INVALID',
      'META_APP_ID must be the numeric Meta app ID for media template headers.'
    );
  }
  return appId;
}

function isMetaObjectAccessError(error) {
  const normalized = normalizeError(error);
  return normalized.code === 'META_PERMISSION_ERROR' &&
    normalized.details?.some((detail) => Number(detail.providerCode) === 100 && Number(detail.providerSubcode) === 33);
}

class MetaService {
  constructor(accessToken, phoneNumberId) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.baseUrl = `${metaConfig.graphUrl}/${metaConfig.apiVersion}`;
    this.headers = { Authorization: `Bearer ${accessToken}` };
  }

  async sendTextMessage(to, text) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to, type: 'text', text: { body: text },
    }, { headers: this.headers });
    return data;
  }

  async sendReplyButtons(to, text, buttons) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text },
        action: {
          buttons,
        },
      },
    }, { headers: this.headers });
    return data;
  }

  async sendListMessage(to, text, buttonText, sections, footerText = '') {
    const interactive = {
      type: 'list',
      body: { text },
      action: {
        button: String(buttonText || 'Select').slice(0, 20),
        sections,
      },
    };

    if (footerText) {
      interactive.footer = { text: String(footerText).slice(0, 60) };
    }

    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive,
    }, { headers: this.headers });
    return data;
  }

  async sendImageMessage(to, imageReference, caption) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: buildMediaPayload(imageReference, caption ? { caption } : {}),
    }, { headers: this.headers });
    return data;
  }

  async sendDocumentMessage(to, documentReference, filename, caption) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: buildMediaPayload(documentReference, {
        ...(filename ? { filename } : {}),
        ...(caption ? { caption } : {}),
      }),
    }, { headers: this.headers });
    return data;
  }

  async sendVideoMessage(to, videoReference, caption) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: buildMediaPayload(videoReference, caption ? { caption } : {}),
    }, { headers: this.headers });
    return data;
  }

  async sendTemplateMessage(to, templateName, language, components) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: templateName, language: { code: language }, components },
    }, { headers: this.headers });
    return data;
  }

  async uploadMediaFromBuffer(buffer, { filename, mimeType } = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw new Error('Media file is empty');
    }

    const safeMimeType = String(mimeType || '').trim().toLowerCase() || 'application/octet-stream';
    const safeFilename = String(filename || '').trim() || `campaign-media-${Date.now()}`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: safeMimeType }), safeFilename);

    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/media`, form, {
      headers: this.headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const mediaId = data?.id;
    if (!mediaId) {
      throw new Error('Failed to upload media to Meta');
    }

    return mediaId;
  }

  async sendReaction(to, messageId, emoji) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', to, type: 'reaction',
      reaction: { message_id: messageId, emoji },
    }, { headers: this.headers });
    return data;
  }

  async markAsRead(messageId) {
    const { data } = await axios.post(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp', status: 'read', message_id: messageId,
    }, { headers: this.headers });
    return data;
  }

  async getMediaUrl(mediaId) {
    const { data } = await axios.get(`${this.baseUrl}/${mediaId}`, { headers: this.headers });
    return data.url;
  }

  async downloadMedia(mediaUrl) {
    const { data } = await axios.get(mediaUrl, {
      headers: this.headers, responseType: 'arraybuffer',
    });
    return data;
  }

  // Template Management
  async createTemplate(wabaId, templateData) {
    const { data } = await axios.post(`${this.baseUrl}/${wabaId}/message_templates`, templateData, { headers: this.headers });
    return data;
  }

  async uploadTemplateHeaderHandleFromBuffer(buffer, { filename, mimeType } = {}) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw new Error('Media file is empty');
    }

    const appId = getTemplateUploadAppId();
    const safeMimeType = String(mimeType || '').trim().toLowerCase() || 'application/octet-stream';
    const safeFilename = String(filename || '').trim() || `template-media-${Date.now()}${getExtensionFromMime(safeMimeType)}`;

    let sessionResponse;
    try {
      sessionResponse = await axios.post(
        `${this.baseUrl}/${appId}/uploads`,
        null,
        {
          headers: this.headers,
          params: {
            file_name: safeFilename,
            file_length: buffer.length,
            file_type: safeMimeType,
          },
        }
      );
    } catch (error) {
      if (isMetaObjectAccessError(error)) {
        throw new AppError(
          403,
          'META_TEMPLATE_HEADER_UPLOAD_APP_ACCESS',
          'Template header upload failed because Meta cannot access META_APP_ID with this WhatsApp token. Set META_APP_ID to the same Meta app used for the WhatsApp token, then reconnect the account in Settings.',
          [{
            provider: 'meta',
            providerCode: 100,
            providerSubcode: 33,
            appId,
            message: 'The app ID, access token, WABA ID, and Phone Number ID must belong to the same Meta app/business setup.',
          }]
        );
      }
      throw error;
    }

    const uploadId = sessionResponse.data?.id;
    if (!uploadId) {
      throw new Error('Failed to create Meta upload session');
    }

    const uploadResponse = await axios.post(
      `${this.baseUrl}/${uploadId}`,
      buffer,
      {
        headers: {
          Authorization: `OAuth ${this.accessToken}`,
          'Content-Type': 'application/octet-stream',
          file_offset: '0',
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );

    const handle = uploadResponse.data?.h || uploadResponse.data?.handle;
    if (!handle) {
      throw new Error('Failed to get Meta media handle');
    }

    return handle;
  }

  async editTemplate(metaTemplateId, templateData) {
    const { data } = await axios.post(`${this.baseUrl}/${metaTemplateId}`, templateData, { headers: this.headers });
    return data;
  }

  async getTemplates(wabaId) {
    const { data } = await axios.get(`${this.baseUrl}/${wabaId}/message_templates`, { headers: this.headers });
    return data;
  }

  async deleteTemplate(wabaId, templateName, metaTemplateId = null) {
    const { data } = await axios.delete(`${this.baseUrl}/${wabaId}/message_templates`, {
      params: {
        name: templateName,
        ...(metaTemplateId ? { hsm_id: metaTemplateId } : {}),
      },
      headers: this.headers,
    });
    return data;
  }

  // Business Profile
  async getBusinessProfile() {
    const { data } = await axios.get(`${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`, {
      params: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' },
      headers: this.headers,
    });
    return data;
  }

  async updateBusinessProfile(profileData) {
    const payload = {
      messaging_product: 'whatsapp',
      ...profileData,
    };

    const { data } = await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_profile`,
      payload,
      { headers: this.headers }
    );
    return data;
  }
}

module.exports = MetaService;

function getExtensionFromMime(mimeType) {
  const lowerMime = String(mimeType || '').toLowerCase();
  if (lowerMime.includes('jpeg')) return '.jpg';
  if (lowerMime.includes('png')) return '.png';
  if (lowerMime.includes('gif')) return '.gif';
  if (lowerMime.includes('webp')) return '.webp';
  if (lowerMime.includes('mp4')) return '.mp4';
  if (lowerMime.includes('mov')) return '.mov';
  if (lowerMime.includes('pdf')) return '.pdf';
  if (lowerMime.includes('msword')) return '.doc';
  if (lowerMime.includes('wordprocessingml')) return '.docx';
  return '';
}
