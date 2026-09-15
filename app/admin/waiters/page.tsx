import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import WaiterAdminClient from "./waiter-admin-client";

export const dynamic = "force-dynamic";

export default async function WaitersAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <WaiterAdminClient /> : <AdminLogin />;
}
