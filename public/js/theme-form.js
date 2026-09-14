/**
 * The screenshot drop zone on the add and edit theme forms.
 */

import { humanBytes } from "../../shared/bytes.js";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"];

export function startThemeForm({ root, win }) {
  const zone = root.getElementById("drop-zone");
  if (!zone) return;

  const input = root.getElementById("image");
  const preview = root.getElementById("drop-preview");
  const name = root.getElementById("drop-name");
  const error = root.getElementById("drop-error");
  const errorText = root.getElementById("drop-error-text");

  const maxBytes = Number(zone.dataset.maxBytes);
  const maxText = zone.dataset.maxText;

  function refuse(message) {
    errorText.textContent = message;
    error.classList.remove("hidden");

    input.value = "";
    preview.classList.add("hidden");
    preview.removeAttribute("src");
    name.textContent = "";
  }

  function forgive() {
    error.classList.add("hidden");
    errorText.textContent = "";
  }

  function accept(file) {
    forgive();
    name.textContent = `${file.name}, ${humanBytes(file.size)}`;

    const reader = new win.FileReader();
    reader.onload = () => {
      preview.setAttribute("src", String(reader.result));
      preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  }

  function consider(file) {
    if (!file) return;

    if (file.type && !ACCEPTED.includes(file.type)) {
      refuse("That is not a PNG, JPEG, WebP, AVIF or GIF picture.");
      return;
    }

    if (Number.isFinite(maxBytes) && file.size > maxBytes) {
      refuse(`That picture is ${humanBytes(file.size)}, over the ${maxText} limit.`);
      return;
    }

    accept(file);
  }

  input.addEventListener("change", () => consider(input.files?.[0]));

  for (const type of ["dragenter", "dragover"]) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
    });
  }

  for (const type of ["dragleave", "dragend"]) {
    zone.addEventListener(type, () => zone.classList.remove("is-over"));
  }

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-over");

    const files = event.dataTransfer?.files;
    if (!files?.length) return;

    input.files = files;
    consider(files[0]);
  });

  return { consider };
}
