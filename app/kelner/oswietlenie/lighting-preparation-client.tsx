"use client";

import { useEffect, useState } from "react";
import { clearWaiterSessionToken, waiterSessionHeaders } from "../waiter-session-client";
import { WaiterSectionHeader } from "../staff-navigation";

type Employee = { name: string };

export default function LightingPreparationClient() {
  const [employee, setEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/waiter/session", { cache: "no-store", headers: waiterSessionHeaders() })
      .then(async (response) => {
        if (response.status === 401) {
          clearWaiterSessionToken();
          window.location.replace("/kelner");
          return null;
        }
        if (!response.ok) return null;
        return response.json() as Promise<{ employee: Employee }>;
      })
      .then((body) => {
        if (active && body?.employee) setEmployee(body.employee);
      });
    return () => { active = false; };
  }, []);

  return <main className="waiter-lighting-page">
    <WaiterSectionHeader eyebrow="Sterowanie światłem" title="Oświetlenie lokalu" employeeName={employee?.name}/>
    <section className="waiter-lighting-preparation">
      <div className="waiter-lighting-preparation-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <div className="waiter-lighting-preparation-copy">
        <span className="waiter-lighting-status">W przygotowaniu</span>
        <h1>Budujemy sterowanie oświetleniem lokalu</h1>
        <p>W tym miejscu pojawi się obsługa punktów świetlnych BleBox, płynne ściemnianie oraz gotowe scenariusze uruchamiane jednym kliknięciem.</p>
      </div>
    </section>
    <section className="waiter-lighting-plan" aria-label="Planowane funkcje">
      <article><span>01</span><h2>Punkty świetlne</h2><p>Lista lamp z aktualnym stanem połączenia oraz przełącznikiem włącz / wyłącz.</p></article>
      <article><span>02</span><h2>Ściemniacze</h2><p>Suwaki do płynnej regulacji jasności urządzeń obsługujących ściemnianie.</p></article>
      <article><span>03</span><h2>Scenariusze</h2><p>Gotowe ustawienia na otwarcie, dzień, wieczór, sprzątanie i zamknięcie lokalu.</p></article>
    </section>
    <p className="waiter-lighting-note">Moduł ma charakter informacyjny — sterowanie urządzeniami nie jest jeszcze aktywne.</p>
  </main>;
}
