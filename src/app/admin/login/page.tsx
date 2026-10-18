import LoginForm from "./login-form";
import styles from "./page.module.css";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string }>;
};

function normalizeNextPath(raw: string | undefined) {
  if (!raw || !raw.startsWith("/")) {
    return "/admin";
  }

  if (raw.startsWith("//")) {
    return "/admin";
  }

  return raw;
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const resolved = (await searchParams) ?? {};
  const nextPath = normalizeNextPath(resolved.next);

  return (
    <main className={styles.page}>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
