const VERIFY_URL = "https://www.rainnightlabs.com/api/license-verify/";
const STORAGE_KEY = "list2sheet_license_v1";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStoredLicense() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

export async function saveLicense(data) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      email: data.email.trim().toLowerCase(),
      license: data.license.trim(),
      verifiedAt: Date.now()
    }
  });
}

export async function clearLicense() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

export async function verifyLicense(email, license) {
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({email, license})
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return {
    ok: response.ok && payload.valid === true,
    payload
  };
}

export async function getProState({forceVerify = false} = {}) {
  const stored = await getStoredLicense();
  if (!stored?.email || !stored?.license) {
    return {pro:false};
  }

  if (!forceVerify && stored.verifiedAt && Date.now() - stored.verifiedAt < CACHE_MS) {
    return {pro:true,email:stored.email,license:stored.license,cached:true};
  }

  try {
    const result = await verifyLicense(stored.email, stored.license);
    if (!result.ok) {
      await clearLicense();
      return {pro:false};
    }

    await saveLicense(stored);
    return {pro:true,email:stored.email,license:stored.license,cached:false};
  } catch {
    // A previously verified license keeps working offline for the cache window.
    if (stored.verifiedAt && Date.now() - stored.verifiedAt < CACHE_MS) {
      return {pro:true,email:stored.email,license:stored.license,cached:true};
    }
    return {pro:false,offline:true};
  }
}
