/**
 * The generate of the screenshot field.
 */

export function startScreenshot({ root, win }) {
  const generate = root.getElementById("mode-generate");
  if (!generate) return;

  const upload = root.getElementById("mode-upload");
  const panel = root.getElementById("generate-panel");
  const uploadPanel = root.getElementById("upload-panel");
  const button = root.getElementById("generate-button");
  const captureUrl = root.getElementById("capture-url");
  const hidden = root.getElementById("generated-file");
  const preview = root.getElementById("capture-preview");
  const file = root.getElementById("image");
  const error = root.getElementById("drop-error");
  const errorText = root.getElementById("drop-error-text");

  const fileWasRequired = file.hasAttribute("required");

  function showPanel() {
    panel.classList.toggle("hidden", !generate.checked);
    uploadPanel?.classList.toggle("hidden", generate.checked);

    if (generate.checked) {
      file.removeAttribute("required");
      return;
    }

    if (fileWasRequired) file.setAttribute("required", "");

    if (!hidden.value) return;

    hidden.value = "";
    preview.classList.add("hidden");
    preview.removeAttribute("src");
  }

  function refuse(message) {
    errorText.textContent = message;
    error.classList.remove("hidden");
  }

  function forgive() {
    error.classList.add("hidden");
    errorText.textContent = "";
  }

  generate.addEventListener("change", showPanel);
  upload?.addEventListener("change", showPanel);
  showPanel();

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    forgive();

    const label = button.innerHTML;
    button.disabled = true;
    button.textContent = "Generating...";

    try {
      const form = new win.FormData(button.form);
      form.set("mode", "generate");
      form.set("captureUrl", captureUrl.value);
      form.delete("image");

      const response = await win.fetch("/admin/themes/screenshot", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: form,
      });

      const result = await response.json();
      if (!result.ok) throw new Error(result.error ?? "That screenshot could not be taken.");

      hidden.value = result.generatedFile;
      preview.setAttribute("src", result.preview);
      preview.classList.remove("hidden");
      file.removeAttribute("required");
    } catch (failure) {
      hidden.value = "";
      refuse(failure.message);
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });
}
