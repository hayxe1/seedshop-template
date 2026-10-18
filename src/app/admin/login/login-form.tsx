"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { loginResultSchema, parseApiResponse } from "@/shared/api/contracts";
import styles from "./page.module.css";

type LoginFormProps = {
  nextPath: string;
};

export default function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await parseApiResponse(
        await fetch("/api/admin/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        }),
        loginResultSchema
      );

      router.replace(nextPath);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка сети. Попробуйте снова.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className={styles.card}>
      <h1>Вход в админку</h1>
      <p>Используйте учетную запись администратора, чтобы управлять заказами и каталогом.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          Эл. почта
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Пароль
          <span className={styles.passwordField}>
            <input
              type={isPasswordVisible ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className={styles.passwordToggle}
              aria-label={isPasswordVisible ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={isPasswordVisible}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
            >
              {isPasswordVisible ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m3 3 18 18" />
                  <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                  <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.4 0 8.6 4.6 9 5.4a1.3 1.3 0 0 1 0 1.2 14.3 14.3 0 0 1-2.4 3.2" />
                  <path d="M6.2 6.2A14.1 14.1 0 0 0 3 9.4a1.3 1.3 0 0 0 0 1.2C3.4 11.4 6.6 16 12 16a10.4 10.4 0 0 0 3-.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 9.4C3.4 8.6 6.6 4 12 4s8.6 4.6 9 5.4a1.3 1.3 0 0 1 0 1.2c-.4.8-3.6 5.4-9 5.4s-8.6-4.6-9-5.4a1.3 1.3 0 0 1 0-1.2Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
              )}
            </button>
          </span>
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Входим..." : "Войти"}
        </button>
      </form>

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
