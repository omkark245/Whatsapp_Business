import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ErrorDetails from './ErrorDetails.js';

test('ErrorDetails renders message, code, request ID, and details', () => {
  const error = {
    response: {
      status: 422,
      data: {
        errorInfo: {
          message: 'Validation failed',
          code: 'VALIDATION_FAILED',
          status: 422,
          requestId: 'req-123',
          details: [{ field: 'name', message: 'Name is required' }],
        },
      },
    },
  };

  const html = renderToStaticMarkup(React.createElement(ErrorDetails, {
    error,
    title: 'Save failed',
  }));

  assert.match(html, /Save failed/);
  assert.match(html, /Validation failed/);
  assert.match(html, /VALIDATION_FAILED/);
  assert.match(html, /Request req-123/);
  assert.match(html, /name - Name is required/);
});
