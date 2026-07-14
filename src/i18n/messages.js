/**
 * @file Bilingual (FR/EN) error-message catalog keyed by machine code.
 *
 * Every error returned by the API carries a stable `code`; the human-readable
 * message is resolved here based on the request's `Accept-Language` header
 * (defaulting to French, the platform's primary language).
 *
 * @module i18n/messages
 */

/**
 * @typedef {{ fr: string, en: string }} LocalizedMessage
 * @type {Record<string, LocalizedMessage>}
 */
export const MESSAGES = {
  // --- Generic ---------------------------------------------------------------
  BAD_REQUEST: { fr: 'Requête invalide.', en: 'Bad request.' },
  VALIDATION_ERROR: { fr: 'Les données envoyées sont invalides.', en: 'Validation failed.' },
  UNAUTHENTICATED: { fr: 'Authentification requise.', en: 'Authentication required.' },
  INVALID_TOKEN: { fr: 'Jeton invalide ou expiré.', en: 'Invalid or expired token.' },
  FORBIDDEN: { fr: "Vous n'êtes pas autorisé à effectuer cette action.", en: 'You are not allowed to perform this action.' },
  NOT_FOUND: { fr: 'Ressource introuvable.', en: 'Resource not found.' },
  CONFLICT: { fr: 'Conflit avec l’état actuel de la ressource.', en: 'Conflict with the current resource state.' },
  UNPROCESSABLE_ENTITY: { fr: 'Entité non traitable.', en: 'Unprocessable entity.' },
  RATE_LIMITED: { fr: 'Trop de requêtes. Réessayez plus tard.', en: 'Too many requests. Try again later.' },
  INTERNAL_ERROR: { fr: 'Une erreur interne est survenue.', en: 'An internal error occurred.' },
  IDEMPOTENCY_KEY_REQUIRED: { fr: "En-tête Idempotency-Key requis.", en: 'Idempotency-Key header is required.' },
  IDEMPOTENCY_KEY_CONFLICT: { fr: 'Cette clé d’idempotence a déjà été utilisée avec un autre contenu.', en: 'This idempotency key was already used with a different payload.' },
  IDEMPOTENCY_IN_PROGRESS: { fr: 'Une requête identique est déjà en cours de traitement.', en: 'An identical request is already being processed.' },

  // --- Auth ------------------------------------------------------------------
  EMAIL_ALREADY_USED: { fr: 'Cette adresse email est déjà utilisée.', en: 'This email is already in use.' },
  PHONE_ALREADY_USED: { fr: 'Ce numéro de téléphone est déjà utilisé.', en: 'This phone number is already in use.' },
  INVALID_CREDENTIALS: { fr: 'Identifiants incorrects.', en: 'Invalid credentials.' },
  ACCOUNT_BANNED: { fr: 'Ce compte a été banni.', en: 'This account has been banned.' },
  PHONE_NOT_VERIFIED: { fr: 'Votre numéro de téléphone doit être vérifié.', en: 'Your phone number must be verified.' },
  OTP_INVALID: { fr: 'Code de vérification invalide.', en: 'Invalid verification code.' },
  OTP_EXPIRED: { fr: 'Code de vérification expiré.', en: 'Verification code expired.' },
  OTP_RATE_LIMITED: { fr: 'Trop de demandes de code. Patientez.', en: 'Too many code requests. Please wait.' },

  // --- Wallet / economy ------------------------------------------------------
  WALLET_INSUFFICIENT: { fr: 'Solde de crédits insuffisant.', en: 'Insufficient credit balance.' },
  WALLET_NOT_FOUND: { fr: 'Portefeuille introuvable.', en: 'Wallet not found.' },
  AMOUNT_INVALID: { fr: 'Montant invalide.', en: 'Invalid amount.' },
  WITHDRAWAL_PIN_REQUIRED: { fr: 'Code PIN de retrait requis.', en: 'Withdrawal PIN required.' },
  WITHDRAWAL_PIN_INVALID: { fr: 'Code PIN incorrect.', en: 'Incorrect withdrawal PIN.' },
  WITHDRAWAL_PIN_LOCKED: { fr: 'Code PIN bloqué après trop de tentatives.', en: 'PIN locked after too many attempts.' },

  // --- Events ----------------------------------------------------------------
  EVENT_NOT_LIVE: { fr: "L'évènement n'est pas en direct.", en: 'The event is not live.' },
  DEDICATIONS_DISABLED: { fr: 'Les dédicaces sont désactivées pour cet évènement.', en: 'Dedications are disabled for this event.' },
  DEDICATION_MESSAGE_REQUIRED: { fr: 'Le message de dédicace est trop court.', en: 'The dedication message is too short.' },
  DEDICATION_PRICE_BELOW_MIN: { fr: 'Le prix est inférieur au minimum autorisé.', en: 'The price is below the allowed minimum.' },
  DEDICATION_NOT_PENDING: { fr: "Cette dédicace n'est pas en attente de livraison.", en: 'This dedication is not awaiting delivery.' },
  REWARD_NOT_DEFINED: { fr: 'Aucune récompense définie pour ce rang.', en: 'No reward defined for this rank.' },
  ALREADY_TICKETED: { fr: 'Vous possédez déjà un ticket pour cet évènement.', en: 'You already own a ticket for this event.' },
  TICKETS_SOLD_OUT: { fr: 'Plus de tickets disponibles.', en: 'No tickets available.' },
  BANNED_FROM_EVENT: { fr: 'Vous êtes banni de cet évènement.', en: 'You are banned from this event.' },

  // --- Payments --------------------------------------------------------------
  PAYMENT_PROVIDER_ERROR: { fr: 'Erreur du prestataire de paiement.', en: 'Payment provider error.' },
  WEBHOOK_SIGNATURE_INVALID: { fr: 'Signature de webhook invalide.', en: 'Invalid webhook signature.' },
  WEBHOOK_REPLAYED: { fr: 'Webhook déjà traité.', en: 'Webhook already processed.' },
  STRIPE_NOT_CONFIGURED: { fr: "Le paiement par carte n'est pas configuré.", en: 'Card payment is not configured.' },

  // --- Withdrawals & PIN -----------------------------------------------------
  PIN_NOT_SET: { fr: "Aucun code PIN de retrait n'est défini.", en: 'No withdrawal PIN is set.' },
  PIN_WRONG: { fr: 'Code PIN incorrect.', en: 'Incorrect PIN.' },
  PIN_LOCKED: { fr: 'Code PIN bloqué après trop de tentatives. Réessayez plus tard.', en: 'PIN locked after too many attempts. Try again later.' },
  PIN_CURRENT_REQUIRED: { fr: 'Le code PIN actuel est requis pour le modifier.', en: 'The current PIN is required to change it.' },
  PIN_WRONG_CURRENT: { fr: 'Code PIN actuel incorrect.', en: 'Current PIN is incorrect.' },
  PIN_RESET_INVALID: { fr: 'Code de réinitialisation invalide ou expiré.', en: 'Invalid or expired reset code.' },
  NO_PAYOUT_METHOD: { fr: 'Aucune coordonnée de retrait enregistrée.', en: 'No payout method registered.' },
  WITHDRAWAL_BELOW_MINIMUM: { fr: 'Montant inférieur au minimum autorisé.', en: 'Amount below the allowed minimum.' },
  WITHDRAWAL_FAILED: { fr: 'La demande de retrait a échoué.', en: 'The withdrawal request failed.' },
  WITHDRAWAL_NOT_PENDING: { fr: "Ce retrait n'est pas en attente.", en: 'This withdrawal is not pending.' },
  WITHDRAWAL_NOT_APPROVED: { fr: "Ce retrait n'est pas approuvé.", en: 'This withdrawal is not approved.' },
  WITHDRAWAL_REVERT_FAILED: { fr: "Le remboursement du retrait a échoué.", en: 'The withdrawal refund failed.' },

  // --- Subscriptions ---------------------------------------------------------
  NO_ACTIVE_SUBSCRIPTION: { fr: 'Aucun abonnement actif.', en: 'No active subscription.' },
  SUBSCRIPTION_CANCEL_FAILED: { fr: "L'annulation de l'abonnement a échoué.", en: 'Subscription cancellation failed.' },

  // --- Sponsors --------------------------------------------------------------
  SPONSOR_NO_TIER: { fr: 'Aucun tarif ne correspond à cette durée.', en: 'No price tier matches this duration.' },
  SPONSOR_DEADLINE_PASSED: { fr: 'La date limite de soumission est dépassée.', en: 'The submission deadline has passed.' },
  SPONSOR_PAYMENT_FAILED: { fr: 'Le paiement du sponsoring a échoué.', en: 'The sponsor payment failed.' },
  EVENT_NOT_FOUND: { fr: 'Évènement introuvable.', en: 'Event not found.' },
  AD_NOT_FOUND: { fr: 'Publicité introuvable.', en: 'Ad not found.' },

  // --- Referrals -------------------------------------------------------------
  REFERRAL_DISABLED: { fr: 'Le parrainage est désactivé.', en: 'Referrals are disabled.' },
  REFERRAL_NOT_COMPLETED: { fr: "Ce parrainage n'est pas encore validé.", en: 'This referral is not completed yet.' },
  REFERRAL_ALREADY_CLAIMED: { fr: 'Récompense déjà réclamée.', en: 'Reward already claimed.' },
  REFERRAL_CLAIM_FAILED: { fr: 'La réclamation de la récompense a échoué.', en: 'Claiming the reward failed.' },

  // --- Uploads / storage -----------------------------------------------------
  STORAGE_UNAVAILABLE: { fr: "Le stockage de fichiers n'est pas disponible.", en: 'File storage is unavailable.' },
  UNSUPPORTED_MEDIA_TYPE: { fr: 'Type de fichier non autorisé.', en: 'Unsupported file type.' },
  FILE_TOO_LARGE: { fr: 'Fichier trop volumineux.', en: 'File is too large.' },
  FILE_INFECTED: { fr: 'Fichier rejeté : menace détectée par l’antivirus.', en: 'File rejected: a threat was detected by the antivirus.' },

  // --- Streaming / integrations ----------------------------------------------
  LIVEKIT_NOT_CONFIGURED: { fr: "Le streaming n'est pas configuré.", en: 'Streaming is not configured.' },
  OAUTH_NOT_CONFIGURED: { fr: "La connexion via ce fournisseur n'est pas configurée.", en: 'Login via this provider is not configured.' },
};

/**
 * Resolves a localized message for a code.
 * @param {string} code
 * @param {'fr'|'en'} [lang='fr']
 * @param {string} [fallback] - Used when the code is unknown.
 * @returns {string}
 */
export function resolveMessage(code, lang = 'fr', fallback) {
  const entry = MESSAGES[code];
  if (!entry) return fallback || MESSAGES.INTERNAL_ERROR[lang] || code;
  return entry[lang] || entry.fr;
}

export default MESSAGES;
