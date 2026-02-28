const SSO_BASE = import.meta.env.VITE_SSO_URL ?? "https://sso.poly.hex8d.space";

export function goToSSOLogin() {
  const redirectTo = encodeURIComponent(window.location.origin + "/auth/callback");
  const appName = encodeURIComponent("Политехник.Услуги");
  window.location.replace(`${SSO_BASE}/?app=services&app_name=${appName}&redirect_to=${redirectTo}`);
}
