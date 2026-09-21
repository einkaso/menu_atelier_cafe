import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import InstructionsAdminClient from "./instructions-admin-client";

export const dynamic = "force-dynamic";

export default async function InstructionsAdminPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  return authenticated ? <InstructionsAdminClient /> : <AdminLogin />;
}
