import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const uid = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
async function asUser(id: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users);create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub',true),''))||coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated;insert into auth.users(id) values('${uid}'),('${other}');insert into auth.sessions values('${uid}','${uid}'),('${other}','${other}');`,
  );
  for (const file of readdirSync("supabase/migrations")
    .sort()
    .filter(
      (f) =>
        !f.endsWith("_notification_cron.sql") &&
        !f.endsWith("_telegram_vault_secrets.sql"),
    ))
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
}, 30000);
afterAll(() => db.close());
const state = {
  current: "1-18",
  progress: { "1-18": { status: "solved" } },
  sessions: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      seconds: 60,
      date: "2026-11-15",
      note: "",
    },
  ],
  settings: {
    anchor: "",
    timezone: "",
    work: 40,
    rest: 150,
    heavy: 12,
    paused: false,
  },
};
function operation(id: string, version: number) {
  return `select apply_operation('${id}',${version},'session','${JSON.stringify({ state })}'::jsonb) as result`;
}
describe("migration, ownership and transactional RPC", () => {
  it("seed is repeatable and contains 360 missions", async () => {
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
    expect(
      (await db.query("select count(*)::int as n from missions")).rows[0],
    ).toEqual({ n: 360 });
  });
  it("creates own profile and isolates it", async () => {
    await asUser(uid, "select ensure_profile()");
    await asUser(other, "select ensure_profile()");
    const r = await asUser(uid, "select * from profiles");
    expect(r.rows).toHaveLength(1);
    expect((r.rows[0] as { id: string }).id).toBe(uid);
  });
  it("repeated operation does not double time", async () => {
    await asUser(uid, operation("55555555-5555-4555-8555-555555555555", 0));
    await asUser(uid, operation("55555555-5555-4555-8555-555555555555", 0));
    const r = await asUser(
      uid,
      "select sum(seconds)::int as total from study_sessions",
    );
    expect(r.rows[0]).toEqual({ total: 60 });
  });
  it("rejects stale version", async () => {
    const r = await asUser(
      uid,
      operation("66666666-6666-4666-8666-666666666666", 0),
    );
    expect(
      (r.rows[0] as { result: { conflict: boolean } }).result.conflict,
    ).toBe(true);
  });
  it("cannot view another user sessions", async () =>
    expect(
      (await asUser(other, "select * from study_sessions")).rows,
    ).toHaveLength(0));
  it("cannot mutate profile directly", async () => {
    await expect(
      asUser(uid, "update profiles set version=100"),
    ).rejects.toThrow();
  });
  it("does not expose Telegram linking to clients", async () => {
    await expect(
      asUser(uid, "select consume_link('fake',42,1)"),
    ).rejects.toThrow();
  });
  it("consumes token once and deduplicates bot actions", async () => {
    await db.exec(
      `insert into telegram_link_tokens(token_hash,user_id,expires_at) values('hash','${uid}',now()+interval '10 minutes')`,
    );
    await db.query("select telegram_link_step('hash',42,'prepare')");
    expect(
      (await db.query("select consume_link('hash',42,101) as ok")).rows[0],
    ).toEqual({ ok: true });
    expect(
      (await db.query("select consume_link('hash',42,102) as ok")).rows[0],
    ).toEqual({ ok: true });
    await db.query("select bot_action(42,103,'begin','')");
    await db.query("select bot_action(42,104,'done','')");
    await db.query("select bot_action(42,104,'done','')");
    expect(
      (await db.query("select count(*)::int as n from study_sessions")).rows[0],
    ).toEqual({ n: 2 });
  });
});
it("rewards are idempotent across new operations and status toggles", async () => {
  await db.exec(
    `select award_achievements('${uid}');select award_achievements('${uid}')`,
  );
  expect(
    (await asUser(uid, "select sum(xp)::int as xp from reward_events")).rows[0],
  ).toEqual({ xp: 50 });
  await expect(
    asUser(
      uid,
      "insert into reward_events values('11111111-1111-4111-8111-111111111111','fake','1-18',200,now())",
    ),
  ).rejects.toThrow();
  expect(
    (await asUser(other, "select * from reward_events")).rows,
  ).toHaveLength(0);
});
it("Mini App link cannot steal another profile and nonce is single use", async () => {
  expect(
    (await db.query(`select link_mini_app('${other}',42) as ok`)).rows[0],
  ).toEqual({ ok: false });
  expect(
    (await db.query(`select link_mini_app('${uid}',42) as ok`)).rows[0],
  ).toEqual({ ok: true });
  expect(
    (await db.query("select consume_mini_app_auth('signed-hash',42) as ok"))
      .rows[0],
  ).toEqual({ ok: true });
  expect(
    (await db.query("select consume_mini_app_auth('signed-hash',42) as ok"))
      .rows[0],
  ).toEqual({ ok: false });
  await expect(
    asUser(uid, "select consume_mini_app_auth('another',42)"),
  ).rejects.toThrow();
});
it("old mission confirmation cannot change current mission", async () => {
  const result = await db.query(
    "select bot_action_guarded(42,999,'status','solved','1-17') as result",
  );
  expect(
    (result.rows[0] as { result: { stale_action: boolean } }).result
      .stale_action,
  ).toBe(true);
});
it("revocation immediately blocks bound JWT reads and writes, including after relink", async () => {
  const sid = "77777777-7777-4777-8777-777777777777";
  const row = (
    await db.query<{ connection_id: string }>(
      "select connection_id from telegram_connections where chat_id=42",
    )
  ).rows[0];
  await db.exec(`insert into auth.sessions values('${sid}','${uid}')`);
  await db.query(
    `select register_mini_app_session('${sid}','${uid}',42,'${row.connection_id}')`,
  );
  await db.exec(`set request.jwt.claims='{"session_id":"${sid}"}'`);
  expect((await asUser(uid, "select * from profiles")).rows).toHaveLength(1);
  await db.exec("set request.jwt.claims='{}'");
  await asUser(uid, "select revoke_telegram_link()");
  await db.exec(`set request.jwt.claims='{"session_id":"${sid}"}'`);
  expect((await asUser(uid, "select * from profiles")).rows).toHaveLength(0);
  await expect(asUser(uid, "select ensure_profile()")).rejects.toThrow();
  await db.query(`select link_mini_app('${uid}',42)`);
  expect((await asUser(uid, "select * from profiles")).rows).toHaveLength(0);
  await db.exec("set request.jwt.claims='{}'");
  expect((await asUser(uid, "select * from profiles")).rows).toHaveLength(1);
});
it("logout closes RLS and privileged RPCs for an otherwise valid PWA JWT", async () => {
  await db.exec(`delete from auth.sessions where id='${uid}'`);
  expect((await asUser(uid, "select * from profiles")).rows).toHaveLength(0);
  expect(
    (await asUser(uid, "select * from mission_progress")).rows,
  ).toHaveLength(0);
  await expect(asUser(uid, "select ensure_profile()")).rejects.toThrow();
  await db.exec(`insert into auth.sessions values('${uid}','${uid}')`);
});
it("registration trigger persists display name without granting anonymous access", async () => {
  const id = "99999999-9999-4999-8999-999999999999";
  await db.exec(
    `insert into auth.users(id,raw_user_meta_data) values('${id}','{"display_name":"Андрей QA"}')`,
  );
  expect(
    (await db.query(`select display_name from profiles where id='${id}'`))
      .rows[0],
  ).toEqual({ display_name: "Андрей QA" });
  await expect(
    asUser(uid, `select display_name from profiles where id='${id}'`),
  ).resolves.toMatchObject({ rows: [] });
});

describe("explicit Telegram confirmation", () => {
  const call = async (token: string, chat: number, step: string) =>
    (
      await db.query(
        `select telegram_link_step('${token}',${chat},'${step}') as r`,
      )
    ).rows[0] as { r: { code: string } };
  it("requires prepare, binds sender and never steals an existing account", async () => {
    await db.exec(
      `insert into telegram_link_tokens(token_hash,user_id,expires_at) values('pending-other','${other}',now()+interval '10 minutes')`,
    );
    expect((await call("pending-other", 9991, "confirm")).r.code).toBe(
      "CONFIRM_REQUIRED",
    );
    expect((await call("pending-other", 9991, "prepare")).r.code).toBe(
      "CONFIRM_REQUIRED",
    );
    expect((await call("pending-other", 9992, "confirm")).r.code).toBe(
      "LINK_CLAIMED",
    );
    expect((await call("pending-other", 9991, "cancel")).r.code).toBe(
      "CANCELLED",
    );
    expect((await call("pending-other", 9991, "confirm")).r.code).toBe(
      "LINK_USED",
    );
    expect((await call("tampered", 9991, "prepare")).r.code).toBe(
      "LINK_INVALID_OR_EXPIRED",
    );
  });
  it("rejects expired capabilities and service-only RPC is denied to clients", async () => {
    await db.exec(
      `insert into telegram_link_tokens(token_hash,user_id,expires_at) values('expired-test','${other}',now()-interval '1 second')`,
    );
    expect((await call("expired-test", 9991, "prepare")).r.code).toBe(
      "LINK_INVALID_OR_EXPIRED",
    );
    await expect(
      asUser(other, "select telegram_link_step('expired-test',9991,'confirm')"),
    ).rejects.toThrow();
  });
  it("supports reconnect but spent capability cannot restore revoked link", async () => {
    await db.exec(
      `delete from telegram_connections where user_id='${other}';insert into telegram_link_tokens(token_hash,user_id,expires_at) values('reconnect-test','${other}',now()+interval '10 minutes')`,
    );
    expect((await call("reconnect-test", 9993, "prepare")).r.code).toBe(
      "CONFIRM_REQUIRED",
    );
    expect((await call("reconnect-test", 9993, "confirm")).r.code).toBe(
      "LINKED",
    );
    const generation = (
      await db.query(
        "select connection_id from telegram_connections where chat_id=9993",
      )
    ).rows[0];
    expect((await call("reconnect-test", 9993, "confirm")).r.code).toBe(
      "ALREADY_LINKED",
    );
    expect(
      (
        await db.query(
          "select connection_id from telegram_connections where chat_id=9993",
        )
      ).rows[0],
    ).toEqual(generation);
    await db.exec(
      `insert into telegram_link_tokens(token_hash,user_id,expires_at) values('conflict-test','${uid}',now()+interval '10 minutes')`,
    );
    expect((await call("conflict-test", 9993, "prepare")).r.code).toBe(
      "ACCOUNT_ALREADY_LINKED",
    );
    await asUser(other, "select revoke_telegram_link()");
    expect((await call("reconnect-test", 9993, "confirm")).r.code).toBe(
      "LINK_INVALID_OR_EXPIRED",
    );
    await db.exec(
      `insert into telegram_link_tokens(token_hash,user_id,expires_at) values('new-reconnect','${other}',now()+interval '10 minutes')`,
    );
    await call("new-reconnect", 9993, "prepare");
    expect((await call("new-reconnect", 9993, "confirm")).r.code).toBe(
      "LINKED",
    );
  });
});
