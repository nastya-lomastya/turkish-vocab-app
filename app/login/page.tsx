"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { LANGUAGE } from "@/lib/language";

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
        setError("Incorrect password");
      }
    } catch (e) {
      setError("Something went wrong, try again");
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
        background: "#FFFFFF",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#F2F5F2",
          padding: "32px",
          borderRadius: "16px",
          width: "300px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#26332B", fontWeight: 700, fontSize: "18px" }}>
          <Lock size={18} /> {LANGUAGE.appTitle}
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1.5px solid #E2E7E2",
            background: "#FFFFFF",
            color: "#26332B",
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
            background: "#2E9C6B",
            color: "#FFFFFF",
            fontWeight: 600,
            cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Log in"}
        </button>
        {error && <div style={{ color: "#CC4F5C", fontSize: "13px", fontWeight: 600 }}>{error}</div>}
      </form>
    </div>
  );
}
