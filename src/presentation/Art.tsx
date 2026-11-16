import { useState } from "react";
export const chapterArt = [
  "world-a-1",
  "world-a-2",
  "world-a-3",
  "world-a-4",
  "world-a-5",
  "world-a-6",
  "world-b-1",
  "world-b-2",
  "world-b-3",
  "world-b-4",
  "world-b-5",
  "world-b-6",
  "world-c-1",
  "world-c-2",
  "world-c-3",
  "world-c-4",
  "world-c-5",
  "world-c-6",
];
export function artUrl(name: string, width = 480) {
  return `${import.meta.env.BASE_URL}art/${name}-${width}.webp`;
}
export function Art({
  name,
  className = "",
  priority = false,
}: {
  name: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return <span className={`art-fallback ${className}`} aria-hidden="true" />;
  const large = name === "auth" || name === "hero";
  return (
    <img
      className={`quest-art ${className}`}
      src={artUrl(name)}
      srcSet={
        large
          ? `${artUrl(name)} 480w, ${artUrl(name, 960)} 960w, ${artUrl(name, 1600)} 1600w`
          : undefined
      }
      sizes={large ? "100vw" : undefined}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      width={large ? 1672 : 768}
      height={large ? 941 : 342}
      onError={() => setFailed(true)}
    />
  );
}
export function rank(xp: number) {
  return xp >= 15000
    ? "Архитектор маршрута"
    : xp >= 5000
      ? "Строитель систем"
      : xp >= 1500
        ? "Исследователь"
        : "Первый шаг";
}

export const bossArt = [
  "boss-b-1",
  "boss-b-2",
  "boss-3",
  "boss-4",
  "boss-2",
  "boss-1",
  "boss-b-3",
  "boss-b-4",
  "boss-b-5",
  "boss-b-6",
  "boss-c-1",
  "boss-c-2",
  "boss-c-3",
  "boss-c-4",
  "boss-c-5",
  "boss-c-6",
  "boss-5",
  "boss-6",
];
