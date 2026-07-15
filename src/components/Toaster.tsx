"use client";

import { Toaster as Sonner, toast } from "sonner";

/** Real sonner (shadcn's toast library) — same toast.success/error/info API we had. */
export { toast };

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={16}
      toastOptions={{
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          borderRadius: "var(--radius-md)",
          fontSize: "13px",
        },
      }}
    />
  );
}
