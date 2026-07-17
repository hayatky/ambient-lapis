export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <section
        aria-labelledby="page-title"
        className="w-full rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-[0_12px_36px_rgba(31,50,73,0.08)] sm:p-8"
      >
        <p className="m-0 text-sm font-medium text-[var(--accent-lapis)]">
          Ambient Lapis
        </p>
        <h1 id="page-title" className="mt-2 mb-0 text-xl font-semibold">
          ダッシュボードの基盤を準備しています
        </h1>
        <p className="mt-3 mb-0 max-w-2xl text-[var(--text-secondary)]">
          Nature Remo Lapisの温湿度と、エアコンのNature
          Remo認識状態を静かに見渡せる画面を構築中です。
        </p>
      </section>
    </main>
  );
}
