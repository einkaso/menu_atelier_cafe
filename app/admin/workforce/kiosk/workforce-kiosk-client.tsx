"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;
type Result = { action: "CLOCK_IN" | "CLOCK_OUT"; employee: string; occurredAt: string; workedMinutes?: number };

export default function WorkforceKioskClient({ activate }: { activate: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null); const streamRef = useRef<MediaStream | null>(null); const scanningRef = useRef(false);
  const [cameraState, setCameraState] = useState<"START" | "ACTIVE" | "UNSUPPORTED" | "ERROR">("START");
  const [message, setMessage] = useState("Zeskanuj kod QR pracownika"); const [result, setResult] = useState<Result | null>(null); const [manual, setManual] = useState("");

  async function send(payload: string) {
    if (scanningRef.current) return; scanningRef.current = true; setResult(null);
    const response = await fetch("/api/workforce/kiosk/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload, kioskName: "Tablet wejściowy" }) });
    const body = await response.json().catch(() => ({})) as Result & { error?: string };
    if (!response.ok) setMessage(body.error ?? "Nie udało się zapisać odbicia."); else { setResult(body); setMessage(body.action === "CLOCK_IN" ? "Wejście zapisane" : "Wyjście zapisane"); }
    window.setTimeout(() => { scanningRef.current = false; setResult(null); setMessage("Zeskanuj kod QR pracownika"); }, response.ok ? 4500 : 2500);
  }

  async function startCamera() {
    try {
      const DetectorApi = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
      if (!DetectorApi) { setCameraState("UNSUPPORTED"); return; }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraState("ACTIVE"); const detector = new DetectorApi({ formats: ["qr_code"] });
      const scan = async () => { const video = videoRef.current; if (!video || !streamRef.current) return; if (!scanningRef.current && video.readyState >= 2) { try { const [code] = await detector.detect(video); if (code?.rawValue) void send(code.rawValue); } catch { /* next frame */ } } window.setTimeout(scan, 250); };
      void scan();
      try { await navigator.wakeLock?.request("screen"); } catch { /* browser may deny wake lock */ }
    } catch { setCameraState("ERROR"); setMessage("Nie udało się uruchomić kamery. Sprawdź jej uprawnienia."); }
  }

  useEffect(() => { if (activate) void fetch("/api/admin/workforce/kiosk-session", { method: "POST" }); return () => streamRef.current?.getTracks().forEach((track) => track.stop()); }, [activate]);
  function manualSubmit(event: FormEvent) { event.preventDefault(); if (manual.trim()) { void send(manual.trim()); setManual(""); } }
  const time = result ? new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(new Date(result.occurredAt)) : "";

  return <main className="workforce-kiosk">
    <header><img src="/logo-cafe.png" alt="Atelier Café"/><div><span>EWIDENCJA CZASU PRACY</span><b>{new Intl.DateTimeFormat("pl-PL", { dateStyle: "full" }).format(new Date())}</b></div><Link href="/admin/workforce">Wyjdź z trybu tabletu</Link></header>
    <section className={`workforce-kiosk-stage${result ? " has-result" : ""}`}><video ref={videoRef} playsInline muted/><div className="workforce-kiosk-frame" aria-hidden="true"/>{cameraState === "START" && <button onClick={() => void startCamera()}>Uruchom skaner QR</button>}{cameraState === "UNSUPPORTED" && <p>Ta przeglądarka nie obsługuje skanowania aparatem. Użyj Chrome na tablecie albo czytnika kodów.</p>}</section>
    <section className={`workforce-kiosk-message${result ? ` is-${result.action.toLowerCase()}` : ""}`}><span>{message}</span>{result && <><strong>{result.employee}</strong><b>{time}</b>{result.action === "CLOCK_OUT" && <small>Przepracowano {Math.floor((result.workedMinutes ?? 0) / 60)} h {(result.workedMinutes ?? 0) % 60} min</small>}</>}</section>
    <form onSubmit={manualSubmit}><label>Awaryjny odczyt z czytnika<input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Kliknij tutaj i zeskanuj kod"/></label><button>Odczytaj</button></form>
  </main>;
}
