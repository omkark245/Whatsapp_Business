#!/usr/bin/env node

const http = require('http');
const url = require('url');
const querystring = require('querystring');

// Configuration
const WEBHOOK_VERIFY_TOKEN = '533fe35fb07f1005ced1b699a28e11113b6d8e6a5ce3f78e1acaad8a35a4d4da';
const PORT = 5000;

// In-memory storage for messages
const messages = [];
const replies = [];

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendJsonError(res, status, code, message, details = []) {
  const requestId = createRequestId();
  const normalizedDetails = Array.isArray(details) ? details : [details].filter(Boolean);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  });
  res.end(JSON.stringify({
    success: false,
    error: message,
    code,
    requestId,
    ...(normalizedDetails.length ? { details: normalizedDetails } : {}),
    errorInfo: {
      message,
      code,
      status,
      requestId,
      details: normalizedDetails,
    },
  }));
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Webhook verification (GET request from Meta)
  if (req.method === 'GET' && pathname === '/webhook') {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('✓ Webhook verified successfully!');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.log('✗ Webhook verification failed - invalid token');
      sendJsonError(res, 403, 'WEBHOOK_VERIFY_TOKEN_INVALID', 'Forbidden');
    }
    return;
  }

  // Webhook message handling (POST request from Meta)
  if (req.method === 'POST' && pathname === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('\n📨 Webhook received:');
        console.log(JSON.stringify(data, null, 2));

        // Extract message information if present
        if (data.entry && data.entry[0] && data.entry[0].changes) {
          data.entry[0].changes.forEach(change => {
            if (change.value && change.value.messages) {
              change.value.messages.forEach(msg => {
                const messageObj = {
                  timestamp: new Date(),
                  from: msg.from,
                  id: msg.id,
                  type: msg.type,
                  content: msg.text?.body || JSON.stringify(msg),
                };
                messages.push(messageObj);
                console.log(`✓ Message stored: ${msg.id} from ${msg.from}`);
              });
            }
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('✗ Error processing webhook:', err.message);
        sendJsonError(res, 400, 'WEBHOOK_PAYLOAD_INVALID', err.message);
      }
    });
    return;
  }

  // API: Get all received messages
  if (req.method === 'GET' && pathname === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messages, null, 2));
    return;
  }

  // API: Get server status
  if (req.method === 'GET' && pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      port: PORT,
      messages_received: messages.length,
      webhook_token_configured: !!WEBHOOK_VERIFY_TOKEN,
      timestamp: new Date(),
    }, null, 2));
    return;
  }

  // Default route
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>WhatsApp Webhook Server</title></head>
        <body style="font-family: Arial; margin: 20px;">
          <h1>✓ WhatsApp Webhook Server Running</h1>
          <p><strong>Status:</strong> Online</p>
          <p><strong>Port:</strong> ${PORT}</p>
          <p><strong>Messages Received:</strong> ${messages.length}</p>

          <h2>Endpoints:</h2>
          <ul>
            <li><code>GET /webhook</code> - Webhook verification (called by Meta)</li>
            <li><code>POST /webhook</code> - Receive messages (called by Meta)</li>
            <li><code>GET /api/messages</code> - View all received messages</li>
            <li><code>GET /api/status</code> - Server status</li>
          </ul>

          <h2>Latest Messages:</h2>
          <pre>${JSON.stringify(messages.slice(-5), null, 2)}</pre>

          <p style="color: #666; margin-top: 30px;">
            Forwarded via: <code>https://silly-friends-bet.loca.lt</code>
          </p>
        </body>
      </html>
    `);
    return;
  }

  // 404
  sendJsonError(res, 404, 'ROUTE_NOT_FOUND', 'Not Found');
});

function startServer() {
  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  WhatsApp Webhook Server               ║
║  ✓ Running on port ${PORT}              ║
║  ✓ URL: http://localhost:${PORT}       ║
║  ✓ Webhook: /webhook                  ║
║  ✓ Localtunnel: https://silly-friends-bet.loca.lt/webhook ║
║  ✓ Verify Token: Configured           ║
╚════════════════════════════════════════╝
`);
    console.log('Waiting for WhatsApp messages...\n');
  });
}

server.on('error', (err) => {
  console.error('✗ Server error:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = { server, messages, replies, sendJsonError };
