import { currentAdmin } from "../../lib/admin-auth";
import AdminLogin from "./admin-login";
import AdminPanel from "./admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const administrator = await currentAdmin().catch(() => null);

  return administrator ? <AdminPanel administratorName={administrator.employeeName ?? administrator.username} /> : <AdminLogin />;
}
