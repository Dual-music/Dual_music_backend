'use strict';

/**
 * @file Envoi de notifications push via Firebase Cloud Messaging (FCM).
 * @module services/push.service
 *
 * Initialisation paresseuse à partir d'une clé de service (compte de service Firebase).
 * Si aucune clé n'est configurée, le module devient un **no-op sûr** (aucune erreur) — le
 * reste de l'app (notifications in-app, email) continue de fonctionner.
 *
 * Chemin de la clé : env `FIREBASE_SERVICE_ACCOUNT` (défaut `./firebase-service-account.json`,
 * gitignoré). Ne jamais committer ce fichier.
 */

import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { logger } from '../config/logger.js';

let app = null;
let initialized = false;

/** Initialise Firebase Admin une seule fois. Renvoie `null` si non configuré. */
function getApp() {
  if (initialized) return app;
  initialized = true;
  try {
    const file = process.env.FIREBASE_SERVICE_ACCOUNT || path.resolve(process.cwd(), 'firebase-service-account.json');
    if (!fs.existsSync(file)) {
      logger.warn('FCM désactivé : clé de service Firebase absente (FIREBASE_SERVICE_ACCOUNT).');
      return null;
    }
    const serviceAccount = JSON.parse(fs.readFileSync(file, 'utf8'));
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    logger.info('FCM initialisé (Firebase Admin).');
    return app;
  } catch (err) {
    logger.error({ err }, 'Échec d\'initialisation FCM — push désactivé.');
    return null;
  }
}

/**
 * Envoie une notification push à une liste de tokens d'appareils.
 *
 * @param {string[]} tokens Jetons FCM des appareils du destinataire.
 * @param {{ title: string, body: string, data?: Record<string, string> }} payload
 * @returns {Promise<{ sent: number, invalidTokens: string[] }>} Nombre d'envois + tokens invalides.
 */
export async function sendPush(tokens, { title, body, data = {} }) {
  const a = getApp();
  if (!a || !Array.isArray(tokens) || tokens.length === 0) return { sent: 0, invalidTokens: [] };

  // Les valeurs `data` FCM doivent être des chaînes.
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringData,
    android: { priority: 'high' },
  });

  // Collecte les tokens invalides/expirés pour purge éventuelle par l'appelant.
  const invalidTokens = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        invalidTokens.push(tokens[i]);
      }
    }
  });
  return { sent: res.successCount, invalidTokens };
}

export default { sendPush };
