export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="ダッシュボードを読み込んでいます"
      className="dashboard-page dashboard-skeleton"
    >
      <div className="dashboard-frame">
        <header className="dashboard-header">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </header>
        <div className="skeleton-grid">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
        <p className="sr-only" role="status">
          温度・湿度・エアコン認識状態を読み込んでいます
        </p>
      </div>
    </main>
  );
}
