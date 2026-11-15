import { it, expect } from "vitest";
import {
  validateEmail,
  validateRegistration,
  authError,
  bounded,
} from "../src/auth/validation";
it("validates registration before making an API request", () => {
  expect(validateEmail("test@example.com")).toBe(true);
  expect(validateEmail("bad@")).toBe(false);
  expect(
    validateRegistration(
      "Андрей",
      "test@example.com",
      "password123",
      "password123",
    ),
  ).toBe("");
  expect(
    validateRegistration("А", "test@example.com", "password123", "password123"),
  ).toContain("Имя");
  expect(
    validateRegistration("Андрей", "bad", "password123", "password123"),
  ).toContain("email");
  expect(
    validateRegistration("Андрей", "test@example.com", "short", "short"),
  ).toContain("Пароль");
  expect(
    validateRegistration(
      "Андрей",
      "test@example.com",
      "password123",
      "different",
    ),
  ).toContain("совпадают");
});
it("explains real Auth API failure categories without exposing raw error details", () => {
  expect(authError({ code: "invalid_credentials" })).toContain("Неверный");
  expect(authError({ code: "email_not_confirmed" })).toContain("Подтвердите");
  expect(authError({ code: "email_address_not_authorized" })).toContain("SMTP");
  expect(authError({ code: "over_email_send_rate_limit" })).toContain("Лимит");
});
it("bounds pending authentication calls", async () => {
  await expect(bounded(new Promise(() => {}), 5)).rejects.toEqual({
    code: "request_timeout",
  });
  expect(await bounded(Promise.resolve("ok"))).toBe("ok");
});
