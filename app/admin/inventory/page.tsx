import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import InventoryAdminClient from "./inventory-admin-client";

export const dynamic = "force-dynamic";

export default async function InventoryAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <InventoryAdminClient /> : <AdminLogin />;
}
