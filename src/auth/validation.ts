export const redirectUrl = () =>
  window.location.origin + import.meta.env.BASE_URL;
export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
export function validateRegistration(
  name: string,
  email: string,
  password: string,
  repeat: string,
) {
  if (name.trim().length < 2 || name.trim().length > 40)
    return "Имя пользователя должно содержать от 2 до 40 символов.";
  if (!validateEmail(email.trim())) return "Укажите корректный email.";
  if (password.length < 8 || password.length > 128)
    return "Пароль должен содержать от 8 до 128 символов.";
  if (password !== repeat) return "Пароли не совпадают.";
  return "";
}
export function authError(error: {
  code?: string;
  message?: string;
  status?: number;
}) {
  if (
    error.status === 429 ||
    /email.*rate.limit|rate.limit.*email/i.test(error.message || "")
  )
    return "Лимит отправки писем Supabase исчерпан. Повторите позже; владельцу проекта нужно проверить почтовые квоты или настроить SMTP.";
  const messages: Record<string, string> = {
    invalid_credentials: "Неверный email или пароль.",
    email_not_confirmed:
      "Подтвердите email. Если письма нет, запросите его повторно.",
    email_address_invalid:
      "Supabase отклонил этот email. Проверьте адрес; тестовые и временные домены могут быть запрещены.",
    email_address_not_authorized:
      "Почтовый сервис Supabase не разрешает отправку на этот адрес. Владельцу проекта нужно настроить SMTP.",
    over_email_send_rate_limit:
      "Лимит отправки писем исчерпан. Повторите позже; при повторении ошибки требуется настройка почты проекта.",
    over_request_rate_limit:
      "Слишком много запросов. Подождите немного и повторите.",
    signup_disabled:
      "Регистрация отключена в Supabase. Обратитесь к владельцу проекта.",
    weak_password:
      "Пароль слишком простой. Используйте более длинный уникальный пароль.",
    user_already_exists:
      "Аккаунт с этим email уже существует. Войдите или восстановите пароль.",
    same_password: "Новый пароль должен отличаться от прежнего.",
    otp_expired: "Ссылка устарела или уже использована. Запросите новую.",
    email_exists: "Этот email уже используется.",
    request_timeout:
      "Сервер не ответил вовремя. Проверьте соединение и повторите.",
  };
  if (error.code && messages[error.code]) return messages[error.code];
  const text = error.message || "";
  if (/invalid.*(credentials|password)|invalid.login/i.test(text))
    return "Неверный email или пароль.";
  if (/email.not.confirmed/i.test(text))
    return "Подтвердите email. Если письма нет, запросите его повторно.";
  if (/email.*invalid/i.test(text)) return messages.email_address_invalid;
  if (/sending.*email|smtp/i.test(text))
    return "Не удалось отправить письмо. Требуется проверить SMTP и лимиты Supabase.";
  if (/fetch|network/i.test(text))
    return "Нет связи с сервером. Проверьте подключение и повторите.";
  return "Не удалось выполнить запрос. Повторите позже или обратитесь к владельцу проекта.";
}
export async function bounded<T>(
  operation: PromiseLike<T>,
  ms = 20000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject({ code: "request_timeout" }), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
