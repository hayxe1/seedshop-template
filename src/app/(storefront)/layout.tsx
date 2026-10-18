import localFont from "next/font/local";
import StorefrontFooter from "@/shared/ui/storefront-footer";
import StorefrontHeader from "@/shared/ui/storefront-header";
import styles from "./storefront-shell.module.css";

const onest = localFont({
  src: "../fonts/Onest-Variable.ttf",
  weight: "100 900",
  display: "swap",
  variable: "--font-onest",
});

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.shell} ${onest.variable}`}>
      <a href="#main-content" className={styles.skipLink}>Перейти к содержимому</a>
      <StorefrontHeader />
      <div id="main-content" className={styles.content}>{children}</div>
      <StorefrontFooter />
    </div>
  );
}
