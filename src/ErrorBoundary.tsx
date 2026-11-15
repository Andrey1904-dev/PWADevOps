import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode; privateData?: boolean; scope?: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main style={{ margin: 0, padding: 32, maxWidth: 700 }}>
        <h1>Не удалось открыть локальные данные</h1>
        <p>
          Данные не удалены. Сохраните резервную копию перед восстановлением.
        </p>
        {this.props.privateData && (
          <button
            onClick={() => {
              const data = Object.fromEntries(
                Object.keys(localStorage)
                  .filter((k) => k === "devops-quest-v1:" + this.props.scope)
                  .map((k) => [k, localStorage.getItem(k)]),
              );
              const link = document.createElement("a");
              link.href = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              link.download = "devops-quest-recovery.json";
              link.click();
              URL.revokeObjectURL(link.href);
            }}
          >
            Скачать локальную копию
          </button>
        )}
        <button onClick={() => location.reload()}>Повторить запуск</button>
      </main>
    );
  }
}
