/**
 * A fixed or sticky nav bar stays while the browser
 * scrolls, so a whole-page screenshot shows the nav bar properly.
 */
export const FLATTEN_STICKY = `
(function () {
  document.querySelectorAll("*").forEach(function (el) {
    var style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") return;

    var width = el.offsetWidth;

    el.style.setProperty("position", "relative", "important");

    if (width > 0) el.style.setProperty("width", width + "px", "important");

    if (style.display === "flex" || style.display === "inline-flex") {
      el.style.setProperty("justify-content", "center", "important");
    }
  });
})();
`;
