import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import WorkforceAdminClient from "./workforce-admin-client";

export const dynamic = "force-dynamic";

export default async function WorkforceAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <WorkforceAdminClient/> : <AdminLogin/>;
}
