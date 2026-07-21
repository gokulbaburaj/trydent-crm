-- Trydent Labs CRM — Store portal passwords for admin visibility
-- ⚠️ Deliberate tradeoff: passwords are stored in plaintext so admins can
-- retrieve them from the Portals page. Remove this column to revert:
--   alter table public.client_portals drop column portal_password;

alter table public.client_portals add column if not exists portal_password text;
