-- Storage for client documents and invoice PDFs.
--
-- Applied live 2026-07-31 (migration name `client_files_storage_bucket`);
-- this file exists so the repo matches the database.
--
-- `client_documents.storage_path` and `invoices.storage_path` have existed
-- since those tables were built and have sat empty this whole time, because
-- there was nowhere to put a file. The only way to attach anything was to
-- paste a link, which means every document in a client's portal was only as
-- durable as somebody else's sharing settings.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-files',
  'client-files',
  -- PRIVATE. A public bucket hands any object to anyone who can guess the
  -- URL, and these are contracts and invoices. Reads go through short-lived
  -- signed URLs so access is checked at request time.
  false,
  26214400, -- 25 MB. Room for a scanned contract; not enough for a stray video
            -- to quietly become your storage bill.
  array[
    'application/pdf',
    'image/png','image/jpeg','image/webp','image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object keys are `<client_id>/<uuid>-<filename>`, built by objectPath() in
-- lib/storage.ts. Storage has no foreign keys, so that leading path segment is
-- the ONLY thing tying an object to a client — which is what makes the policy
-- below expressible. Change the key shape and access control breaks silently.

drop policy if exists client_files_staff_all on storage.objects;
drop policy if exists client_files_client_read on storage.objects;

create policy client_files_staff_all on storage.objects
  for all
  using (bucket_id = 'client-files' and public.current_can('clients'))
  with check (bucket_id = 'client-files' and public.current_can('clients'));

-- A client reads only objects in their own folder, AND only if the row
-- pointing at the object is one they're allowed to see. Checking the row
-- rather than just the path is what keeps a draft invoice's PDF invisible
-- even though it sits in that client's folder.
create policy client_files_client_read on storage.objects
  for select
  using (
    bucket_id = 'client-files'
    and public.current_role_name() = 'client'
    and (storage.foldername(name))[1] = public.current_client_id()::text
    and (
      exists (
        select 1 from public.client_documents d
        where d.storage_path = storage.objects.name
          and d.client_id = public.current_client_id()
      )
      or exists (
        select 1 from public.invoices i
        where i.storage_path = storage.objects.name
          and i.client_id = public.current_client_id()
          and i.status <> 'draft'
      )
    )
  );
