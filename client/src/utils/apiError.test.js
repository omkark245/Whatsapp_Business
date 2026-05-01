import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatApiErrorDetail,
  getApiErrorToastId,
  getApiErrorCode,
  getApiErrorDetails,
  getApiErrorMessage,
  getApiRequestId,
  normalizeApiError,
} from './apiError.js';

test('normalizeApiError prefers nested errorInfo payloads', () => {
  const error = {
    response: {
      status: 422,
      data: {
        error: 'Legacy message',
        code: 'LEGACY_CODE',
        requestId: 'legacy-id',
        errorInfo: {
          message: 'Validation failed',
          code: 'VALIDATION_FAILED',
          status: 422,
          requestId: 'nested-id',
          details: [{ field: 'name', message: 'Name is required' }],
        },
      },
    },
  };

  assert.equal(getApiErrorMessage(error), 'Validation failed');
  assert.equal(getApiErrorCode(error), 'VALIDATION_FAILED');
  assert.equal(getApiRequestId(error), 'nested-id');
  assert.deepEqual(getApiErrorDetails(error), [{ field: 'name', message: 'Name is required' }]);
  assert.deepEqual(normalizeApiError(error), {
    message: 'Validation failed',
    code: 'VALIDATION_FAILED',
    details: [{ field: 'name', message: 'Name is required' }],
    requestId: 'nested-id',
    status: 422,
  });
});

test('normalizeApiError supports legacy payloads', () => {
  const error = {
    response: {
      status: 404,
      data: {
        error: 'Contact not found',
        code: 'CONTACT_NOT_FOUND',
        requestId: 'legacy-request',
      },
    },
  };

  assert.deepEqual(normalizeApiError(error), {
    message: 'Contact not found',
    code: 'CONTACT_NOT_FOUND',
    details: [],
    requestId: 'legacy-request',
    status: 404,
  });
});

test('normalizeApiError preserves provider details and network fallback', () => {
  const providerError = {
    data: {
      errorInfo: {
        message: 'Meta rejected this request',
        code: 'META_REQUEST_FAILED',
        status: 400,
        requestId: 'socket-or-manual',
        details: [{ provider: 'meta', providerCode: 131047, providerSubcode: 99 }],
      },
    },
  };

  assert.equal(formatApiErrorDetail(providerError.data.errorInfo.details[0]), 'meta - 131047/99');
  assert.equal(normalizeApiError(providerError).message, 'Meta rejected this request');
  assert.equal(getApiErrorMessage({ message: 'Network Error' }), 'Unable to reach server. Please check your connection or try again.');
});

test('getApiErrorToastId deduplicates network failures only', () => {
  assert.equal(
    getApiErrorToastId(normalizeApiError({ message: 'Network Error' })),
    'api-error:network'
  );
  assert.deepEqual(
    normalizeApiError({ message: 'Network Error', code: 'ERR_NETWORK' }),
    {
      message: 'Unable to reach server. Please check your connection or try again.',
      code: '',
      details: [],
      requestId: '',
      status: undefined,
    }
  );

  assert.equal(
    getApiErrorToastId(normalizeApiError({
      response: {
        status: 422,
        data: { code: 'VALIDATION_FAILED', error: 'Validation failed' },
      },
    })),
    undefined
  );
});
