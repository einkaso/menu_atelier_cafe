import { isAdmin } from "../../lib/admin-auth";
import AdminLogin from "./admin-login";
import AdminPanel from "./admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let authenticated = false;
  try {
    authenticated = await isAdmin();
  } catch {
    authenticated = false;
  }

  return authenticated ? <AdminPanel /> : <AdminLogin />;
}
