"use client";

import { useEffect } from "react";
import { trackCareerProfileViewed } from "@/lib/himetrica";

export default function CareerProfileTracker({ targetLogin, isOwn }: { targetLogin: string; isOwn: boolean }) {
  useEffect(() => {
    trackCareerProfileViewed(targetLogin, isOwn);
  }, [targetLogin, isOwn]);
  return null;
}
