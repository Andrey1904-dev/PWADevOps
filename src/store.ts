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
};
export type Progress = {
  status: MissionStatus;
  note: string;
  error: string;
  github: string;
  review: string;
};
export type State = {
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
    anchor: "",
    timezone: "",
    work: 40,
    rest: 150,
    heavy: 12,
    paused: false,
    reminders: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    workTimes: "09:00,13:00,18:00,21:30",
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
    return {
      ...initial,
      ...JSON.parse(localStorage.getItem("devops-quest-v1:" + scope) || "null"),
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
  let version = s.version;
  for (const op of s.queue) {
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
  return { ...initial, ...data.state, version: data.version, queue: [] };
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
