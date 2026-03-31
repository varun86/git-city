"use client";

import { useEffect } from "react";
import { trackForCompaniesPageView, trackForCompaniesCtaClicked } from "@/lib/himetrica";
import Link from "next/link";

export function ForCompaniesTracker() {
  useEffect(() => {
    trackForCompaniesPageView();
  }, []);
  return null;
}

export function ForCompaniesCtaLink({
  href,
  cta,
  className,
  style,
  children,
}: {
  href: string;
  cta: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() => trackForCompaniesCtaClicked(cta)}
    >
      {children}
    </Link>
  );
}
