"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Lets a page set the topbar title.
 *
 * The dashboard layout derives the title from the pathname, which is right for
 * almost every page and wrong for any page whose identity lives in a search
 * param — `/team?team=Admin` is one team's roster, not "Team". The layout can't
 * read search params without opting the whole shell into a CSR bailout, so the
 * page tells the layout instead.
 *
 * The override carries the path it was set on. Child effects run before parent
 * ones, so on navigation the new page's title can land before the old page's
 * cleanup fires; comparing paths means a stale title is ignored rather than
 * flashed.
 */
export interface PageTitleOverride {
  path: string;
  title: string;
}

export const PageTitleContext = createContext<
  ((next: PageTitleOverride | null) => void) | null
>(null);

/** Pass null to fall back to the layout's pathname-derived title. */
export function usePageTitle(title: string | null) {
  const set = useContext(PageTitleContext);
  const pathname = usePathname();

  useEffect(() => {
    if (!set) return;
    set(title ? { path: pathname, title } : null);
    return () => set(null);
  }, [set, pathname, title]);
}
