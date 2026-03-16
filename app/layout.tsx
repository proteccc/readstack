import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NavUser } from "./NavUser";

export const metadata: Metadata = {
  title: "Readstack",
  description: "Send long-form articles to Kindle with minimal friction.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
              paddingTop: 4,
            }}
          >
            <Link
              href="/"
              style={{
                fontWeight: 700,
                fontSize: "1.05rem",
                letterSpacing: "-0.01em",
              }}
            >
              Readstack
            </Link>
            <NavUser />
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
