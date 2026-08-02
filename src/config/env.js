import 'dotenv/config';
import Joi from 'joi';

/**
 * @file Centralised, validated environment configuration.
 *
 * Loads `.env`, validates every variable with Joi (acting as `dotenv-safe`:
 * the process refuses to boot when a required secret is missing or malformed),
 * and exposes a single frozen, typed `config` object consumed across the app.
 *
 * @module config/env
 */

/**
 * Validation schema for process environment variables.
 * `.unknown(true)` allows unrelated OS variables to pass through untouched.
 */
const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  API_BASE_URL: Joi.string().uri().default('http://localhost:4000'),
  CORS_ORIGINS: Joi.string().default('http://localhost:5173'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),

  DB_DIALECT: Joi.string().valid('mysql', 'sqlite').default('mysql'),
  DB_STORAGE: Joi.string().default(':memory:'),
  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().port().default(3306),
  DB_NAME: Joi.string().default('duel_music'),
  DB_NAME_TEST: Joi.string().default('duel_music_test'),
  DB_USER: Joi.string().default('root'),
  DB_PASSWORD: Joi.string().allow('').default(''),

  JWT_PRIVATE_KEY: Joi.string().allow('').default(''),
  JWT_PUBLIC_KEY: Joi.string().allow('').default(''),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  BCRYPT_COST: Joi.number().min(10).max(15).default(12),
  TOKEN_HASH_SECRET: Joi.string().min(16).default('dev_insecure_token_hash_secret_change_me'),

  OTP_TTL_SECONDS: Joi.number().default(600),
  OTP_LENGTH: Joi.number().valid(4, 6, 8).default(6),
  SMS_PROVIDER: Joi.string().allow('').default(''),
  SMS_API_KEY: Joi.string().allow('').default(''),
  SMS_SENDER_ID: Joi.string().allow('').default('DualMusic'),

  REDIS_URL: Joi.string().default('redis://127.0.0.1:6379'),
  REDIS_OPTIONAL: Joi.boolean().default(true),

  GOOGLE_CLIENT_ID: Joi.string().allow('').default(''),
  GOOGLE_CLIENT_SECRET: Joi.string().allow('').default(''),
  GOOGLE_REDIRECT_URI: Joi.string().allow('').default(''),
  // Audiences supplémentaires acceptées pour l'ID token natif (Web client IDs Firebase),
  // séparées par des virgules. Le GOOGLE_CLIENT_ID est déjà inclus automatiquement.
  GOOGLE_ALLOWED_AUDIENCES: Joi.string().allow('').default(''),

  LIVEKIT_URL: Joi.string().allow('').default(''),
  LIVEKIT_API_KEY: Joi.string().allow('').default(''),
  LIVEKIT_API_SECRET: Joi.string().allow('').default(''),
  // Enregistrement serveur des directs (LiveKit Egress → R2/S3) pour les replays.
  // Nécessite un service Egress LiveKit déployé + les creds S3 ci-dessous. Off par défaut.
  LIVEKIT_EGRESS_ENABLED: Joi.boolean().default(false),

  CINETPAY_API_KEY: Joi.string().allow('').default(''),
  CINETPAY_API_PASSWORD: Joi.string().allow('').default(''),
  CINETPAY_BASE_URL: Joi.string().allow('').default(''),
  // Multi-pays (1 compte = 1 pays) : JSON { "CI": { "key": "...", "password": "..." }, ... }.
  CINETPAY_ACCOUNTS: Joi.string().allow('').default(''),
  CINETPAY_NOTIFY_URL: Joi.string().allow('').default(''),
  CINETPAY_RETURN_URL: Joi.string().allow('').default(''),
  // URL de notification des transferts (PayOut). Distincte de celle des
  // encaissements : les deux flux ont des corps et des états différents.
  CINETPAY_PAYOUT_NOTIFY_URL: Joi.string().allow('').default(''),
  // Seuil d'alerte sur le solde marchand, en devise locale. 0 = surveillance off.
  CINETPAY_BALANCE_ALERT_THRESHOLD: Joi.number().min(0).default(0),

  MONEROO_SECRET_KEY: Joi.string().allow('').default(''),
  MONEROO_WEBHOOK_SECRET: Joi.string().allow('').default(''),

  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  STRIPE_PRICE_PRO: Joi.string().allow('').default(''),
  STRIPE_PRICE_PREMIUM: Joi.string().allow('').default(''),

  // Pilote de stockage des médias : `s3` (Cloudflare R2 / AWS S3, presign direct)
  // ou `local` (disque du backend, servi via /media). Décision d'infrastructure,
  // fixée au déploiement — voir docs/STORAGE.md.
  STORAGE_DRIVER: Joi.string().valid('s3', 'local').default('s3'),
  // Driver local : dossier de stockage sur disque + URL publique de base facultative
  // (repli sur API_BASE_URL/media si vide).
  LOCAL_STORAGE_DIR: Joi.string().default('storage/uploads'),
  LOCAL_PUBLIC_BASE_URL: Joi.string().allow('').default(''),

  S3_ENDPOINT: Joi.string().allow('').default(''),
  S3_REGION: Joi.string().default('auto'),
  S3_BUCKET: Joi.string().allow('').default('duel-music'),
  S3_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  S3_PUBLIC_BASE_URL: Joi.string().allow('').default(''),
  S3_PRESIGN_EXPIRES_SECONDS: Joi.number().default(900),

  CLAMAV_ENABLED: Joi.boolean().default(false),
  CLAMAV_HOST: Joi.string().default('127.0.0.1'),
  CLAMAV_PORT: Joi.number().port().default(3310),
  CLAMAV_TIMEOUT_MS: Joi.number().default(8000),

  MAIL_FROM: Joi.string().default('Dual Music <no-reply@dualmusic.app>'),
  SMTP_HOST: Joi.string().allow('').default('127.0.0.1'),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_SECURE: Joi.boolean().default(false),
  // URL publique absolue du logo affiché en en-tête des emails (sinon repli sur le texte).
  MAIL_LOGO_URL: Joi.string().allow('').default(''),
  RESEND_API_KEY: Joi.string().allow('').default(''),

  VAPID_PUBLIC_KEY: Joi.string().allow('').default(''),
  VAPID_PRIVATE_KEY: Joi.string().allow('').default(''),
  VAPID_SUBJECT: Joi.string().default('mailto:admin@dualmusic.app'),

  CREDIT_EUR_VALUE: Joi.number().default(0.5),
  EXCHANGE_RATE_API_URL: Joi.string().default('https://open.er-api.com/v6/latest/EUR'),
}).unknown(true);

const { value: env, error } = schema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
   
  console.error(
    '[env] Invalid environment configuration:\n' +
      error.details.map((d) => `  - ${d.message}`).join('\n'),
  );
  process.exit(1);
}

/** Parse un JSON d'environnement en objet, `{}` si vide/invalide. */
function parseJsonSafe(raw) {
  if (!raw || !String(raw).trim()) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * Immutable application configuration, grouped by concern.
 * @typedef {Readonly<typeof config>} AppConfig
 */
export const config = Object.freeze({
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  apiBaseUrl: env.API_BASE_URL,
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  logLevel: env.LOG_LEVEL,

  db: {
    dialect: env.DB_DIALECT,
    storage: env.DB_STORAGE,
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.NODE_ENV === 'test' ? env.DB_NAME_TEST : env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },

  jwt: {
    privateKey: env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    publicKey: env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
    bcryptCost: env.BCRYPT_COST,
    tokenHashSecret: env.TOKEN_HASH_SECRET,
  },

  otp: {
    ttlSeconds: env.OTP_TTL_SECONDS,
    length: env.OTP_LENGTH,
    smsProvider: env.SMS_PROVIDER,
    smsApiKey: env.SMS_API_KEY,
    smsSenderId: env.SMS_SENDER_ID,
  },

  redis: { url: env.REDIS_URL, optional: env.REDIS_OPTIONAL },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    // Audiences valides pour l'ID token natif : le client web + les extras déclarés.
    allowedAudiences: [env.GOOGLE_CLIENT_ID, ...String(env.GOOGLE_ALLOWED_AUDIENCES).split(',')]
      .map((s) => s.trim())
      .filter(Boolean),
  },

  livekit: {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    egressEnabled: env.LIVEKIT_EGRESS_ENABLED,
  },

  cinetpay: {
    // Nouvelle API v1 : api_key + api_password (clé sk_test_/sk_live_). Le compte par défaut
    // sert de repli quand un pays n'a pas d'entrée dédiée dans `accounts`.
    apiKey: env.CINETPAY_API_KEY,
    apiPassword: env.CINETPAY_API_PASSWORD,
    baseUrl: env.CINETPAY_BASE_URL,
    // Identifiants par pays (1 compte = 1 pays) : { CI: { key, password }, CM: {...}, ... }.
    accounts: parseJsonSafe(env.CINETPAY_ACCOUNTS),
    notifyUrl: env.CINETPAY_NOTIFY_URL,
    returnUrl: env.CINETPAY_RETURN_URL,
    payoutNotifyUrl: env.CINETPAY_PAYOUT_NOTIFY_URL,
    balanceAlertThreshold: env.CINETPAY_BALANCE_ALERT_THRESHOLD,
  },

  moneroo: { secretKey: env.MONEROO_SECRET_KEY, webhookSecret: env.MONEROO_WEBHOOK_SECRET },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    pricePro: env.STRIPE_PRICE_PRO,
    pricePremium: env.STRIPE_PRICE_PREMIUM,
  },

  storage: {
    // Pilote actif : 's3' (R2/S3) ou 'local' (disque backend).
    driver: env.STORAGE_DRIVER,
    local: {
      dir: env.LOCAL_STORAGE_DIR,
      publicBaseUrl: env.LOCAL_PUBLIC_BASE_URL,
    },
  },

  s3: {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL,
    presignExpires: env.S3_PRESIGN_EXPIRES_SECONDS,
  },

  clamav: {
    enabled: env.CLAMAV_ENABLED,
    host: env.CLAMAV_HOST,
    port: env.CLAMAV_PORT,
    timeoutMs: env.CLAMAV_TIMEOUT_MS,
  },

  mail: {
    from: env.MAIL_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
    smtpSecure: env.SMTP_SECURE,
    logoUrl: env.MAIL_LOGO_URL,
    resendApiKey: env.RESEND_API_KEY,
  },

  push: {
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY,
    vapidSubject: env.VAPID_SUBJECT,
  },

  economy: {
    creditEurValue: env.CREDIT_EUR_VALUE,
    exchangeRateApiUrl: env.EXCHANGE_RATE_API_URL,
  },
});

export default config;
