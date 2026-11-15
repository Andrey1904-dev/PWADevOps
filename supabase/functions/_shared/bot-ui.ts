export const appUrl = "https://andrey1904-dev.github.io/PWADevOps/";
export const web = (text: string, screen = "") => ({
  text,
  web_app: { url: appUrl + (screen ? "?screen=" + screen : "") },
});
export const navigation = [
  [
    { text: "⬅️ Назад", callback_data: "v2:menu" },
    { text: "🏠 Главное меню", callback_data: "v2:menu" },
  ],
];
export const mainMenu = {
  inline_keyboard: [
    [
      { text: "🎯 Моя миссия", callback_data: "v2:mission" },
      web("🗺️ Путь DevOps", "plan"),
    ],
    [
      web("📊 Мой прогресс", "stats"),
      { text: "🏆 Боссы", callback_data: "v2:boss" },
    ],
    [web("📅 Календарь", "calendar"), web("⏰ Напоминания", "reminders")],
    [web("⚙️ Настройки", "settings"), web("🚀 Открыть приложение")],
  ],
};
export const welcomeKeyboard = {
  keyboard: [
    [web("🚀 Начать")],
    [{ text: "🎯 Моя миссия" }, { text: "🏠 Главное меню" }],
    [web("🗺️ Путь DevOps", "plan"), web("📅 Календарь", "calendar")],
    [web("⏰ Напоминания", "reminders"), web("⚙️ Настройки", "settings")],
  ],
  resize_keyboard: true,
  is_persistent: true,
};
export const notificationMenu = {
  inline_keyboard: [
    [
      { text: "🚀 Начать", callback_data: "v2:begin" },
      { text: "⏰ Через 30 минут", callback_data: "v2:snooze" },
    ],
    [
      { text: "✅ Выполнено", callback_data: "v2:done" },
      web("📱 Открыть приложение"),
    ],
    [{ text: "Сегодня отдыхаю", callback_data: "v2:rest" }],
  ],
};
