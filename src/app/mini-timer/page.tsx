import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTimerState } from "@/lib/domain/timer";
import { FeedbackProvider } from "@/components/ui/feedback";
import { TimerProvider } from "@/components/timer/timer-provider";
import { MiniTimer } from "@/components/timer/mini-timer";

export const metadata: Metadata = { title: "Mini-timer" };

/** Popup réduite utilisée quand la Document Picture-in-Picture API n'est pas disponible. */
export default async function MiniTimerPage() {
  const supabase = await createClient();
  const timer = await getTimerState(supabase);
  return (
    <FeedbackProvider>
      <TimerProvider initialState={timer} recentTasks={[]} todayEntries={[]}>
        <MiniTimer />
      </TimerProvider>
    </FeedbackProvider>
  );
}
