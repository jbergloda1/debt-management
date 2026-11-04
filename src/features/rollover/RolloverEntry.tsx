import { useState } from 'react';
import { formatYM, monthOf } from '../../domain/dates';
import { defaultTarget } from '../../domain/rollover';
import { useProfile } from '../../state/hooks';
import { useStore } from '../../state/store';
import { RolloverWizard } from './RolloverWizard';

/** Nút "Sang tháng mới" + thanh nhắc khi đã sang tháng mà vẫn đang xem tháng cũ. */
export function RolloverEntry({ variant }: { variant: 'button' | 'prompt' }) {
  const state = useProfile();
  const today = useStore((s) => s.today);
  const [open, setOpen] = useState(false);
  const target = defaultTarget(state.viewMonth, today);
  const behind = monthOf(today) > state.viewMonth;

  if (variant === 'prompt' && (!behind || state.obligations.length === 0)) return null;
  return (
    <>
      {variant === 'button' ? (
        <button onClick={() => setOpen(true)}>Sang tháng mới</button>
      ) : (
        <section className="rollover-banner" role="region" aria-label="Nhắc sang tháng mới">
          <div>
            <b>Đã sang tháng {formatYM(monthOf(today))}</b>
            <p>Đánh dấu các khoản đã trả tháng {formatYM(state.viewMonth)}, nhập sao kê mới và cập nhật tiền — khoảng 2 phút.</p>
          </div>
          <button className="primary" onClick={() => setOpen(true)}>Bắt đầu</button>
        </section>
      )}
      {open && <RolloverWizard target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
