import { useState } from 'react';
import { DateInput, Field, MoneyInput, TextInput } from '../../components/inputs';
import { Modal } from '../../components/ui';
import { newId } from '../../domain/defaults';
import type { DueItem } from '../../domain/types';
import { useFmt, useUpdate } from '../../state/hooks';
import { useStore } from '../../state/store';

/** Ghi nhận một lần thanh toán thực tế (P5) cho một DueItem. */
export function PaymentModal({ item, title, onClose }: { item: DueItem; title: string; onClose: () => void }) {
  const update = useUpdate();
  const today = useStore((s) => s.today);
  const fmt = useFmt();
  const remaining = Math.max(0, (item.plannedAmount ?? item.amount) - item.paidAmount);
  const [amount, setAmount] = useState<number | undefined>(remaining || item.amount - item.paidAmount);
  const [date, setDate] = useState<string | undefined>(today);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');

  const save = () => {
    if (!amount || !date) return;
    update((s) => ({
      ...s,
      payments: [
        ...s.payments,
        { id: newId('pay'), obligationId: item.obligationId, dueItemKey: item.key, date, amount, method: method || undefined, note: note || undefined },
      ],
    }));
    onClose();
  };

  return (
    <Modal
      title={`Ghi nhận thanh toán — ${title}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Huỷ</button>
          <button className="primary" disabled={!amount || !date} onClick={save}>
            Lưu thanh toán
          </button>
        </>
      }
    >
      <p className="muted">
        {item.label} · đến hạn {fmt.date(item.dueDate)} · phải trả {fmt.money(item.amount)}
        {item.paidAmount > 0 && <> · đã trả {fmt.money(item.paidAmount)}</>}
      </p>
      <div className="form">
        <Field label="Số tiền"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Ngày trả"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Hình thức"><TextInput value={method} onChange={setMethod} placeholder="Chuyển khoản, tiền mặt…" /></Field>
        <Field label="Ghi chú"><TextInput value={note} onChange={setNote} /></Field>
      </div>
    </Modal>
  );
}
