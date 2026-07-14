/**
 * @file Language negotiation middleware.
 *
 * Parses `Accept-Language` and pins `req.lang` to `fr` (default) or `en`,
 * so the error handler can localize machine-coded messages. Kept intentionally
 * tiny — full content i18n is a client concern; only API error text is localized.
 *
 * @module middlewares/language
 */

/**
 * @returns {import('express').RequestHandler}
 */
export function language() {
  return (req, _res, next) => {
    const header = String(req.headers['accept-language'] || '').toLowerCase();
    req.lang = header.startsWith('en') ? 'en' : 'fr';
    next();
  };
}

export default language;
