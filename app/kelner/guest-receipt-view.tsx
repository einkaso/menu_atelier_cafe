"use client";

import { useState } from "react";
import type { GuestReceipt } from "../../lib/guest-receipt";

const money = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });
const date = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" });

export default function GuestReceiptView({ receipt }: { receipt: GuestReceipt }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const requiredComplete = receipt.surveyQuestions.every((question) => !question.required || Boolean(answers[String(question.id)]));
  const qrUrl = receipt.reviewUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(receipt.reviewUrl)}` : null;

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

  return <main className="guest-receipt-screen"><section className="guest-receipt-paper"><header><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/><span>RACHUNEK DLA GOŚCIA</span><h1>Dziękujemy za wizytę</h1><p>{receipt.tableName} · {date.format(new Date(receipt.completedAt))}</p><small>{receipt.documentNumber}</small></header><div className="guest-receipt-items">{receipt.items.map((item) => <article key={item.id}><div><b>{item.quantity} ×</b><span>{item.name}{item.customizations.length > 0 && <small>{item.customizations.join(" · ")}</small>}</span></div><strong>{money.format(Number(item.total))}</strong></article>)}</div><div className="guest-receipt-total"><span>Razem</span><strong>{money.format(Number(receipt.total))}</strong></div>{receipt.payments.length > 0 && <div className="guest-receipt-payments">{receipt.payments.map((payment) => <p key={payment.id}><span>{payment.label}</span><b>{money.format(Number(payment.amount))}</b></p>)}</div>}<p className="guest-receipt-fiscal-note">To elektroniczne podsumowanie rachunku. Dokument fiskalny wystawia kasa.</p></section><section className="guest-after-survey"><span>JUŻ PO RACHUNKU</span><h2>Jak minęła wizyta?</h2><p>Ta krótka ankieta jest niezależna od pytań zadawanych przed zamówieniem i nie zbiera danych osobowych.</p>{receipt.surveyQuestions.map((question, index) => <fieldset key={question.id}><legend>{index + 1}. {question.prompt}{question.required && <small>wymagane</small>}</legend><div className={question.kind === "RATING" ? "is-rating" : ""}>{question.options.map((option) => <button type="button" key={option} className={answers[String(question.id)] === option ? "is-selected" : ""} onClick={() => setAnswers((current) => ({ ...current, [String(question.id)]: option }))}>{question.kind === "RATING" ? <><b>{option}</b><small>★</small></> : option}</button>)}</div></fieldset>)}</section><section className="guest-google-review"><h2>Podobało Ci się?</h2><p>Będzie nam bardzo miło, jeśli zostawisz opinię w Google. To naprawdę pomaga małym miejscom.</p>{qrUrl && receipt.reviewUrl ? <><a href={receipt.reviewUrl} target="_blank" rel="noreferrer"><img src={qrUrl} alt="Kod QR do wystawienia opinii w Google"/></a><a className="guest-google-button" href={receipt.reviewUrl} target="_blank" rel="noreferrer">Oceń nas w Google</a></> : <small>Link do opinii Google zostanie tu wyświetlony po jego skonfigurowaniu.</small>}</section>{error && <p className="waiter-error guest-receipt-error" role="alert">{error}</p>}<footer className="guest-receipt-finish"><button disabled={finishing || !requiredComplete} onClick={() => void finish()}>{finishing ? "Zapisuję…" : "Zakończ i wróć do menu"}</button></footer></main>;
}
