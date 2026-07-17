import type { ReactElement } from "react";

// Standing notes about how to read the data. Kept quiet at the bottom of
// the page but always present.
export function DataNotes(): ReactElement {
  return (
    <section
      aria-label="データの注記"
      className="border-t border-[var(--border-subtle)] pt-5"
    >
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs leading-relaxed text-[var(--text-secondary)]">
        <li>
          計測時刻はセンサーが値を観測した時刻、取得時刻はNature Cloud
          APIからデータを取得した時刻です。
        </li>
        <li>
          エアコンの表示はNature
          Remoが認識している状態であり、エアコン本体の実際の運転状態とは異なる場合があります。
        </li>
        <li>
          データが欠損した区間はグラフの線を切って表示し、推測による補完は行いません。
        </li>
        <li>時刻はすべて日本時間(Asia/Tokyo)で表示しています。</li>
      </ul>
    </section>
  );
}
