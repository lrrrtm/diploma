const SSO_BASE = import.meta.env.VITE_SSO_URL ?? "https://sso.poly.hex8d.space";

export function goToSSOLogin() {
  const redirectTo = encodeURIComponent(window.location.origin + "/auth/callback");
  window.location.href = `${SSO_BASE}/?app=services&redirect_to=${redirectTo}`;
}
