-- Trydent Labs CRM — Contractor role (staff portal)
-- Run this FIRST, on its own, in the Supabase SQL editor. Postgres won't let a
-- new enum value be used in the same transaction that adds it, so this is a
-- separate file from the staff-portal tables/policies (run 2026-07-22c after).
-- Safe to re-run.

alter type public.user_role add value if not exists 'contractor';
