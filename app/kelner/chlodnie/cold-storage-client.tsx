"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WaiterSectionHeader } from "../staff-navigation";
import { clearWaiterSessionToken, waiterSessionHeaders } from "../waiter-session-client";

type SensorStatus = "OK" | "ALERT" | "STALE" | "MISSING" | "INFO" | "OFF";
type ColdStorageSensor = {
  key: string;
  name: string;
  temperatureC: number | null;
  thresholdC: number | null;
  observedAt: string | null;
  status: SensorStatus;
  monitoringMode: "ALWAYS" | "SWITCHED" | "INFO";
  monitoringEnabled: boolean;
  monitoringUpdatedAt: string | null;
  monitoringUpdatedByName: string | null;
  requiresAttention: boolean;
};
type ColdStorageResponse = {
  employeeName?: string;
  checkedAt?: string;
  sensors?: ColdStorageSensor[];
  error?: string;
};

const statusCopy: Record<SensorStatus, { label: string; detail: string }> = {
  OK: { label: "Temperatura prawidłowa", detail: "Urządzenie pracuje poniżej progu alarmowego." },
  ALERT: { label: "Alarm temperatury", detail: "Temperatura przekroczyła dopuszczalny zakres dla tego urządzenia." },
  STALE: { label: "Odczyt nieaktualny", detail: "Czujnik nie przekazał świeżych danych. Sprawdź urządzenie na miejscu." },
  MISSING: { label: "Brak odczytu", detail: "System nie otrzymał jeszcze danych z tego czujnika." },
  INFO: { label: "Pomiar informacyjny", detail: "Temperatura pomieszczenia jest wyświetlana bez uruchamiania alertów." },
  OFF: { label: "Urządzenie wyłączone", detail: "Monitoring i alerty są wstrzymane do czasu oznaczenia urządzenia jako uruchomione." },
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
  const [switching, setSwitching] = useState("");

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

  const setMonitoring = useCallback(async (sensor: ColdStorageSensor, monitoringEnabled: boolean) => {
    setSwitching(sensor.key); setError("");
    try {
      const response = await fetch("/api/waiter/environment-alerts", {
        method: "PUT",
        credentials: "same-origin",
        headers: waiterSessionHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ key: sensor.key, monitoringEnabled }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (response.status === 401) { clearWaiterSessionToken(); window.location.replace("/kelner"); return; }
      if (!response.ok) { setError(body.error ?? "Nie udało się zmienić stanu monitorowania lodówki."); return; }
      await load();
    } catch {
      setError("Tablet nie może teraz zmienić stanu monitorowania. Sprawdź połączenie z siecią.");
    } finally {
      setSwitching("");
    }
  }, [load]);

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
    if (sensors.some((sensor) => sensor.requiresAttention && sensor.status === "ALERT")) return { status: "alert", title: "Wymagana reakcja", detail: "Co najmniej jedno monitorowane urządzenie przekroczyło swój próg alarmowy." };
    if (sensors.some((sensor) => sensor.requiresAttention && (sensor.status === "STALE" || sensor.status === "MISSING"))) return { status: "unavailable", title: "Sprawdź odczyty", detail: "Co najmniej jeden monitorowany czujnik nie przekazuje aktualnych danych." };
    return { status: "ok", title: "Temperatury prawidłowe", detail: "Wszystkie uruchomione urządzenia pracują w ustawionych zakresach." };
  }, [data]);

  const monitoredSensors = data?.sensors?.filter((sensor) => sensor.monitoringMode !== "INFO") ?? [];
  const informationalSensors = data?.sensors?.filter((sensor) => sensor.monitoringMode === "INFO") ?? [];
  const sensorCard = (sensor: ColdStorageSensor) => <article className={`waiter-cold-card is-${sensor.status.toLowerCase()}`} key={sensor.key}>
    <header><span>{statusCopy[sensor.status].label}</span><i aria-hidden="true"/></header>
    <h2>{sensor.name}</h2>
    <strong>{formatTemperature(sensor.temperatureC)}</strong>
    <p>{statusCopy[sensor.status].detail}</p>
    {sensor.monitoringMode === "SWITCHED" && <div className="waiter-cold-monitoring">
      <button type="button" className={sensor.monitoringEnabled ? "is-on" : "is-off"} aria-pressed={sensor.monitoringEnabled} disabled={switching === sensor.key} onClick={() => void setMonitoring(sensor, !sensor.monitoringEnabled)}><span>Uruchomiona</span><b>{switching === sensor.key ? "Zapisuję…" : sensor.monitoringEnabled ? "TAK" : "NIE"}</b></button>
      <small>{sensor.monitoringUpdatedAt ? `Ostatnia zmiana: ${formatTime(sensor.monitoringUpdatedAt)}${sensor.monitoringUpdatedByName ? ` · ${sensor.monitoringUpdatedByName}` : ""}` : "Ustaw stan zgodnie z rzeczywistą pracą urządzenia."}</small>
    </div>}
    <footer><span>{sensor.thresholdC === null ? "Tryb pomiaru" : "Próg alarmu"}<b>{sensor.thresholdC === null ? "Informacyjny" : formatTemperature(sensor.thresholdC)}</b></span><span>Odczyt <b>{formatTime(sensor.observedAt)}</b></span></footer>
  </article>;

  return <main className="waiter-cold-page">
    <WaiterSectionHeader eyebrow="Kontrola temperatury" title="Chłodnie" employeeName={data?.employeeName}/>
    <section className={`waiter-cold-summary is-${summary.status}`}>
      <div><span>BLEBOX · ODCZYT AUTOMATYCZNY</span><h1>{summary.title}</h1><p>{summary.detail}</p></div>
      <div className="waiter-cold-summary-actions"><small>Sprawdzono: {formatTime(data?.checkedAt)}</small><button type="button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? "Odświeżam…" : "Odśwież teraz"}</button></div>
    </section>
    {error && <div className="waiter-cold-message" role="alert">{error}</div>}
    <section className="waiter-cold-grid" aria-live="polite">
      {monitoredSensors.map(sensorCard)}
    </section>
    {informationalSensors.length > 0 && <section className="waiter-cold-information"><header><span>POMIAR POMIESZCZENIA</span><h2>Temperatura otoczenia</h2><p>Te odczyty są wyłącznie informacyjne i nie powodują alertów.</p></header><div>{informationalSensors.map(sensorCard)}</div></section>}
    {data && !data.sensors?.length && <section className="waiter-cold-empty"><strong>Brak skonfigurowanych czujników</strong><p>Agent BleBox nie przesłał jeszcze temperatur urządzeń chłodniczych.</p></section>}
    {!data && !error && <section className="waiter-cold-empty"><strong>Pobieram temperatury…</strong></section>}
    <aside className="waiter-cold-note"><b>Jak działa alarm?</b><p>Zamrażarki alarmują od −8,00°C. Lodówka szklana alarmuje po przekroczeniu 10,00°C, ale tylko gdy jest oznaczona jako uruchomiona. Temperatura pomieszczenia nie wywołuje alertów. Monitorowane urządzenia wymagają również świeżego odczytu z ostatnich 5 minut.</p></aside>
  </main>;
}
