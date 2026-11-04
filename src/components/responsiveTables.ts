/**
 * Bảng có class `cards-mobile` hiện dạng thẻ trên màn hẹp (CSS trong styles.css); mỗi ô cần nhãn cột.
 * Thay vì viết data-label tay cho từng ô, lấy nhãn từ <thead> theo vị trí cột (tính cả colSpan)
 * và cập nhật khi React vẽ lại.
 */
export function labelResponsiveTables(root: ParentNode = document) {
  for (const table of root.querySelectorAll<HTMLTableElement>('table.cards-mobile')) {
    const head = table.tHead?.rows[0];
    if (!head) continue;
    const labels: string[] = [];
    for (const th of Array.from(head.cells)) {
      labels.push(th.textContent?.trim() ?? '');
      for (let i = 1; i < th.colSpan; i++) labels.push('');
    }
    const sections = [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])];
    for (const section of sections) {
      for (const row of Array.from(section.rows)) {
        let col = 0;
        for (const cell of Array.from(row.cells)) {
          const label = cell.colSpan > 1 ? '' : labels[col];
          if (label) {
            if (cell.dataset.label !== label) cell.dataset.label = label;
          } else if (cell.dataset.label !== undefined) {
            delete cell.dataset.label;
          }
          col += cell.colSpan;
        }
      }
    }
  }
}

/** Gắn một lần khi khởi động app. */
export function watchResponsiveTables() {
  let scheduled = false;
  const run = () => {
    scheduled = false;
    labelResponsiveTables();
  };
  // Chỉ theo dõi thay đổi cây DOM (không theo dõi thuộc tính → không tự kích hoạt lại khi gán data-label)
  new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(run);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}
