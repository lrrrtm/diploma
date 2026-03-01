interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string | null {
  const initData = getTelegramWebApp()?.initData?.trim() ?? "";
  return initData.length > 0 ? initData : null;
}

export function isTelegramMiniApp(): boolean {
  return getTelegramInitData() !== null;
}

export async function loginTeacherViaTelegramMiniApp(): Promise<string | null> {
  const webApp = getTelegramWebApp();
  const initData = getTelegramInitData();
  if (!webApp || !initData) return null;

  webApp.ready?.();
  webApp.expand?.();

  const response = await fetch("/api/auth/telegram-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ init_data: initData }),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}
