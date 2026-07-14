import { redirect } from "next/navigation";

// "Activities" has been renamed to "Schedule". Keep this route alive as a
// redirect so old links/bookmarks still work.
export default function ActivitiesRedirect() {
  redirect("/schedule");
}
