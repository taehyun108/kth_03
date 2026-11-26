"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "순위" },
  { href: "/stock", label: "종목 조회" },
  { href: "/debate", label: "시장 토론" },
] as const;

export default function Tabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="메뉴" className="tabs">
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className="tab" aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
