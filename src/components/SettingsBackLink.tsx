"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Back to wherever the page came from.
 *
 * A plain link rather than `router.back()`, deliberately. Browser back goes to
 * the previous *history* entry, which after a rename-and-return is another copy
 * of the same page; this always lands somewhere predictable, and it works when
 * someone opens the URL directly.
 */
export function SettingsBackLink({
  href = "/settings",
  label = "Settings",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
