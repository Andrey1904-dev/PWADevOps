import { chapters } from "../src/catalog.ts";
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const track = "d0000000-0000-4000-8000-000000000001";
let sql = `insert into public.learning_tracks(id,title) values('${track}','DEVOPS QUEST') on conflict(id) do nothing;\n`;
for (const c of chapters) {
  sql += `insert into public.chapters(id,track_id,title,planned_month,criteria,boss) values(${q(String(c.id))},'${track}',${q(c.title)},${q(c.month + "-01")},${q(c.criteria)},${q(c.boss)}) on conflict(id) do nothing;\n`;
  for (const m of c.missions)
    sql += `insert into public.missions(id,chapter_id,title,task,position) values(${q(m.id)},${q(String(c.id))},${q(m.title)},${q(m.task)},${m.number}) on conflict(id) do nothing;\n`;
}
await Deno.writeTextFile("supabase/seed.sql", sql);
