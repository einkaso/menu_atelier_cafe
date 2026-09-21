import { isAdmin } from "../../../lib/admin-auth";
import AdminLogin from "../admin-login";
import ReservationsAdminClient from "./reservations-admin-client";
export const dynamic = "force-dynamic";
export default async function ReservationsAdminPage() { let authenticated = false; try { authenticated = await isAdmin(); } catch { authenticated = false; } return authenticated ? <ReservationsAdminClient/> : <AdminLogin/>; }
