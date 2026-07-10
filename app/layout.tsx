import "./globals.css";
import { LANGUAGE } from "@/lib/language";

export const metadata = {
  title: LANGUAGE.appTitle,
  description: `Личный тренажёр ${LANGUAGE.genitive} лексики`,
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
