import { isAdmin } from "../../../../lib/admin-auth";
import AdminLogin from "../../admin-login";
import WorkforceKioskClient from "./workforce-kiosk-client";
import { currentWorkforceKiosk } from "../../../../lib/workforce-kiosk-auth";

export const dynamic = "force-dynamic";

export default async function WorkforceKioskPage() {
  let authenticated = false;
  try { authenticated = await isAdmin(); } catch { authenticated = false; }
  let kiosk = null;
  try { kiosk = await currentWorkforceKiosk(); } catch { kiosk = null; }
  return authenticated || kiosk ? <WorkforceKioskClient activate={authenticated}/> : <AdminLogin/>;
}
