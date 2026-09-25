"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WaiterSectionHeader } from "../staff-navigation";
import { clearWaiterSessionToken, waiterSessionHeaders } from "../waiter-session-client";

type SensorStatus = "OK" | "ALERT" | "STALE" | "MISSING";
type ColdStorageSensor = {
  key: string;
  name: string;
  temperatureC: number | null;
  thresholdC: number;
  observedAt: string | null;
  status: SensorStatus;
};
type ColdStorageResponse = {
  employeeName?: string;
  checkedAt?: string;
  sensors?: ColdStorageSensor[];
  error?: string;
};

const statusCopy: Record<SensorStatus, { label: string; detail: string }> = {
  OK: { label: "Temperatura prawidłowa", detail: "Urządzenie pracuje poniżej progu alarmowego." },
  ALERT: { label: "Alarm temperatury", detail: "Temperatura osiągnęła próg alarmowy lub jest od niego wyższa." },
  STALE: { label: "Odczyt nieaktualny", detail: "Czujnik nie przekazał świeżych danych. Sprawdź urządzenie na miejscu." },
  MISSING: { label: "Brak odczytu", detail: "System nie otrzymał jeszcze danych z tego czujnika." },
};

function formatTemperature(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°C`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "Brak danych";
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export default function ColdStorageClient() {
  const [data, setData] = useState<ColdStorageResponse | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/waiter/environment-alerts", { cache: "no-store", credentials: "same-origin", headers: waiterSessionHeaders() });
      const body = await response.json().catch(() => ({})) as ColdStorageResponse;
      if (response.status === 401) {
        clearWaiterSessionToken();
        window.location.replace("/kelner");
        return;
      }
      if (!response.ok) {
        setError(body.error ?? "Nie udało się pobrać temperatur chłodni.");
        return;
      }
      setData(body);
      setError("");
    } catch {
      setError("Tablet nie może teraz pobrać temperatur. Sprawdź połączenie z siecią.");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const initialTimer = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const summary = useMemo(() => {
    if (!data) return { status: "unavailable", title: "Pobieram odczyty", detail: "Łączę się z zapisanymi pomiarami BleBox." };
    const sensors = data?.sensors ?? [];
    if (!sensors.length) return { status: "unavailable", title: "Brak skonfigurowanych czujników", detail: "Agent BleBox nie przesłał jeszcze temperatur urządzeń chłodniczych." };
    if (sensors.some((sensor) => sensor.status === "ALERT")) return { status: "alert", title: "Wymagana reakcja", detail: "Co najmniej jedno urządzenie przekroczyło próg −8°C." };
    if (sensors.some((sensor) => sensor.status === "STALE" || sensor.status === "MISSING")) return { status: "unavailable", title: "Sprawdź odczyty", detail: "Co najmniej jeden czujnik nie przekazuje aktualnych danych." };
    return { status: "ok", title: "Temperatury prawidłowe", detail: "Wszystkie urządzenia są poniżej ustawionego progu alarmowego." };
  }, [data]);

  return <main className="waiter-cold-page">
    <WaiterSectionHeader eyebrow="Kontrola temperatury" title="Chłodnie" employeeName={data?.employeeName}/>
    <section className={`waiter-cold-summary is-${summary.status}`}>
      <div><span>BLEBOX · ODCZYT AUTOMATYCZNY</span><h1>{summary.title}</h1><p>{summary.detail}</p></div>
      <div className="waiter-cold-summary-actions"><small>Sprawdzono: {formatTime(data?.checkedAt)}</small><button type="button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? "Odświeżam…" : "Odśwież teraz"}</button></div>
    </section>
    {error && <div className="waiter-cold-message" role="alert">{error}</div>}
    <section className="waiter-cold-grid" aria-live="polite">
      {data?.sensors?.map((sensor) => <article className={`waiter-cold-card is-${sensor.status.toLowerCase()}`} key={sensor.key}>
        <header><span>{statusCopy[sensor.status].label}</span><i aria-hidden="true"/></header>
        <h2>{sensor.name}</h2>
        <strong>{formatTemperature(sensor.temperatureC)}</strong>
        <p>{statusCopy[sensor.status].detail}</p>
        <footer><span>Próg alarmu <b>{formatTemperature(sensor.thresholdC)}</b></span><span>Odczyt <b>{formatTime(sensor.observedAt)}</b></span></footer>
      </article>)}
    </section>
    {data && !data.sensors?.length && <section className="waiter-cold-empty"><strong>Brak skonfigurowanych czujników</strong><p>Agent BleBox nie przesłał jeszcze temperatur urządzeń chłodniczych.</p></section>}
    {!data && !error && <section className="waiter-cold-empty"><strong>Pobieram temperatury…</strong></section>}
    <aside className="waiter-cold-note"><b>Jak działa alarm?</b><p>System ostrzega od temperatury −8,00°C oraz wtedy, gdy odczyt z czujnika jest starszy niż 5 minut. Ekran odświeża się automatycznie.</p></aside>
  </main>;
}
