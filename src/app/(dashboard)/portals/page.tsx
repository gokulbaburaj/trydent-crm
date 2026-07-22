import { redirect } from "next/navigation";

/**
 * Client Portals were merged into the Clients page — portal management now
 * lives in each client's detail drawer. Old links land on Clients.
 */
export default function PortalsRedirect() {
  redirect("/clients");
}
