"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Неверный пароль");
      }
    } catch (e) {
      setError("Что-то пошло не так, попробуй ещё раз");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#FDF1F4",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#FADCE4",
          padding: "32px",
          borderRadius: "16px",
          width: "300px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#5B2F3E", fontWeight: 700, fontSize: "18px" }}>
          <Lock size={18} /> Türkçe Kelimeler
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          autoFocus
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1.5px solid #F0C7D2",
            background: "#FDF1F4",
            color: "#5B2F3E",
            outline: "none",
            fontSize: "15px",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px",
            borderRadius: "8px",
            border: "none",
            background: "#D6577E",
            color: "#F5F0E6",
            fontWeight: 600,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Войти"}
        </button>
        {error && <div style={{ color: "#CC4F5C", fontSize: "13px", fontWeight: 600 }}>{error}</div>}
      </form>
    </div>
  );
}
