import {getUiLanguage,setUiLanguage,applyI18n,t} from "./shared/i18n.js";
import {
  getStoredLicense,
  saveLicense,
  clearLicense,
  verifyLicense,
  releaseLicense,
  getProState
} from "./shared/license-state.js";

let uiLanguage="en";
const languageSelect=document.querySelector("#languageSelect");
const form = document.querySelector("#licenseForm");
const license = document.querySelector("#license");
const activate = document.querySelector("#activate");
const message = document.querySelector("#message");
const active = document.querySelector("#activeLicense");
const deactivate = document.querySelector("#deactivate");

function tt(key,...args){return t(key,uiLanguage,...args);}

async function applyLanguage(lang){
  uiLanguage=lang;
  applyI18n(uiLanguage);
  languageSelect.value=uiLanguage;
}

function showMessage(text,type="") {
  message.hidden = false;
  message.className = "message" + (type ? " " + type : "");
  message.textContent = text;
}

function showLicenseReason(reason) {
  if (reason === "refunded") {
    showMessage(tt("licenseRefunded"),"error");
  } else if (reason === "chargeback") {
    showMessage(tt("licenseChargeback"),"error");
  } else if (reason === "activation_limit") {
    showMessage(tt("activationLimit"),"error");
  } else {
    showMessage(tt("verifyFailed"),"error");
  }
}

async function renderStored() {
  const stored = await getStoredLicense();
  if (!stored?.license) {
    active.hidden = true;
    form.hidden = false;
    return;
  }

  license.value = stored.license;
  const state = await getProState({forceVerify:true});
  if (state.pro) {
    active.hidden = false;
    form.hidden = true;
    return;
  }

  active.hidden = true;
  form.hidden = false;
  license.value = "";
  if (state.reason) {
    showLicenseReason(state.reason);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  activate.disabled = true;
  activate.textContent = tt("verifying");
  message.hidden = true;

  try {
    const result = await verifyLicense(license.value.trim());
    if (!result.ok) {
      if (result.unavailable) {
        showMessage(tt("serviceUnavailable"),"error");
      } else {
        showLicenseReason(result.reason);
      }
      return;
    }

    await saveLicense({
      license: license.value
    });

    active.hidden = false;
    form.hidden = true;
    showMessage(tt("activated"),"success");
  } catch (error) {
    showMessage(tt("serviceUnavailable"),"error");
  } finally {
    activate.disabled = false;
    activate.textContent = tt("verifyActivate");
  }
});

deactivate.addEventListener("click", async () => {
  const stored = await getStoredLicense();
  if (!stored?.license) {
    await clearLicense();
    license.value = "";
    active.hidden = true;
    form.hidden = false;
    showMessage(tt("licenseRemoved"));
    return;
  }

  deactivate.disabled = true;
  message.hidden = true;

  try {
    const released = await releaseLicense(stored.license);
    if (!released.ok && released.unavailable) {
      showMessage(tt("releaseUnavailable"),"error");
      return;
    }

    await clearLicense();
    license.value = "";
    active.hidden = true;
    form.hidden = false;
    showMessage(tt("licenseRemoved"));
  } catch {
    showMessage(tt("releaseUnavailable"),"error");
  } finally {
    deactivate.disabled = false;
  }
});

languageSelect.addEventListener("change",async()=>{
  const lang=await setUiLanguage(languageSelect.value);
  await applyLanguage(lang);
});

(async()=>{
  await applyLanguage(await getUiLanguage());
  await renderStored();
})();
