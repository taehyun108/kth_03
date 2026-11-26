import type { Metadata, Viewport } from "next";
import QuoteSlot from "@/components/QuoteSlot";
import Tabs from "@/components/Tabs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Economy Begin — 한국 주식 거래량 순위",
  description: "한국 주식 거래량 순위와 투자 대가 5인의 관점을 한눈에.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a className="skip" href="#main">
          본문으로 건너뛰기
        </a>
        <div className="wrap">
          <header className="masthead">
            <QuoteSlot />
            <div className="brand">
              <h1>Economy Begin</h1>
              <p>한국 주식 거래량 순위 · 투자 대가 5인의 관점</p>
            </div>
          </header>
          <Tabs />
          <main id="main">{children}</main>
          <footer className="foot">
            <p>⚠️ 참고용 정보이며 투자 권유가 아닙니다. 모든 투자 판단과 책임은 본인에게 있습니다.</p>
            <p>시세: 야후 파이낸스(몇 분 지연될 수 있음) · 거래대금은 종가 × 거래량으로 추정한 값입니다.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
