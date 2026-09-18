"use client";

import { useEffect, useRef, useState } from "react";
import type { GuestReceipt } from "../../lib/guest-receipt";
import { lockGuestPortraitOrientation, unlockGuestOrientation } from "./guest-orientation";

const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const date = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" });
type ServedBy = NonNullable<GuestReceipt["servedBy"]>;

function GuestThankYouMedia({ servedBy }: { servedBy: ServedBy }) {
  const [mediaSource, setMediaSource] = useState<string | null>(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [playBlocked, setPlayBlocked] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!servedBy.mediaUrl) return;
    let disposed = false;
    let objectUrl: string | null = null;
    void fetch(servedBy.mediaUrl, { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Thank-you media unavailable");
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (disposed) URL.revokeObjectURL(objectUrl);
        else setMediaSource(objectUrl);
      })
      .catch(() => { if (!disposed) setMediaFailed(true); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [servedBy.mediaUrl]);

  useEffect(() => {
    if (!mediaSource || servedBy.mediaType !== "VIDEO" || !video.current) return;
    video.current.muted = true;
    void video.current.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
  }, [mediaSource, servedBy.mediaType]);

  function playVideo() {
    if (!video.current) return;
    video.current.muted = true;
    void video.current.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
  }

  return <div className={`guest-personal-thanks-media${mediaSource ? " has-media" : ""}`}>
    {mediaSource && servedBy.mediaType === "GIF" ? <div className="guest-personal-thanks-clip"><img src={mediaSource} alt={`Podziękowanie od ${servedBy.name}`}/></div> : mediaSource && servedBy.mediaType === "VIDEO" ? <div className="guest-personal-thanks-clip"><video ref={video} src={mediaSource} autoPlay loop muted playsInline preload="auto" onCanPlay={playVideo} aria-label={`Podziękowanie od ${servedBy.name}`}/></div> : <span className={mediaFailed ? "is-error" : undefined} aria-label={mediaFailed ? "Nie udało się wczytać animacji" : undefined}>{mediaFailed ? "↻" : "♥"}</span>}
    {playBlocked && <button type="button" className="guest-thanks-play" onClick={playVideo}>Uruchom animację</button>}
  </div>;
}

export default function GuestReceiptView({ receipt }: { receipt: GuestReceipt }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const requiredComplete = receipt.surveyQuestions.every((question) => !question.required || Boolean(answers[String(question.id)]));
  const qrUrl = receipt.reviewUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(receipt.reviewUrl)}` : null;

  useEffect(() => {
    void lockGuestPortraitOrientation();
    return unlockGuestOrientation;
  }, []);

  async function finish() {
    if (!requiredComplete) return;
    setFinishing(true); setError("");
    const save = await fetch("/api/guest/feedback", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers }) }).catch(() => null);
    if (!save?.ok) {
      const body = await save?.json().catch(() => ({})) as { error?: string } | undefined;
      setError(body?.error ?? "Nie udało się zapisać odpowiedzi. Spróbuj ponownie."); setFinishing(false); return;
    }
    await fetch("/api/guest/receipt", { method: "DELETE", credentials: "same-origin" }).catch(() => null);
    window.location.replace("/");
  }

  return <main className="guest-receipt-screen"><aside className="guest-portrait-prompt" role="status"><b>Obróć tablet pionowo</b><span>Ten ekran jest przygotowany do podania gościowi w pionie.</span></aside><section className="guest-receipt-paper"><header><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/><h1>Dziękujemy za wizytę</h1><p>{receipt.tableName} · {date.format(new Date(receipt.completedAt))}</p><small>{receipt.documentNumber}</small></header><div className="guest-receipt-items">{receipt.items.map((item) => <article key={item.id}><div><b>{item.quantity} ×</b><span>{item.name}{item.customizations.length > 0 && <small>{item.customizations.join(" · ")}</small>}</span></div><strong>{money.format(Number(item.total))}</strong></article>)}</div><div className="guest-receipt-total"><span>Razem</span><strong>{money.format(Number(receipt.total))}</strong></div>{receipt.payments.length > 0 && <div className="guest-receipt-payments">{receipt.payments.map((payment) => <p key={payment.id}><span>{payment.label}</span><b>{money.format(Number(payment.amount))}</b></p>)}</div>}<p className="guest-receipt-fiscal-note">To elektroniczne podsumowanie rachunku. Dokument fiskalny wystawia kasa.</p></section>{receipt.servedBy && <section className="guest-personal-thanks"><GuestThankYouMedia servedBy={receipt.servedBy}/><div><span>OD OSOBY, KTÓRA CIĘ OBSŁUGIWAŁA</span><h2>{receipt.servedBy.name}</h2><p>„Dziękuję i zapraszam ponownie!”</p></div></section>}<section className="guest-after-survey"><span>JUŻ PO RACHUNKU</span><h2>Jak minęła wizyta?</h2><p>Ta krótka ankieta jest niezależna od pytań zadawanych przed zamówieniem i nie zbiera danych osobowych.</p>{receipt.surveyQuestions.map((question, index) => <fieldset key={question.id}><legend>{index + 1}. {question.prompt}{question.required && <small>wymagane</small>}</legend><div className={question.kind === "RATING" ? "is-rating" : ""}>{question.options.map((option) => <button type="button" key={option} className={answers[String(question.id)] === option ? "is-selected" : ""} onClick={() => setAnswers((current) => ({ ...current, [String(question.id)]: option }))}>{question.kind === "RATING" ? <><b>{option}</b><small>★</small></> : option}</button>)}</div></fieldset>)}</section><section className="guest-google-review"><h2>Podobało Ci się?</h2><p>Będzie nam bardzo miło, jeśli zostawisz opinię w Google. To naprawdę pomaga małym miejscom.</p>{qrUrl && receipt.reviewUrl ? <><a href={receipt.reviewUrl} target="_blank" rel="noreferrer"><img src={qrUrl} alt="Kod QR do wystawienia opinii w Google"/></a><a className="guest-google-button" href={receipt.reviewUrl} target="_blank" rel="noreferrer">Oceń nas w Google</a></> : <small>Link do opinii Google zostanie tu wyświetlony po jego skonfigurowaniu.</small>}</section>{error && <p className="waiter-error guest-receipt-error" role="alert">{error}</p>}<footer className="guest-receipt-finish"><button disabled={finishing || !requiredComplete} onClick={() => void finish()}>{finishing ? "Zapisuję…" : "Zakończ i wróć do menu"}</button></footer></main>;
}
