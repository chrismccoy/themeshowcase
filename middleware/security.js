/**
 * Security headers, and the content security policy
 */

import helmet from "helmet";

export function security(config) {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        "style-src": ["'self'"],
        "font-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "upgrade-insecure-requests": config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
}
