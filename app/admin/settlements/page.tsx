import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import SettlementsAdminClient from "./settlements-admin-client";

export const dynamic = "force-dynamic";

export default async function SettlementsAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <SettlementsAdminClient /> : <AdminLogin />;
}
