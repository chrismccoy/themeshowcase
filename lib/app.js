/**
 * Builds the application.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import { createRouter } from "../routes/index.js";
import { viewLocals } from "../middleware/view-locals.js";
import { security } from "../middleware/security.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewsDir = path.join(rootDir, "views");
const publicDir = path.join(rootDir, "public");
const sharedDir = path.join(rootDir, "shared");

/**
 * Sets up the middleware and routes.
 */
export function createApp({ config, themes, categories, capture }) {
  const app = express();

  app.set("trust proxy", config.trustProxy);
  app.set("view engine", "ejs");
  app.set("views", viewsDir);
  app.disable("x-powered-by");

  app.use(viewLocals());
  app.use(security(config));

  app.use(compression());
  app.use(express.static(publicDir, { maxAge: config.isProduction ? "1h" : 0 }));
  app.use("/shared", express.static(sharedDir, { maxAge: config.isProduction ? "1h" : 0 }));
  app.use(createRouter({ config, themes, categories, capture }));

  return app;
}
