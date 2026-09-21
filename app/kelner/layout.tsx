import type { Metadata } from "next";
import "./waiter.css";
import "./instrukcje/instruction-attachments.css";
import "./tablet-fixes.css";
import "./cash-day.css";
import "./grafik/workforce-employee.css";
import "./rezerwacje/reservations-employee.css";
import "./staff-navigation.css";
import "./unified-header.css";
import WaiterStaffDock from "./staff-navigation";

export const metadata: Metadata = { title: "Strefa kelnera — Atelier Café", robots: { index: false, follow: false } };

export default function WaiterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}<WaiterStaffDock/></>;
}
