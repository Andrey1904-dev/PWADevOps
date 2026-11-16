import { useEffect, useRef } from "react";
import { Art, bossArt } from "./Art";
export function Victory({
  chapter,
  onClose,
}: {
  chapter: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="victory"
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="victory-title"
    >
      <Art name={bossArt[chapter - 1]} />
      <div>
        <span className="eyebrow">НАГРАДА ПОДТВЕРЖДЕНА СЕРВЕРОМ</span>
        <h2 id="victory-title">Испытание пройдено</h2>
        <p>
          Глава {chapter}. Результат сохранён. Награда учтена в общем XP и не
          начисляется повторно.
        </p>
        <button className="primary" onClick={onClose}>
          Продолжить путь
        </button>
      </div>
    </dialog>
  );
}
