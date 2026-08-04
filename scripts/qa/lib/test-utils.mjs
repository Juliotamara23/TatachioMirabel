export async function login(base, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();

  if (res.status !== 200) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(data)}`);
  }

  if (!data.token || typeof data.token !== "string") {
    throw new Error("Login response missing token");
  }

  return data.token;
}

export async function loginAdmin(base) {
  return login(base, "admin@tatachio.com", "admin123");
}

export async function loginCapitana(base) {
  return login(base, "capitana@tatachio.com", "cap123");
}

export async function request(base, method, path, { token, body, headers } = {}) {
  const url = `${base}${path}`;
  const requestHeaders = { ...headers };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

export function expectStatus(actual, expected, context = "") {
  // Normalize: spec-reader returns string codes ("200"), fetch returns number (200)
  if (String(actual) !== String(expected)) {
    const ctx = context ? ` — ${context}` : "";
    throw new Error(`Expected ${expected}, got ${actual}${ctx}`);
  }
}