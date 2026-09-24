import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import RoomsAdminClient from "./rooms-admin-client";

export const dynamic = "force-dynamic";

export default async function RoomsAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <RoomsAdminClient/> : <AdminLogin/>;
}
