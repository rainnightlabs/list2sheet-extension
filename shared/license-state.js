const VERIFY_URL = "https://www.rainnightlabs.com/api/license-verify/";
const RELEASE_URL = "https://www.rainnightlabs.com/api/license-release/";
const STORAGE_KEY = "list2sheet_license_v1";
const INSTALLATION_KEY = "list2sheet_installation_id_v1";
const REVERIFY_MS = 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function createInstallationId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

export async function getInstallationId() {
  const result = await chrome.storage.local.get(INSTALLATION_KEY);
  const existing = String(result[INSTALLATION_KEY] || "").trim();
  if (existing) return existing;

  const installationId = createInstallationId();
  await chrome.storage.local.set({[INSTALLATION_KEY]: installationId});
  return installationId;
}

export async function getStoredLicense() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

export async function saveLicense(data) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      license: data.license.trim(),
      verifiedAt: Number(data.verifiedAt) || Date.now()
    }
  });
}

export async function clearLicense() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

async function postLicense(url, license) {
  const installationId = await getInstallationId();
  const response = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({license, installationId})
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return {
    response,
    payload,
    installationId
  };
}

export async function verifyLicense(license) {
  const {response, payload, installationId} = await postLicense(VERIFY_URL, license);

  return {
    ok: response.ok && payload.valid === true,
    unavailable: response.status >= 500 || response.status === 429 || payload.unavailable === true,
    reason: payload.reason || "",
    installationId,
    payload
  };
}

export async function releaseLicense(license) {
  const {response, payload, installationId} = await postLicense(RELEASE_URL, license);

  return {
    ok: response.ok && payload.ok === true,
    unavailable: response.status >= 500 || response.status === 429 || payload.unavailable === true,
    reason: payload.reason || "",
    installationId,
    payload
  };
}

export async function getProState({forceVerify = false} = {}) {
  const stored = await getStoredLicense();
  if (!stored?.license) {
    return {pro:false};
  }

  const age = stored.verifiedAt ? Date.now() - stored.verifiedAt : Infinity;
  if (!forceVerify && age < REVERIFY_MS) {
    return {pro:true,license:stored.license,cached:true};
  }

  try {
    const result = await verifyLicense(stored.license);
    if (result.ok) {
      await saveLicense({license:stored.license});
      return {
        pro:true,
        license:stored.license,
        cached:false,
        activations:result.payload.activations || null
      };
    }

    if (result.unavailable && age < OFFLINE_GRACE_MS) {
      return {pro:true,license:stored.license,cached:true,offlineGrace:true};
    }

    await clearLicense();
    return {pro:false,reason:result.reason || "invalid"};
  } catch {
    // Keep a previously verified purchase usable during a temporary outage,
    // but only for a bounded grace period.
    if (age < OFFLINE_GRACE_MS) {
      return {pro:true,license:stored.license,cached:true,offlineGrace:true};
    }
    return {pro:false,offline:true};
  }
}
