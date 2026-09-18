import type { Metadata } from "next";
import "./waiter.css";
import "./tablet-fixes.css";
import "./cash-day.css";

export const metadata: Metadata = { title: "Strefa kelnera — Atelier Café", robots: { index: false, follow: false } };

export default function WaiterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}<a className="waiter-inventory-floating" href="/kelner/inventory">Inwentaryzacja</a></>;
}
