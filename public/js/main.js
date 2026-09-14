import { startPreviewer } from "./previewer.js";

startPreviewer({
  root: document,
  win: window,
  fallbackImage: document.getElementById("preview-image")?.dataset.fallback ?? "",
});
