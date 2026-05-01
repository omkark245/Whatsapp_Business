require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');

const database = require('./config/database');
const { sequelize } = require('./models');
const { migrateToLatest } = require('./db/umzug');
const { authenticateSocket } = require('./utils/socketAuth');
const { getOwnerRoom, getTeamRoom, getUserRoom } = require('./utils/socketEvents');
const { MAX_UPLOAD_BYTES, buildLegacyUploadRedirectPath, resolveUploadAlias } = require('./utils/uploads');
const { assertSafeRuntimeConfig } = require('./utils/runtimeConfig');
const requestId = require('./middlewares/requestId');
const errorHandler = require('./middlewares/errorHandler');
const { AppError, logBackgroundError } = require('./utils/errors');
const setupWebhook = require('./webhooks/whatsappWebhook');
const { processDripSteps } = require('./controllers/dripCampaignController');
const { processScheduledCampaigns } = require('./controllers/campaignController');

const app = express();
const server = http.createServer(app);
// Trust proxy so rate limiting works correctly behind Coolify/NGINX.
app.set('trust proxy', 1);
const WEBHOOK_PATHS = ['/webhook', '/api/webhook', '/api/whatsapp/webhook'];

function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = [
  ...splitOrigins(process.env.CLIENT_ORIGIN),
  ...splitOrigins(process.env.ALLOWED_ORIGINS),
  'http://localhost:5173',
  'http://localhost:3000',
  'https://whatsapp.finlectechnologies.com',
  'https://api.whatsapp.finlectechnologies.com',
].filter((origin, index, origins) => origins.indexOf(origin) === index);

function isWebhookRequest(req) {
  return WEBHOOK_PATHS.includes(req.path);
}

function isUploadRequest(req) {
  return req.path === '/api/uploads/media' || req.path.startsWith('/api/uploads/');
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
  optionsSuccessStatus: 204,
};

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: corsOptions.methods,
    credentials: true,
  },
});

io.use(async (socket, next) => {
  try {
    const socketUser = await authenticateSocket(socket);
    if (!socketUser) {
      const error = new Error('Authentication required');
      error.data = {
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      };
      next(error);
      return;
    }

    socket.data.userId = socketUser.user.id;
    socket.data.authContext = socketUser.authContext;
    next();
  } catch (authError) {
    logBackgroundError('socket.auth', authError, { socketId: socket.id });
    const error = new Error('Invalid or expired token');
    error.data = {
      success: false,
      message: 'Invalid or expired token',
      code: 'AUTH_INVALID',
    };
    next(error);
  }
});

app.set('io', io);

app.use(requestId);

// CORS must run before security, rate-limit, and route middleware so browser
// preflight requests receive Access-Control-Allow-* headers in production.
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
// Ensure CORS headers are present even on error responses.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || res.getHeader('Access-Control-Allow-Origin') || '');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  next();
});

// ── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // allow inline styles (React)
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https://graph.facebook.com'],
        fontSrc: ["'self'", 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // avoid breaking WhatsApp media previews
  })
);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  skip: isWebhookRequest,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many requests, please try again later.')),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res, next) => next(new AppError(429, 'AUTH_RATE_LIMITED', 'Too many login attempts, please try again later.')),
});

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  handler: (req, res, next) => next(new AppError(429, 'WEBHOOK_RATE_LIMITED', 'Too many webhook requests, please try again later.')),
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError(429, 'UPLOAD_RATE_LIMITED', 'Too many upload requests, please try again later.')),
});

app.use(globalLimiter);
app.use(WEBHOOK_PATHS, webhookLimiter);
app.use('/api/uploads', uploadLimiter);

// ── Core Middleware ───────────────────────────────────────────────────────────
const captureRawBody = (req, res, buffer) => {
  if (buffer?.length) {
    req.rawBody = Buffer.from(buffer);
  }
};
const webhookJsonParser = express.json({ limit: '1mb', verify: captureRawBody });
const uploadJsonParser = express.json({
  limit: Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + (1024 * 1024),
});
const jsonParser = express.json({ limit: '5mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '5mb' });

app.use(WEBHOOK_PATHS, webhookJsonParser);
app.use((req, res, next) => {
  if (isWebhookRequest(req)) return next();
  if (isUploadRequest(req)) return uploadJsonParser(req, res, next);
  return jsonParser(req, res, next);
});
app.use((req, res, next) => ((isWebhookRequest(req) || isUploadRequest(req)) ? next() : urlencodedParser(req, res, next)));
app.use(cookieParser());
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), {
  dotfiles: 'deny',
  index: false,
  redirect: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));
app.get('/uploads/:filename', (req, res, next) => {
  const alias = resolveUploadAlias(req.params.filename);
  if (!alias) {
    next();
    return;
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.type(alias.mimeType);
  res.sendFile(alias.absolutePath);
});
app.get('/api/uploads/:filename', (req, res) => {
  res.redirect(302, buildLegacyUploadRedirectPath(req.params.filename));
});

// ── Auth Routes (strict rate limiting only for credential submissions) ───────
app.use([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/mobile/login',
  '/api/auth/mobile/register',
], authLimiter);
app.use('/api/auth', require('./routes/auth'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/wa-accounts', require('./routes/waAccount'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/templates', require('./routes/template'));
app.use('/api/flows', require('./routes/flow'));
app.use('/api/campaigns', require('./routes/campaign'));
app.use('/api/contact-groups', require('./routes/contactGroup'));
app.use('/api/contacts', require('./routes/contact'));
app.use('/api/quick-replies', require('./routes/quickReply'));
app.use('/api/labels', require('./routes/label'));
app.use('/api/auto-replies', require('./routes/autoReply'));
app.use('/api/drip-campaigns', require('./routes/dripCampaign'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/uploads', require('./routes/upload'));
app.use('/api/teams', require('./routes/team'));
app.use('/api/team-members', require('./routes/teamMember'));

// ── Webhook ───────────────────────────────────────────────────────────────────
setupWebhook(app, io);

// ── Health ────────────────────────────────────────────────────────────────────
function respondHealth(req, res) {
  res.json({ status: 'ok', timestamp: new Date() });
}

app.get('/', respondHealth);
app.get('/health', respondHealth);
app.get('/api/health', respondHealth);
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found')));

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const userRoom = getUserRoom(socket.data.userId);
  socket.join(userRoom);
  if (socket.data.authContext?.ownerUserId) {
    socket.join(getOwnerRoom(socket.data.authContext.ownerUserId));
  }
  if (socket.data.authContext?.teamId) {
    socket.join(getTeamRoom(socket.data.authContext.teamId));
  }
  console.log(`Client connected: ${socket.id} (user ${socket.data.userId})`);
  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id} (user ${socket.data.userId})`));
});

// ── Cron: Process drip campaign steps every minute ────────────────────────────
let dripStepsRunning = false;
let scheduledCampaignsRunning = false;

// Process queued automation work every minute without overlapping long runs.
cron.schedule('* * * * *', async () => {
  if (!dripStepsRunning) {
    dripStepsRunning = true;
    try {
      await processDripSteps();
    } catch (error) {
      logBackgroundError('processDripSteps', error);
    } finally {
      dripStepsRunning = false;
    }
  }

  if (!scheduledCampaignsRunning) {
    scheduledCampaignsRunning = true;
    try {
      await processScheduledCampaigns(io);
    } catch (error) {
      logBackgroundError('processScheduledCampaigns', error);
    } finally {
      scheduledCampaignsRunning = false;
    }
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

function startHttpServer() {
  return new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off('listening', handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off('error', handleError);
      console.log(`Server running on port ${PORT}`);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(PORT);
  });
}

function hasRunningInstance(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        timeout: 2000,
      },
      (response) => {
        let body = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve(response.statusCode === 200 && body.includes('"status":"ok"'));
        });
      }
    );

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });

    request.on('error', () => resolve(false));
  });
}

async function startApplication({ autoMigrate = process.env.DB_AUTO_MIGRATE === 'true' } = {}) {
  try {
    assertSafeRuntimeConfig(process.env);
    await database.ensureDatabase();
    await sequelize.authenticate();
    console.log('Database connected');
    if (autoMigrate) {
      const appliedMigrations = await migrateToLatest();
      if (appliedMigrations.length) {
        console.log(`Applied ${appliedMigrations.length} migration(s) during startup`);
      } else {
        console.log('Database already at latest migration');
      }
    }
    console.log('Database ready');
    await startHttpServer();
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      if (await hasRunningInstance(PORT)) {
        console.log(`A server instance is already running on port ${PORT}. Reusing the existing instance.`);
        process.exit(0);
      }
      console.error(`Port ${PORT} is already in use. Stop the process using it or set PORT to another value.`);
    } else {
      console.error('Failed to start:', error);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  startApplication();
}

module.exports = {
  app,
  io,
  server,
  startApplication,
};
