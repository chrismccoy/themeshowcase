import crypto from "node:crypto";

export function viewLocals() {
  return (req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString("base64");
    next();
  };
}
