/**
 * Reports whether application gives a response.
 */

/**
 * Builds the handler for `GET /health`.
 */
export function createHealthHandler({ themes, categories }) {
  return function reportHealth(req, res) {
    res.set("Cache-Control", "no-store");

    try {
      const themeCount = themes.list().length;
      const categoryCount = categories.list().length;
      res.json({ status: "ok", themes: themeCount, categories: categoryCount });
    } catch (error) {
      res.status(503).json({ status: "degraded", error: String(error?.message ?? error) });
    }
  };
}
