import {getUiLanguage,setUiLanguage,applyI18n,t} from "./shared/i18n.js";
import {
  getStoredLicense,
  saveLicense,
  clearLicense,
  verifyLicense
} from "./shared/license-state.js";

let uiLanguage="en";
const languageSelect=document.querySelector("#languageSelect");
const form = document.querySelector("#licenseForm");
const email = document.querySelector("#email");
const license = document.querySelector("#license");
const activate = document.querySelector("#activate");
const message = document.querySelector("#message");
const active = document.querySelector("#activeLicense");
const activeEmail = document.querySelector("#activeEmail");
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
  activate.textContent = tt("verifying");
  message.hidden = true;

  try {
    const result = await verifyLicense(email.value.trim(), license.value.trim());
    if (!result.ok) {
      showMessage(tt("verifyFailed"),"error");
      return;
    }

    await saveLicense({
      email: email.value,
      license: license.value
    });

    activeEmail.textContent = email.value.trim().toLowerCase();
    active.hidden = false;
    showMessage(tt("activated"),"success");
  } catch (error) {
    showMessage(tt("serviceUnavailable"),"error");
  } finally {
    activate.disabled = false;
    activate.textContent = tt("verifyActivate");
  }
});

deactivate.addEventListener("click", async () => {
  await clearLicense();
  email.value = "";
  license.value = "";
  active.hidden = true;
  showMessage(tt("licenseRemoved"));
});

languageSelect.addEventListener("change",async()=>{
  const lang=await setUiLanguage(languageSelect.value);
  await applyLanguage(lang);
});

(async()=>{
  await applyLanguage(await getUiLanguage());
  await renderStored();
})();
