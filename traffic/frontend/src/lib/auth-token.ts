import { isTelegramMiniApp } from "@/lib/telegram";

const AUTH_KEYS = [
  "traffic_token",
  "traffic_role",
  "traffic_full_name",
  "traffic_teacher_id",
  "traffic_teacher_name",
] as const;

let memoryToken: string | null = null;

export function shouldUseEphemeralTeacherSession(role: string | null): boolean {
  return role === "teacher" && isTelegramMiniApp();
}

export function setMemoryToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken ?? localStorage.getItem("traffic_token");
}

export function clearPersistedAuth(): void {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key);
  }
}

export function clearAllAuth(): void {
  memoryToken = null;
  clearPersistedAuth();
}
