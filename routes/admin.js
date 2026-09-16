/**
 * The admin route table.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createSessions } from "../lib/session.js";
import { csrf } from "../middleware/csrf.js";
import { createLoginRateLimit } from "../middleware/login-rate-limit.js";
import { requireAdmin, isSignedIn } from "../middleware/require-admin.js";
import { notFound } from "../middleware/not-found.js";
import { adminAllowList } from "../middleware/admin-allow-list.js";
import { adminLocals } from "../middleware/admin-locals.js";
import { createAuthController } from "../controllers/admin/auth.js";
import { createDashboardController } from "../controllers/admin/dashboard.js";
import { createFlash } from "../lib/flash.js";
import { createCategoriesController } from "../controllers/admin/categories.js";
import { createThemesController } from "../controllers/admin/themes.js";
import { createScreenshotController } from "../controllers/admin/screenshot.js";
import { createThemeFormView } from "../controllers/admin/theme-form-view.js";
import { createTempMediaHandler } from "../controllers/media.js";
import { createUpload } from "../middleware/upload.js";
import { createUrlGuard } from "../lib/safe-url.js";
import { createTempShots } from "../lib/temp-shots.js";
import { createCapture } from "../lib/screenshot.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Builds the router mounted at /admin.
 */
export function createAdminRouter({ config, themes, categories, capture }) {
  const router = express.Router();

  const sessions = createSessions({
    secret: config.sessionSecret,
    ttlHours: config.sessionTtlHours,
    isProduction: config.isProduction,
  });

  const rateLimit = createLoginRateLimit({
    maxAttempts: config.loginMaxAttempts,
    windowMinutes: config.loginWindowMinutes,
  });

  const auth = createAuthController({ config, sessions, rateLimit });
  const dashboard = createDashboardController({ themes, categories });
  const flash = createFlash(config.sessionSecret);
  const categoriesController = createCategoriesController({ categories, flash });

  const uploadDir = path.resolve(rootDir, config.uploadDir);
  const upload = createUpload({ uploadDir, maxBytes: config.maxImageBytes });

  const tempShots = createTempShots({
    uploadDir,
    ttlMinutes: config.screenshot.tempTtlMinutes,
  });

  const themesController = createThemesController({
    themes,
    categories,
    flash,
    upload,
    uploadDir,
    maxImageBytes: config.maxImageBytes,
    screenshotEnabled: config.screenshot.enabled,
    tempShots,
  });

  const screenshot = createScreenshotController({
    guard: createUrlGuard(),
    capture:
      capture ??
      createCapture({
        width: config.screenshot.width,
        height: config.screenshot.height,
        timeoutMs: config.screenshot.timeoutMs,
      }),
    tempShots,
    renderForm: createThemeFormView({
      categories,
      maxImageBytes: config.maxImageBytes,
      screenshotEnabled: config.screenshot.enabled,
    }),
    maxImageBytes: config.maxImageBytes,
    themes,
  });

  router.use(adminLocals(config));

  router.use(adminAllowList(config.adminAllowedIps));

  router.use(express.urlencoded({ extended: false }));
  router.use(csrf({ isProduction: config.isProduction }));

  router.use((req, res, next) => {
    const carried = flash.read(req.headers.cookie);
    if (carried) {
      res.locals.flash = carried;
      res.append("Set-Cookie", flash.clearCookieHeader());
    }
    next();
  });

  router.get("/", requireAdmin(sessions), dashboard.show);
  router.get("/login", auth.showLogin);
  router.post("/login", rateLimit.middleware, auth.login);
  router.post("/logout", requireAdmin(sessions), auth.logout);

  router.get("/categories", requireAdmin(sessions), categoriesController.list);
  router.post("/categories", requireAdmin(sessions), categoriesController.create);
  router.post("/categories/:id", requireAdmin(sessions), categoriesController.rename);
  router.post("/categories/:id/delete", requireAdmin(sessions), categoriesController.remove);

  router.post("/themes/screenshot", requireAdmin(sessions), upload.middleware, (req, res, next) => {
    if (!config.screenshot.enabled) {
      upload.discard(req.file);
      return res.status(404).type("txt").send("Not found");
    }
    return screenshot(req, res, next);
  });

  router.get("/themes", requireAdmin(sessions), themesController.list);
  router.get("/themes/new", requireAdmin(sessions), themesController.newForm);
  router.post("/themes", requireAdmin(sessions), upload.middleware, themesController.create);
  router.get("/themes/:id/edit", requireAdmin(sessions), themesController.editForm);
  router.post("/themes/:id", requireAdmin(sessions), upload.middleware, themesController.update);
  router.post("/themes/:id/delete", requireAdmin(sessions), themesController.remove);
  router.post("/themes/:id/move", requireAdmin(sessions), themesController.move);

  router.use(
    notFound("admin/not-found", (req) => ({ signedIn: isSignedIn(sessions, req), title: "Not found" }))
  );

  return {
    router,
    sessions,
    requireSignedIn: requireAdmin(sessions),
    tempMedia: createTempMediaHandler({ tempShots }),
  };
}
