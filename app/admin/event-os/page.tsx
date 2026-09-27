import { currentAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import EventOsAdmin from "./event-os-admin";

export const dynamic = "force-dynamic";

export default async function EventOsPage() {
  const administrator = await currentAdmin().catch(() => null);
  return administrator ? <EventOsAdmin administratorName={administrator.employeeName ?? administrator.username} /> : <AdminLogin />;
}
