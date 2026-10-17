import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getTimerState } from "@/lib/domain/timer";
import { listRecentTasks } from "@/lib/domain/tasks";
import { listEntryTimesSince } from "@/lib/domain/entries";
import { TZ_COOKIE, getUserTimezone } from "@/lib/tz";
import { FeedbackProvider } from "@/components/ui/feedback";
import { TimerProvider } from "@/components/timer/timer-provider";
import { TimerWidget } from "@/components/timer/timer-widget";
import { Sidebar } from "@/components/layout/sidebar";
import { TimezoneSync } from "@/components/layout/timezone-sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 36 h en arrière couvrent « aujourd'hui » quel que soit le fuseau du navigateur.
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const [timer, recentTasks, todayEntries, cookieStore, tz] = await Promise.all([
    getTimerState(supabase),
    listRecentTasks(supabase, 20),
    listEntryTimesSince(supabase, since),
    cookies(),
    getUserTimezone(),
  ]);

  return (
    <FeedbackProvider>
      <TimerProvider initialState={timer} recentTasks={recentTasks} todayEntries={todayEntries} tz={tz}>
        <TimezoneSync current={cookieStore.get(TZ_COOKIE)?.value ?? null} />
        <div className="flex min-h-screen">
          <Sidebar email={user.email ?? ""} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-end border-b border-border bg-page/95 py-3 pl-16 pr-4 backdrop-blur sm:pr-8 lg:pl-8">
              <TimerWidget />
            </header>
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-8">{children}</main>
          </div>
        </div>
      </TimerProvider>
    </FeedbackProvider>
  );
}
