const VERIFY_URL = "https://www.rainnightlabs.com/api/license-verify/";
const STORAGE_KEY = "list2sheet_license_v1";
const REVERIFY_MS = 24 * 60 * 60 * 1000;
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function verifyLicense(license) {
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({license})
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return {
    ok: response.ok && payload.valid === true,
    unavailable: response.status >= 500 || response.status === 429 || payload.unavailable === true,
    reason: payload.reason || "",
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
      return {pro:true,license:stored.license,cached:false};
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
