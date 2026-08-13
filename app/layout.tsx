import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "마법연산자",
  description: "Draw your own magic circle."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
