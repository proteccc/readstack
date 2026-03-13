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
          <nav className="nav">
            <Link href="/">Overview</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/settings">Settings</Link>
            <Link href="/history">History</Link>
            <span style={{ marginLeft: "auto" }} />
            <NavUser />
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
