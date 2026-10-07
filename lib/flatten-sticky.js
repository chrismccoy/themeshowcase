/**
 * A fixed or sticky nav bar stays while the browser
 * scrolls, so a whole-page screenshot shows the nav bar properly.
 */
export const FLATTEN_STICKY = `
(function () {
  var targets = [];

  document.body.querySelectorAll("*").forEach(function (el) {
    var style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") return;

    targets.push({
      el: el,
      width: el.offsetWidth,
      isFlex: style.display === "flex" || style.display === "inline-flex",
    });
  });

  targets.forEach(function (t) {
    t.el.style.setProperty("position", "relative", "important");

    if (t.width > 0) {
      t.el.style.setProperty("width", t.width + "px", "important");
    }

    if (t.isFlex) {
      t.el.style.setProperty("justify-content", "center", "important");
    }
  });
})();
`;
