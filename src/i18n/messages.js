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
  CHAT_DISABLED: { fr: "L'hôte a désactivé le chat pour cet évènement.", en: 'The host has disabled chat for this event.' },
  ALREADY_MODERATOR: { fr: 'Cette personne est déjà modératrice de cet évènement.', en: 'This person is already a moderator of this event.' },
  CANDIDATE_REMOVE_FAILED: { fr: "Le retrait du candidat a échoué.", en: 'Failed to remove the candidate.' },
  MODERATOR_LIMIT_REACHED: { fr: "Le nombre maximum de modérateurs (2) est atteint pour cet évènement.", en: 'The maximum number of moderators (2) has been reached for this event.' },
  DEDICATIONS_DISABLED: { fr: 'Les dédicaces sont désactivées pour cet évènement.', en: 'Dedications are disabled for this event.' },
  DEDICATION_MESSAGE_REQUIRED: { fr: 'Le message de dédicace est trop court.', en: 'The dedication message is too short.' },
  DEDICATION_PRICE_BELOW_MIN: { fr: 'Le prix est inférieur au minimum autorisé.', en: 'The price is below the allowed minimum.' },
  DEDICATION_NOT_PENDING: { fr: "Cette dédicace n'est pas en attente de livraison.", en: 'This dedication is not awaiting delivery.' },
  DEDICATION_DEADLINE_PASSED: { fr: 'La date limite des demandes de dédicace est dépassée.', en: 'The dedication request deadline has passed.' },
  DEDICATIONS_CLOSED_LIVE: {
    fr: 'Les demandes de dédicace pour ce concert doivent être faites avant le direct.',
    en: 'Dedication requests for this concert must be made before the live broadcast.',
  },
  SPONSOR_NOT_ACCEPTED: { fr: "Cet évènement n'accepte pas les demandes de sponsor.", en: 'This event does not accept sponsor requests.' },
  GUESTS_DISABLED: { fr: 'Les invités sont désactivés pour ce direct.', en: 'Guests are disabled for this live.' },
  CONCERT_NOT_APPROVED: { fr: "Ce concert n'a pas encore été approuvé.", en: 'This concert has not been approved yet.' },
  MANUAL_CANDIDATES_DISABLED: {
    fr: "L'ajout manuel de candidat est désactivé par l'administrateur.",
    en: 'Manually adding a candidate has been disabled by the administrator.',
  },
  REWARD_NOT_DEFINED: { fr: 'Aucune récompense définie pour ce rang.', en: 'No reward defined for this rank.' },
  ALREADY_TICKETED: { fr: 'Vous possédez déjà un ticket pour cet évènement.', en: 'You already own a ticket for this event.' },
  TICKETS_SOLD_OUT: { fr: 'Plus de tickets disponibles.', en: 'No tickets available.' },
  BANNED_FROM_EVENT: { fr: 'Vous êtes banni de cet évènement.', en: 'You are banned from this event.' },

  // --- Recording ---------------------------------------------------------------
  RECORDING_NOT_CONFIGURED: { fr: "L'enregistrement serveur n'est pas configuré.", en: 'Server-side recording is not configured.' },
  RECORDING_MODE_DISABLED: { fr: "Ce mode d'enregistrement est désactivé.", en: 'This recording mode is disabled.' },
  RECORDING_ALREADY_ACTIVE: { fr: 'Un enregistrement est déjà en cours pour cet évènement.', en: 'A recording is already active for this event.' },
  RECORDING_NOT_ACTIVE: { fr: 'Aucun enregistrement actif à mettre en pause.', en: 'No active recording to pause.' },
  RECORDING_NOT_PAUSED: { fr: 'Aucun enregistrement en pause à reprendre.', en: 'No paused recording to resume.' },
  RECORDING_RESUME_FAILED: { fr: "La reprise de l'enregistrement a échoué.", en: 'Resuming the recording failed.' },
  RECORDING_START_FAILED: { fr: "Le démarrage de l'enregistrement a échoué.", en: 'Starting the recording failed.' },
  RECORDING_SAVE_FAILED: { fr: "La sauvegarde de l'enregistrement a échoué.", en: 'Saving the recording failed.' },

  // --- Payments --------------------------------------------------------------
  PAYMENT_PROVIDER_ERROR: { fr: 'Erreur du prestataire de paiement.', en: 'Payment provider error.' },
  WEBHOOK_SIGNATURE_INVALID: { fr: 'Signature de webhook invalide.', en: 'Invalid webhook signature.' },
  WEBHOOK_REPLAYED: { fr: 'Webhook déjà traité.', en: 'Webhook already processed.' },
  STRIPE_NOT_CONFIGURED: { fr: "Le paiement par carte n'est pas configuré.", en: 'Card payment is not configured.' },
  CINETPAY_OPERATOR_INVALID: {
    fr: "Cet opérateur Mobile Money n'est pas disponible pour ce pays.",
    en: 'This Mobile Money operator is not available for this country.',
  },
  APPLE_IAP_NOT_CONFIGURED: { fr: "Les achats intégrés Apple ne sont pas configurés.", en: 'Apple in-app purchases are not configured.' },
  APPLE_VERIFY_FAILED: { fr: 'Vérification Apple impossible.', en: 'Apple verification failed.' },
  APPLE_RECEIPT_INVALID: { fr: 'Reçu Apple invalide.', en: 'Invalid Apple receipt.' },
  APPLE_TRANSACTION_REVOKED: { fr: 'Cette transaction a été remboursée ou révoquée.', en: 'This transaction was refunded or revoked.' },
  APPLE_PRODUCT_UNKNOWN: { fr: 'Produit Apple inconnu.', en: 'Unknown Apple product.' },
  WALLET_CREDIT_FAILED: { fr: 'Le crédit du portefeuille a échoué.', en: 'Crediting the wallet failed.' },

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

  // --- Versement (transfert CinetPay) ----------------------------------------
  PAYOUT_PHONE_MISSING: {
    fr: 'Aucun numéro Mobile Money sur cette demande de retrait.',
    en: 'No Mobile Money number on this withdrawal request.',
  },
  PAYOUT_COUNTRY_UNSUPPORTED: {
    fr: "Le pays de ce numéro n'est pas couvert par le versement automatique.",
    en: 'This number’s country is not covered by automated payouts.',
  },
  PAYOUT_OPERATOR_INVALID: {
    fr: "L'opérateur enregistré n'est pas valide pour ce pays.",
    en: 'The registered operator is not valid for this country.',
  },
  PAYOUT_AMOUNT_TOO_LOW: {
    fr: 'Le montant converti est trop faible pour être versé.',
    en: 'The converted amount is too low to be paid out.',
  },
  PAYOUT_ALREADY_SUBMITTED: {
    fr: 'Ce retrait a déjà été transmis au prestataire.',
    en: 'This withdrawal has already been submitted to the provider.',
  },
  PAYOUT_FAILED: { fr: "Le versement n'a pas pu être lancé.", en: 'The payout could not be started.' },

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
