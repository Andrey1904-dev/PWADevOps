import { completeSettings } from "./sync-validation";
import { publicConfig } from "./public-config";
import { createClient } from "@supabase/supabase-js";
import type { MissionStatus } from "./catalog";
import type { Operation } from "./domain";
const env = import.meta.env;
export const supabase =
  env.MODE === "test" && !env.VITE_SUPABASE_URL
    ? null
    : createClient(
        env.VITE_SUPABASE_URL || publicConfig.url,
        env.VITE_SUPABASE_PUBLISHABLE_KEY || publicConfig.publishableKey,
      );
export type Settings = {
  anchor: string;
  shiftOverrides?: Record<string, "work" | "rest">;
  workWindowStart?: string;
  workWindowEnd?: string;
  timezone: string;
  work: number;
  rest: number;
  heavy: number;
  paused: boolean;
  reminders: boolean;
  quietStart: string;
  quietEnd: string;
  workTimes?: string;
  restTimes?: string;
  categories?: Record<string, boolean>;
  weekdays?: number[];
  weeklyGoal?: number;
};
export type Progress = {
  status: MissionStatus;
  note: string;
  error: string;
  github: string;
  review: string;
};
export type State = {
  energy?: Record<string, "low" | "normal" | "more">;
  deferred?: Record<string, string>;
  scheduledMissions?: Record<string, string>;
  bossWorkdayConsent?: Record<string, boolean>;
  missionHistory?: {
    id: string;
    mission_id: string;
    new_status: MissionStatus;
    changed_at: string;
  }[];
  rewardEvents?: import("./game").Reward[];
  overrides?: Record<
    string,
    {
      title?: string;
      month?: string;
      criteria?: string;
      boss?: string;
      duration?: number;
      task?: string;
    }
  >;
  current: string;
  progress: Record<string, Progress>;
  sessions: { id: string; seconds: number; date: string; note: string }[];
  active: number | null;
  timerSeconds?: number;
  heavyDate?: string;
  restDate?: string;
  plans?: Record<string, number>;
  settings: Settings;
  queue: Operation[];
  version: number;
};
export const initial: State = {
  current: "1-18",
  progress: {},
  sessions: [],
  active: null,
  timerSeconds: 0,
  settings: {
    anchor: "2026-11-17",
    timezone: "",
    work: 35,
    rest: 150,
    heavy: 12,
    paused: false,
    reminders: false,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    weeklyGoal: 660,
    quietStart: "22:00",
    quietEnd: "08:00",
    workTimes: "09:00,13:00,18:00,21:30",
    workWindowStart: "",
    workWindowEnd: "",
    shiftOverrides: {},
    restTimes: "09:00,13:00,18:00,21:30",
    categories: {
      daily: true,
      weekly: true,
      review: true,
      checkpoint: true,
      return: true,
      boss: true,
      chapter: true,
    },
  },
  queue: [],
  version: 0,
};
export function readState(scope = "local"): State {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("devops-quest-v1:" + scope) || "null",
    );
    return {
      ...initial,
      ...parsed,
      settings: {
        ...initial.settings,
        ...parsed?.settings,
        anchor: parsed?.settings?.anchor || initial.settings.anchor,
      },
    };
  } catch {
    return initial;
  }
}
export function persist(s: State, scope = "local") {
  localStorage.setItem("devops-quest-v1:" + scope, JSON.stringify(s));
}
export async function sync(s: State): Promise<State> {
  if (!supabase) return s;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Error("Войдите для синхронизации");
  if (!completeSettings(s.settings))
    throw Error(
      "Завершите ввод часового пояса и часов уведомлений в настройках. Изменения сохранены локально.",
    );
  let version = s.version;
  for (const op of s.queue) {
    const draft = op.payload.state as State | undefined;
    if (
      draft &&
      (!completeSettings(draft.settings) ||
        (draft.settings.reminders && !s.settings.reminders))
    )
      continue;
    const { data, error } = await supabase.rpc("apply_operation", {
      operation_id: op.id,
      expected_version: version,
      operation_kind: op.kind,
      body: op.payload,
    });
    if (error) throw error;
    if (data.conflict)
      throw Error(
        "Конфликт: загрузите облачную версию или экспортируйте локальную",
      );
    version = data.version;
  }
  await supabase.rpc("ensure_profile");
  const { data, error } = await supabase
    .from("profiles")
    .select("state,version")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  const { data: rewards } = await supabase
    .from("reward_events")
    .select("event_key,xp,created_at")
    .eq("user_id", user.id);
  const { data: history } = await supabase
    .from("mission_history")
    .select("id,mission_id,new_status,changed_at")
    .eq("user_id", user.id);
  return {
    ...initial,
    ...data.state,
    missionHistory: history || [],
    settings: { ...initial.settings, ...data.state.settings },
    rewardEvents: rewards || [],
    version: data.version,
    queue: [],
  };
}

export function acknowledge(
  snapshot: State,
  current: State,
  cloud: State,
): State {
  const remaining = current.queue.filter(
    (op) => !snapshot.queue.some((sent) => sent.id === op.id),
  );
  return remaining.length
    ? { ...current, version: cloud.version, queue: remaining }
    : cloud;
}
