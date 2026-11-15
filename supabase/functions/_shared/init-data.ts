export async function hmac(key: Uint8Array, text: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text)),
  );
}
export async function validateInitData(
  raw: string,
  botToken: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ id: number }> {
  if (typeof raw !== "string" || !raw || raw.length > 12000)
    throw Error("INVALID_INIT_DATA");
  const params = new URLSearchParams(raw);
  const seen = new Set<string>();
  for (const [key] of params) {
    if (seen.has(key)) throw Error("DUPLICATE_FIELD");
    seen.add(key);
  }
  const supplied = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/.test(supplied)) throw Error("INVALID_SIGNATURE");
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = await hmac(new TextEncoder().encode("WebAppData"), botToken);
  const signature = await hmac(key, check);
  const actual = [...signature]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  let diff = 0;
  for (let i = 0; i < 64; i++)
    diff |= actual.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (diff) throw Error("INVALID_SIGNATURE");
  const date = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(date) || now - date > 300 || date - now > 30)
    throw Error("EXPIRED_INIT_DATA");
  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    throw Error("INVALID_USER");
  }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot)
    throw Error("INVALID_USER");
  return { id: user.id };
}
