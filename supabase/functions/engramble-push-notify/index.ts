import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "https://engramble.vercel.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function manilaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function manilaHour(): number {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
}

function randomReminderHour(userId: string, date: string): number {
  const seed = `${userId}:${date}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 7 + (hash % 13);
}

async function sendPush(subscription: any, message: object): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(message));
    return true;
  } catch (err: any) {
    console.error("[Push] error:", err?.statusCode, err?.body);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = manilaDate();
  const currentHour = manilaHour();
  let pushed = 0;
  let failed = 0;

  const { data: queueItems } = await supabase
    .from("notifications_queue")
    .select("*")
    .eq("sent", false)
    .order("created_at", { ascending: true });

  if (queueItems?.length) {
    const { data: allSubs } = await supabase.from("push_subscriptions").select("user_id, subscription");
    for (const item of queueItems) {
      const targets = (allSubs || []).filter((sub) => item.target === "all" || sub.user_id === item.target);
      for (const { subscription } of targets) {
        if (!subscription?.endpoint) continue;
        const ok = await sendPush(subscription, {
          title: item.title,
          body: item.body,
          tag: "engramble-broadcast",
          url: item.url || "/",
        });
        ok ? pushed++ : failed++;
      }
      await supabase.from("notifications_queue").update({ sent: true }).eq("id", item.id);
    }
  }

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription, streak_reminders_enabled, leaderboard_reminders_enabled, last_streak_notified_date, last_leaderboard_notified_date, last_random_study_notified_date")
    .eq("reminders_enabled", true);

  for (const sub of subs || []) {
    if (!sub.subscription?.endpoint) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, username, streak")
      .eq("id", sub.user_id)
      .single();

    const name = profile?.username || profile?.email?.split("@")[0] || "there";

    const { data: record } = await supabase
      .from("daily_records")
      .select("connections_completed, reveal_completed, total_score")
      .eq("user_id", sub.user_id)
      .eq("played_date", today)
      .maybeSingle();

    const completed = Boolean(record?.connections_completed && record?.reveal_completed);

    const studyReminderHour = randomReminderHour(sub.user_id, today);
    if (!completed && currentHour >= studyReminderHour && sub.last_random_study_notified_date !== today) {
      const ok = await sendPush(sub.subscription, {
        title: "Engramble study check",
        body: `Hey ${name}, refresh one set or finish today's games when you have a minute.`,
        tag: "engramble-random-study-reminder",
        url: "/",
      });
      ok ? pushed++ : failed++;
      await supabase.from("push_subscriptions").update({ last_random_study_notified_date: today }).eq("user_id", sub.user_id);
    }

    if (sub.streak_reminders_enabled && !completed && sub.last_streak_notified_date !== today) {
      const streak = profile?.streak ?? 0;
      const ok = await sendPush(sub.subscription, {
        title: "Keep your Engramble streak",
        body: streak > 0 ? `Hey ${name}, your ${streak}-day streak is waiting. Finish today's games.` : `Hey ${name}, start today's Engramble run.`,
        tag: "engramble-streak-reminder",
        url: "/",
      });
      ok ? pushed++ : failed++;
      await supabase.from("push_subscriptions").update({ last_streak_notified_date: today }).eq("user_id", sub.user_id);
    }

    if (sub.leaderboard_reminders_enabled && sub.last_leaderboard_notified_date !== today) {
      const { data: friendships } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${sub.user_id},addressee_id.eq.${sub.user_id}`);

      const friendIds = (friendships || []).map((friend) => friend.requester_id === sub.user_id ? friend.addressee_id : friend.requester_id);
      const userIds = [sub.user_id, ...friendIds];

      if (userIds.length > 1) {
        const { data: records } = await supabase
          .from("daily_records")
          .select("user_id,total_score")
          .eq("played_date", today)
          .in("user_id", userIds);

        const sorted = (records || []).sort((a, b) => b.total_score - a.total_score);
        const rank = sorted.findIndex((item) => item.user_id === sub.user_id) + 1;

        if (rank > 0) {
          const ok = await sendPush(sub.subscription, {
            title: "Friend leaderboard update",
            body: `You're #${rank} among friends today with ${record?.total_score ?? 0} pts.`,
            tag: "engramble-leaderboard",
            url: "/",
          });
          ok ? pushed++ : failed++;
          await supabase.from("push_subscriptions").update({ last_leaderboard_notified_date: today }).eq("user_id", sub.user_id);
        }
      }
    }
  }

  return new Response(JSON.stringify({ pushed, failed, ts: new Date().toISOString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
