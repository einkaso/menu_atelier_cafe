import type { Metadata } from "next";
import "./admin.css";
import "./cash-day-admin.css";
import "./instructions/instructions.css";
import "./instructions/attachments.css";
import "./workforce/workforce.css";
import "./reservations/reservations.css";
import "./new-modules-tablet.css";
import "./waiters/employee-qr.css";
import "./unified-header.css";
import "./lighting/lighting.css";
import "./rooms/rooms.css";

export const metadata: Metadata = {
  title: "Panel menu — Banaszek Café",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin-shell">{children}</div>;
}
