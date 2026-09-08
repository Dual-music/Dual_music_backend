/**
 * @file Catalogue des produits StoreKit consommables (recharge de crédits, iOS).
 *
 * Contrairement à CinetPay/Stripe (montant libre saisi par l'utilisateur), Apple
 * impose des paliers de PRIX FIXES : chaque `productId` ci-dessous doit exister
 * dans App Store Connect (Fonctionnalités de l'app → Achats intégrés → Consommable),
 * avec le MÊME identifiant et un palier de prix cohérent avec `credits`.
 *
 * ⚠️ Le nombre de crédits crédité est TOUJOURS lu ici, jamais fourni par le client
 * (`POST /payments/apple/verify` n'envoie que `transactionId`) — même principe que
 * CinetPay/Stripe, où le serveur ne fait jamais confiance à un montant client.
 *
 * Paliers de test (2026-09-08, décidés avec l'utilisateur) : 1 crédit = 0,01 $
 * (même ratio que `economic_config.credit_value_usd`, voir pricing.service.js),
 * pour rester cohérent avec le web/Android. **Paliers définitifs de production à
 * trancher par l'équipe avant publication** — modifier ce fichier suffit, aucune
 * migration de schéma nécessaire (`credit_purchases.payment_method` est une
 * colonne libre).
 *
 * @module config/appleIAPProducts
 */

/** @type {Record<string, number>} productId (App Store Connect) → crédits accordés. */
export const APPLE_IAP_PRODUCTS = {
  'com.dualmusic.app.credits.tier1': 99, // 0,99 $
  'com.dualmusic.app.credits.tier2': 499, // 4,99 $
  'com.dualmusic.app.credits.tier3': 999, // 9,99 $
  'com.dualmusic.app.credits.tier4': 1999, // 19,99 $
  'com.dualmusic.app.credits.tier5': 4999, // 49,99 $
};

/**
 * Crédits accordés pour un `productId`, ou `undefined` si inconnu (produit non
 * catalogué — la vérification doit échouer plutôt que crédit un montant arbitraire).
 * @param {string} productId
 * @returns {number | undefined}
 */
export function creditsForAppleProduct(productId) {
  return APPLE_IAP_PRODUCTS[productId];
}

export default { APPLE_IAP_PRODUCTS, creditsForAppleProduct };
