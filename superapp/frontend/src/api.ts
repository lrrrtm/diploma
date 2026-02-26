const BASE = "/api";

export async function fetchMe(token: string) {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function fetchMiniApps(token: string) {
  const res = await fetch(`${BASE}/miniapps/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load mini-apps");
  return res.json();
}

export async function fetchLaunchToken(token: string): Promise<string> {
  const res = await fetch(`${BASE}/miniapps/launch-token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to get launch token");
  const data = await res.json();
  return data.launch_token;
}
