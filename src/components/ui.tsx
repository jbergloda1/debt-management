import { type ReactNode } from 'react';
import { Modal as AntModal, Empty as AntEmpty } from 'antd';
import type { DueState } from '../domain/types';
import type { Alert } from '../domain/alerts';

export const STATE_LABEL: Record<DueState, string> = {
  paid: 'Đã trả',
  partial: 'Trả một phần',
  overdue: 'Quá hạn',
  due_soon: 'Sắp đến hạn',
  upcoming: 'Còn hạn',
  not_yet: 'Chưa đến kỳ',
};

const STATE_TONE: Record<DueState, string> = {
  paid: 'green',
  partial: 'blue',
  overdue: 'red',
  due_soon: 'yellow',
  upcoming: 'gray',
  not_yet: 'gray',
};

export const StatusBadge = ({ state }: { state: DueState }) => (
  <span className={`badge ${STATE_TONE[state]}`}>{STATE_LABEL[state]}</span>
);

export function daysText(days: number): string {
  if (days === 0) return 'hôm nay';
  return days > 0 ? `còn ${days} ngày` : `trễ ${-days} ngày`;
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return <AntModal open title={props.title} onCancel={props.onClose} footer={props.footer ?? null} width={props.wide ? 980 : 560} centered styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingTop: 16 } }}><div className="modal-content">{props.children}</div></AntModal>;
}

export function Tile(props: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className={`tile ${props.tone ?? ''}`}>
      <div className="tile-label">{props.label}</div>
      <div className="tile-value">{props.value}</div>
      {props.sub && <div className="tile-sub">{props.sub}</div>}
    </div>
  );
}

export function AlertList({ items, onOpen }: { items: Alert[]; onOpen?: (obligationId: string) => void }) {
  if (items.length === 0) return <p className="muted">Không có cảnh báo.</p>;
  return (
    <ul className="alerts">
      {items.map((a, i) => (
        <li key={i} className={`alert ${a.level}`}>
          <span className="alert-code">{a.code}</span>
          <span>{a.message}</span>
          {a.obligationId && onOpen && (
            <button className="link" onClick={() => onOpen(a.obligationId!)}>
              Xem
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty"><AntEmpty image={AntEmpty.PRESENTED_IMAGE_SIMPLE} description={children} /></div>;
