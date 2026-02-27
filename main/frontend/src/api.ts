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

export async function fetchResolveGroup(
  token: string,
  facultyAbbr: string,
  groupName: string,
): Promise<{ group_id: number; faculty_id: number }> {
  const params = new URLSearchParams({ faculty_abbr: facultyAbbr, group_name: groupName });
  const res = await fetch(`${BASE}/schedule/resolve-group?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to resolve group");
  return res.json();
}

export async function fetchGradebook(
  token: string,
): Promise<import("./types").GradebookResponse> {
  const res = await fetch(`${BASE}/gradebook`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка загрузки зачётки" }));
    throw new Error(err.detail || "Ошибка загрузки зачётки");
  }
  return res.json();
}

export async function fetchSchedule(
  token: string,
  groupId: number,
  date?: string,
) {
  const params = new URLSearchParams({ group_id: String(groupId) });
  if (date) params.set("date", date);
  const res = await fetch(`${BASE}/schedule?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load schedule");
  return res.json();
}
