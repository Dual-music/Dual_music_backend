import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from '@apple/app-store-server-library';

import { config } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * @file Client StoreKit (App Store Server API) — vérification server-to-server
 * d'une transaction d'achat intégré iOS.
 *
 * Contrairement à CinetPay/Stripe (le serveur INITIE le paiement puis attend un
 * webhook), le flux StoreKit est inversé : le client achète via `Product.purchase()`
 * (StoreKit 2, côté iOS), puis envoie l'id de transaction ici pour règlement. On ne
 * fait JAMAIS confiance au JWS que le client pourrait transmettre directement —
 * on redemande la transaction à Apple via l'App Store Server API
 * (`getTransactionInfo`), authentifiée par une clé API App Store Connect, puis on
 * vérifie et décode la réponse signée (chaîne de certificats Apple) avant de lire
 * `productId`/`price`/`environment`. C'est la voie officiellement recommandée par
 * Apple (remplace l'ancien endpoint `/verifyReceipt`, déprécié).
 *
 * @see https://github.com/apple/app-store-server-library-node
 * @module services/payments/providers/apple.client
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_CA_PATH = path.resolve(__dirname, '..', '..', '..', 'config', 'certs', 'AppleRootCA-G3.cer');

/** @type {AppStoreServerAPIClient | null} */
let apiClient = null;
/** @type {SignedDataVerifier | null} */
let verifier = null;

function toLibraryEnvironment() {
  return config.appleIAP.environment === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
}

/** @returns {AppStoreServerAPIClient} */
function getApiClient() {
  if (!config.appleIAP.issuerId || !config.appleIAP.keyId || !config.appleIAP.privateKey) {
    throw ApiError.internal('APPLE_IAP_NOT_CONFIGURED');
  }
  if (!apiClient) {
    apiClient = new AppStoreServerAPIClient(
      config.appleIAP.privateKey,
      config.appleIAP.keyId,
      config.appleIAP.issuerId,
      config.appleIAP.bundleId,
      toLibraryEnvironment(),
    );
  }
  return apiClient;
}

/** @returns {SignedDataVerifier} */
function getVerifier() {
  if (!verifier) {
    const rootCA = fs.readFileSync(ROOT_CA_PATH);
    verifier = new SignedDataVerifier(
      [rootCA],
      // Vérifications en ligne (révocation) : activées — on est côté serveur, la
      // latence d'un aller-retour OCSP supplémentaire est négligeable face au coût
      // d'un crédit accordé sur une transaction révoquée.
      true,
      toLibraryEnvironment(),
      config.appleIAP.bundleId,
      config.appleIAP.appAppleId,
    );
  }
  return verifier;
}

/**
 * Récupère puis vérifie/décode une transaction StoreKit auprès d'Apple.
 * @param {string} transactionId - Id de transaction StoreKit fourni par le client.
 * @returns {Promise<import('@apple/app-store-server-library').JWSTransactionDecodedPayload>}
 * @throws {ApiError} `APPLE_VERIFY_FAILED` si Apple rejette la requête (id invalide,
 *   clé API mal configurée…) ou `APPLE_RECEIPT_INVALID` si la signature/l'app/
 *   l'environnement ne correspondent pas.
 */
export async function fetchVerifiedTransaction(transactionId) {
  let signedTransactionInfo;
  try {
    const response = await getApiClient().getTransactionInfo(transactionId);
    signedTransactionInfo = response.signedTransactionInfo;
  } catch (err) {
    throw ApiError.badRequest('APPLE_VERIFY_FAILED', { details: { message: err.message } });
  }
  if (!signedTransactionInfo) throw ApiError.badRequest('APPLE_VERIFY_FAILED');

  try {
    return await getVerifier().verifyAndDecodeTransaction(signedTransactionInfo);
  } catch (err) {
    throw ApiError.badRequest('APPLE_RECEIPT_INVALID', { details: { message: err.message } });
  }
}

export default { fetchVerifiedTransaction };
