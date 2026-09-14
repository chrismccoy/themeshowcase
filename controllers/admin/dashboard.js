/**
 * The dashboard page
 */

/**
 * Builds the handler for `GET /admin`.
 */
export function createDashboardController({ themes, categories }) {
  return {
    show(req, res) {
      res.locals.active = "dashboard";
      res.render("admin/dashboard", {
        title: "Dashboard",
        themeCount: themes.list().length,
        categoryCount: categories.list().length,
      });
    },
  };
}
