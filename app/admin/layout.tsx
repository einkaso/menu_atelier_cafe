import type { Metadata } from "next";
import "./admin.css";
import "./cash-day-admin.css";

export const metadata: Metadata = {
  title: "Panel menu — Banaszek Café",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="admin-shell">{children}</div>;
}
