const form = document.querySelector("#mod-form");
const emptyState = document.querySelector("#empty-state");
const summary = document.querySelector("#summary");
const summaryName = document.querySelector("#summary-name");
const summaryVersion = document.querySelector("#summary-version");
const summaryPackage = document.querySelector("#summary-package");
const summaryDescription = document.querySelector("#summary-description");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const addonName = data.get("addonName").trim();
  const minecraftVersion = data.get("minecraftVersion").trim();
  const packageType = data.get("packageType");
  const modDescription = data.get("modDescription").trim();

  summaryName.textContent = addonName;
  summaryVersion.textContent = minecraftVersion;
  summaryPackage.textContent = `.${packageType}`;
  summaryDescription.textContent = modDescription;

  emptyState.hidden = true;
  summary.hidden = false;
});
