import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTimerState } from "@/lib/domain/timer";
import { getUserTimezone } from "@/lib/tz";
import { FeedbackProvider } from "@/components/ui/feedback";
import { TimerProvider } from "@/components/timer/timer-provider";
import { MiniTimer } from "@/components/timer/mini-timer";

export const metadata: Metadata = { title: "Mini-timer" };

/** Popup réduite utilisée quand la Document Picture-in-Picture API n'est pas disponible. */
export default async function MiniTimerPage() {
  const supabase = await createClient();
  const [timer, tz] = await Promise.all([getTimerState(supabase), getUserTimezone()]);
  return (
    <FeedbackProvider>
      <TimerProvider initialState={timer} recentTasks={[]} todayEntries={[]} tz={tz}>
        <MiniTimer />
      </TimerProvider>
    </FeedbackProvider>
  );
}
