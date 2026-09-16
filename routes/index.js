/**
 * The route table.
 */

import express from "express";
import { createPreviewerHandler } from "../controllers/previewer.js";
import { createMediaHandler } from "../controllers/media.js";
import { createHealthHandler } from "../controllers/health.js";
import { createAdminRouter } from "./admin.js";
import { notFound } from "../middleware/not-found.js";

/**
 * Builds the router.
 */
export function createRouter({ config, themes, categories, capture }) {
  const router = express.Router();

  router.get("/", createPreviewerHandler({ config, themes }));
  router.get("/media/theme/:id", createMediaHandler({ config, themes }));
  router.get("/health", createHealthHandler({ themes, categories }));

  const admin = createAdminRouter({ config, themes, categories, capture });
  router.use("/admin", admin.router);

  router.get("/media/tmp/:name", admin.requireSignedIn, admin.tempMedia);

  router.use(notFound("not-found"));

  return router;
}
