"use client";

import { FormEvent, useState } from "react";

export default function AdminLogin() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Nie udało się zalogować.");
      setPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div className="admin-login-logo"><img src="/logo-cafe.png" alt="Marta Banaszek atelier-café" /></div>
        <p className="admin-eyebrow">Cyfrowa karta kawiarni</p>
        <h1>Panel menu</h1>
        <p className="admin-lead">Tutaj uzupełnisz zdjęcia, opisy, tłumaczenia oraz wyróżnione pozycje.</p>
        <form onSubmit={submit}>
          <label>
            Login
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Hasło
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="admin-alert">{error}</p>}
          <button className="admin-primary" disabled={pending}>{pending ? "Logowanie…" : "Zaloguj się"}</button>
        </form>
      </section>
      <div className="admin-login-art" aria-hidden="true" />
    </main>
  );
}
