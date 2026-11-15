import missionTitles from "./mission-titles.json" with { type: "json" };
export const topics = [
  "Python: основы",
  "Python: автоматизация",
  "Linux и Bash",
  "Сети и Git",
  "Docker",
  "CI/CD",
  "Портфолио-проект",
  "Junior-собеседования",
  "Kubernetes: основы",
  "Kubernetes: эксплуатация",
  "Terraform и облака",
  "Ansible",
  "Мониторинг",
  "Надёжность и инциденты",
  "DevSecOps",
  "Комплексная инфраструктура",
  "Middle-собеседования",
  "Финальный экзамен",
];
const skills = [
  "Типы, циклы, функции, файлы, исключения",
  "CLI, API, логирование, тесты",
  "Процессы, права, systemd, Bash",
  "TCP/IP, DNS, HTTP, ветки и review",
  "Образы, сети, volumes, Compose",
  "Pipeline, артефакты, секреты, откат",
  "Сервис, CI, документация, демонстрация",
  "Диагностика и объяснение решений",
  "Pod, Deployment, Service, probes",
  "Helm, RBAC, ресурсы, troubleshooting",
  "State, модули, plan, IAM",
  "Inventory, роли, идемпотентность",
  "Метрики, логи, PromQL, алерты",
  "SLO, runbook, incident, postmortem",
  "Сканирование, least privilege, supply chain",
  "IaC, GitOps, backup, disaster recovery",
  "System design, troubleshooting, tradeoffs",
  "Независимый deploy и восстановление",
];
export const chapters = topics.map((title, i) => ({
  id: i + 1,
  title,
  month: new Date(Date.UTC(2026, 10 + i, 1)).toISOString().slice(0, 7),
  criteria: skills[i],
  boss: `Развернуть и защитить проект: ${title}. Сквозные навыки: ${topics.slice(0, i + 1).join(" → ")}`,
  missions: Array.from({ length: 20 }, (_, j) => ({
    id: `${i + 1}-${j + 1}`,
    number: j + 1,
    title: j === 19 ? "Финальный босс" : missionTitles[i][j],
    task:
      j === 19
        ? `Соберите проект по теме «${title}» без пошаговой подсказки. Покажите deploy, диагностику намеренной ошибки и восстановление. Сохраните README, код, тесты и независимую оценку по критериям: ${skills.slice(0, i + 1).join("; ")}.`
        : `Тема: ${missionTitles[i][j]}. Объясните принцип в ChatGPT, создайте воспроизводимую лабораторию в Codex. Проверьте успешный сценарий и ошибочный ввод/отказ, сохраните команды, код и наблюдаемый результат. Критерий: вы можете повторить решение и объяснить его без подсказки.`,
  })),
}));
export type MissionStatus =
  "not_started" | "in_progress" | "solved" | "verified";
export const statusLabels: Record<MissionStatus, string> = {
  not_started: "Не начато",
  in_progress: "В процессе",
  solved: "Решено",
  verified: "Проверено",
};
