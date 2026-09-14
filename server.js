/**
 * Theme Showcase
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadEnvFileIfPresent } from "./config/index.js";
import { openDatabase } from "./lib/db.js";
import { createThemeRepository } from "./repositories/theme-repository.js";
import { createCategoryRepository } from "./repositories/category-repository.js";
import { createApp } from "./lib/app.js";

loadEnvFileIfPresent(path.dirname(fileURLToPath(import.meta.url)));

const config = loadConfig();
const db = openDatabase(config.databaseFile);

const app = createApp({
  config,
  themes: createThemeRepository(db),
  categories: createCategoryRepository(db),
});

app.listen(config.port, () => {
  console.log(`Theme previewer listening on http://localhost:${config.port}`);
});
