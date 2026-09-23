import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import LightingAdminClient from "./lighting-admin-client";

export const dynamic = "force-dynamic";

export default async function LightingAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <LightingAdminClient /> : <AdminLogin />;
}
