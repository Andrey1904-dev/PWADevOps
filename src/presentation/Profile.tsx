import type { State } from "../store";
import { gameStats } from "../game";
import { Art, rank } from "./Art";
export function Profile({
  state,
  today,
  name,
}: {
  state: State;
  today: string;
  name: string;
}) {
  const g = gameStats(state, today);
  const verified = Object.values(state.progress).filter(
    (p) => p.status === "verified",
  ).length;
  const bosses = Object.entries(state.progress).filter(
    ([id, p]) => id.endsWith("-20") && p.status === "verified",
  ).length;
  const achievements = [
    {
      name: "Первая практика",
      earned: state.sessions.some((s) => s.seconds > 0),
      detail: "Записать фактическое время занятия",
    },
    {
      name: "Первое подтверждение",
      earned: verified > 0,
      detail: "Получить проверенный результат миссии",
    },
    {
      name: "Победитель босса",
      earned: bosses > 0,
      detail: "Подтвердить финальное испытание",
    },
  ];
  return (
    <>
      <section className="profile-cinema">
        <Art name="extras-1" />
        <div>
          <span className="eyebrow">ЛИЧНОЕ ДЕЛО · DEVOPS QUEST</span>
          <h2>{name}</h2>
          <p>
            Уровень {g.level} · {rank(g.xp)}
          </p>
          <strong>
            {g.xp} <small>XP</small>
          </strong>
          <div className="bar">
            <i style={{ width: `${g.levelProgress}%` }} />
          </div>
          <small>
            До следующего уровня {g.next} XP. Ранг отражает игровой прогресс.
          </small>
        </div>
      </section>
      <section className="achievement-grid" aria-label="Достижения">
        {achievements.map((a, i) => (
          <article key={a.name} className={a.earned ? "earned" : "locked"}>
            <div className={`badge-art badge-${i}`} aria-hidden="true" />
            <h3>{a.name}</h3>
            <p>{a.detail}</p>
            <small>{a.earned ? "Получено" : "Пока не получено"}</small>
          </article>
        ))}
      </section>
    </>
  );
}
