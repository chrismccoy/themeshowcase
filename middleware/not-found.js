/**
 * The response for a not found address
 */

/**
 * Builds the handler.
 */
export function notFound(view, locals = () => ({})) {
  return function handle(req, res) {
    res.status(404).set("Cache-Control", "no-store");

    if (!req.accepts("html")) {
      return res.type("txt").send("Not found");
    }

    return res.render(view, locals(req));
  };
}
