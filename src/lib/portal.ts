/** Domain appended to portal usernames to form the Supabase auth email. */
export const PORTAL_EMAIL_DOMAIN = "portal.trydentlabs.com";

export function portalEmail(username: string) {
  return `${username.trim().toLowerCase()}@${PORTAL_EMAIL_DOMAIN}`;
}

/** Letters, numbers, dots, dashes, underscores; 3–30 chars. */
export function isValidPortalUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(username.trim().toLowerCase());
}
