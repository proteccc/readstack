import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Readstack",
  description: "Send long-form articles to Kindle with minimal friction.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getCurrentUser();

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
            {user ? (
              <form action="/logout" method="post" style={{ display: "inline" }}>
                <span className="muted" style={{ marginRight: "0.75rem" }}>
                  Signed in as {user.email}
                </span>
                <button className="button-secondary" type="submit">
                  Sign out
                </button>
              </form>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
