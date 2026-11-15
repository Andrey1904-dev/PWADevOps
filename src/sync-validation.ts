export function completeSettings(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  if (typeof s.timezone !== "string") return false;
  if (s.timezone) {
    try {
      new Intl.DateTimeFormat("ru", { timeZone: s.timezone });
    } catch {
      return false;
    }
  }
  for (const key of ["quietStart", "quietEnd"])
    if (
      typeof s[key] !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s[key] as string)
    )
      return false;
  for (const key of ["workTimes", "restTimes"]) {
    if (
      s[key] !== undefined &&
      (typeof s[key] !== "string" ||
        (s[key] as string)
          .split(",")
          .filter(Boolean)
          .some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
    )
      return false;
  }
  return true;
}
