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
            <Link href="/" className="logo-link">
              <svg className="logo-icon" width="37" height="32" viewBox="-2 -1 46 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g transform="rotate(-14 16 18)">
                  <rect x="5" y="2" width="18" height="26" rx="3.2" fill="#E7D9CF" stroke="#1A1A1A" strokeWidth="1.05"/>
                </g>
                <g transform="rotate(14 26 18)">
                  <rect x="19" y="2" width="18" height="26" rx="3.2" fill="#E7D9CF" stroke="#1A1A1A" strokeWidth="1.05"/>
                </g>
                <rect x="12" y="1" width="18" height="26" rx="3.2" fill="white" stroke="#1A1A1A" strokeWidth="1.05"/>
                <line x1="16" y1="8.5"  x2="26" y2="8.5"  stroke="#1A1A1A" strokeWidth="0.65" strokeLinecap="round"/>
                <line x1="16" y1="13"   x2="26" y2="13"   stroke="#1A1A1A" strokeWidth="0.65" strokeLinecap="round"/>
                <line x1="16" y1="17.5" x2="22" y2="17.5" stroke="#1A1A1A" strokeWidth="0.65" strokeLinecap="round"/>
              </svg>
              <span className="logo-wordmark">readstack</span>
            </Link>
            <NavUser />
          </nav>
          {children}
          <footer
            style={{
              textAlign: "center",
              marginTop: 48,
              paddingBottom: 24,
            }}
          >
            <a
              href="https://x.com/gabewise"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.8rem", opacity: 0.45 }}
            >
              Who built Readstack? Contact here.
            </a>
          </footer>
        </main>
      </body>
    </html>
  );
}
