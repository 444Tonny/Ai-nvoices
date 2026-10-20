"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Enregistre le fuseau du navigateur dans un cookie (lu par les stats calculées en SQL). */
export function TimezoneSync({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== current) {
      document.cookie = `ainv-tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [current, router]);
  return null;
}
