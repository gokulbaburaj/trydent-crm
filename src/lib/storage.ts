"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * File storage for client documents and invoices.
 *
 * Until now the only way to attach anything was to paste a link, which meant
 * every "document" in a client's portal was only as durable as somebody else's
 * Drive sharing settings. Both tables have carried a `storage_path` column
 * since they were built; this is what finally fills it.
 *
 * The bucket is PRIVATE. A public bucket hands any object to anyone who can
 * guess the URL, and these are contracts and invoices. Reads therefore go
 * through a short-lived signed URL rather than a permanent one.
 */

export const BUCKET = "client-files";

/** 25 MB, matching the bucket's own limit so we can fail before uploading. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Object key: `<client_id>/<random>-<safe name>`.
 *
 * Storage has no foreign keys, so the leading path segment is the ONLY thing
 * tying an object to a client — the RLS policy reads it with
 * `storage.foldername(name)[1]`. Change this shape and access control breaks
 * silently, which is why it lives in one function.
 *
 * The random prefix is not decoration: two people uploading `invoice.pdf` in
 * the same week must not overwrite each other.
 */
export function objectPath(clientId: string, fileName: string): string {
  const safe = fileName
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
  return `${clientId}/${crypto.randomUUID()}-${safe}`;
}

export interface UploadResult {
  path: string;
  name: string;
}

/** Uploads and returns the stored path, or throws with something readable. */
export async function uploadClientFile(
  clientId: string,
  file: File
): Promise<UploadResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`
    );
  }
  const supabase = createClient();
  if (!supabase) throw new Error("Not connected.");

  const path = objectPath(clientId, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    // Never overwrite. The path already carries a uuid, so a collision here
    // means something is wrong and we'd rather hear about it than lose a file.
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return { path, name: file.name };
}

/**
 * A link that works for a few minutes.
 *
 * Short-lived on purpose: a signed URL is a bearer token, and one pasted into
 * a group chat shouldn't still open a contract next month.
 */
export async function signedUrl(path: string, seconds = 300): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Opens a stored file in a new tab. Returns false if the link couldn't be made. */
export async function openStoredFile(path: string): Promise<boolean> {
  const url = await signedUrl(path);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Best-effort delete.
 *
 * Deliberately non-throwing. If the row is gone but the object lingers you
 * have an orphan costing a few kilobytes; if we blocked the row delete on the
 * object delete, a storage hiccup would leave a document nobody can remove.
 * The cheaper failure is the right one.
 */
export async function removeStoredFile(path: string | null | undefined) {
  if (!path) return;
  const supabase = createClient();
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
