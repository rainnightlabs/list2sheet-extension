import {
  getStoredLicense,
  saveLicense,
  clearLicense,
  verifyLicense
} from "./shared/license-state.js";

const form = document.querySelector("#licenseForm");
const email = document.querySelector("#email");
const license = document.querySelector("#license");
const activate = document.querySelector("#activate");
const message = document.querySelector("#message");
const active = document.querySelector("#activeLicense");
const activeEmail = document.querySelector("#activeEmail");
const deactivate = document.querySelector("#deactivate");

function showMessage(text,type="") {
  message.hidden = false;
  message.className = "message" + (type ? " " + type : "");
  message.textContent = text;
}

async function renderStored() {
  const stored = await getStoredLicense();
  if (!stored) {
    active.hidden = true;
    form.hidden = false;
    return;
  }

  email.value = stored.email || "";
  license.value = stored.license || "";
  activeEmail.textContent = stored.email || "";
  active.hidden = false;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  activate.disabled = true;
  activate.textContent = "Verifying…";
  message.hidden = true;

  try {
    const result = await verifyLicense(email.value.trim(), license.value.trim());
    if (!result.ok) {
      showMessage("License verification failed. Check the purchase email and license, then try again.","error");
      return;
    }

    await saveLicense({
      email: email.value,
      license: license.value
    });

    activeEmail.textContent = email.value.trim().toLowerCase();
    active.hidden = false;
    showMessage("List2Sheet Pro is active on this browser.","success");
  } catch (error) {
    showMessage("Could not reach the Rainnight Labs license service. Check your connection and try again.","error");
  } finally {
    activate.disabled = false;
    activate.textContent = "Verify and activate";
  }
});

deactivate.addEventListener("click", async () => {
  await clearLicense();
  email.value = "";
  license.value = "";
  active.hidden = true;
  showMessage("License removed from this browser.");
});

renderStored();
