import { useMemo, useState } from 'react';
import { Field, Select } from '../../components/inputs';
import { saveFile, slug } from '../../data/io';
import { addDays } from '../../domain/dates';
import { buildIcs } from '../../domain/ics';
import { reminderSchedule } from '../../domain/reminders';
import { useEngine, useFmt, useProfile, useUpdate } from '../../state/hooks';
import { syncReminders } from '../../state/reminders';
import { useStore } from '../../state/store';
import { enablePeriodicSync, isIos, isStandalone, notificationsSupported, promptInstall, showNotification, usePwa } from '../../pwa/pwa';

const PERMISSION_TEXT: Record<NotificationPermission, string> = {
  granted: 'đã cho phép',
  denied: 'đã bị chặn — mở cài đặt trang của trình duyệt để cho phép lại',
  default: 'chưa hỏi',
};

/** "5, 1" → [5, 1] */
const parseDays = (t: string) =>
  [...new Set(t.split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 60))].sort((a, b) => b - a);

export function RemindersPanel() {
  const state = useProfile();
  const engine = useEngine();
  const update = useUpdate();
  const fmt = useFmt();
  const today = useStore((s) => s.today);
  const enabled = useStore((s) => s.notifyEnabled);
  const setEnabled = useStore((s) => s.setNotifyEnabled);
  const { installEvent, swActive } = usePwa();
  const [daysText, setDaysText] = useState(state.profile.settings.reminderDaysBefore.join(', '));
  const [months, setMonths] = useState('12');
  const [message, setMessage] = useState<string>();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    notificationsSupported() ? Notification.permission : 'unsupported',
  );

  const upcoming = useMemo(() => reminderSchedule(engine, today, addDays(today, 30)).slice(0, 8), [engine, today]);

  const turnOn = async () => {
    if (!notificationsSupported()) return;
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p !== 'granted') return setMessage('Trình duyệt không cho phép thông báo.');
    await setEnabled(true);
    const background = await enablePeriodicSync();
    const shown = await syncReminders(state, today, true);
    setMessage(
      `Đã bật nhắc hạn${shown.length ? ` — vừa nhắc ${shown.length} khoản` : ''}. ` +
        (background ? 'App sẽ tự kiểm tra cả khi đang đóng (khoảng 1 lần/ngày).' : 'Nhắc khi bạn mở app; để nhắc chắc chắn khi app đóng, hãy tải file lịch bên dưới.'),
    );
  };

  const test = async () => {
    await showNotification('Thử nhắc hạn', { body: 'Thông báo sẽ trông như thế này.', tag: 'test', icon: './icons/icon-192.png' });
  };

  const exportIcs = () => {
    saveFile(`nhac-tra-no-${slug(state.profile.name)}.ics`, buildIcs(engine, state.viewMonth, Number(months)), 'text/calendar');
  };

  return (
    <section className="panel">
      <h2>Nhắc hạn & ứng dụng</h2>

      <div className="form">
        <Field label="Nhắc trước hạn (ngày)" hint="Ví dụ: 5, 1 — luôn nhắc thêm vào đúng ngày đến hạn">
          <input
            value={daysText}
            onChange={(e) => setDaysText(e.target.value)}
            onBlur={() => {
              const reminderDaysBefore = parseDays(daysText);
              setDaysText(reminderDaysBefore.join(', '));
              update((x) => ({ ...x, profile: { ...x.profile, settings: { ...x.profile.settings, reminderDaysBefore } } }));
            }}
          />
        </Field>
      </div>

      <h3>Thông báo trên thiết bị này</h3>
      {permission === 'unsupported' ? (
        <p className="muted">Trình duyệt này không hỗ trợ thông báo{isIos() ? ' — trên iPhone hãy cài app ra màn hình chính (iOS 16.4+)' : ''}.</p>
      ) : (
        <>
          <p className="small-text">
            Trạng thái: <b>{enabled && permission === 'granted' ? 'đang bật' : 'đang tắt'}</b> · quyền thông báo: {PERMISSION_TEXT[permission]}
          </p>
          <div className="toolbar">
            {enabled && permission === 'granted' ? (
              <>
                <button onClick={() => setEnabled(false).then(() => setMessage('Đã tắt nhắc hạn.'))}>Tắt nhắc hạn</button>
                <button onClick={test}>Gửi thông báo thử</button>
              </>
            ) : (
              <button className="primary" disabled={permission === 'denied'} onClick={turnOn}>Bật nhắc hạn</button>
            )}
          </div>
        </>
      )}
      <p className="muted small-text">
        Không có máy chủ nên không có push: thông báo hiện khi bạn mở app, và — nếu đã cài app trên Chrome/Edge — khi trình duyệt tự
        kiểm tra nền (khoảng 1 lần/ngày, không đảm bảo). Cách chắc chắn nhất: tải file lịch .ics bên dưới.
      </p>

      <h3>Nhắc qua lịch điện thoại</h3>
      <p className="small-text">
        File .ics gồm mỗi khoản chưa trả một sự kiện, có báo thức 9:00 trước hạn theo số ngày ở trên. Nhập vào Google Calendar hoặc
        lịch iPhone để được nhắc kể cả khi không mở app. Khi số tiền thay đổi, tải lại và nhập đè (cùng mã sự kiện).
      </p>
      <div className="toolbar">
        <Select
          value={months}
          onChange={setMonths}
          options={[
            { value: '3', label: '3 tháng tới' },
            { value: '6', label: '6 tháng tới' },
            { value: '12', label: '12 tháng tới' },
          ]}
        />
        <button onClick={exportIcs}>Tải lịch nhắc (.ics)</button>
      </div>

      <h3>Sắp nhắc (30 ngày)</h3>
      {upcoming.length === 0 ? (
        <p className="muted">Không có khoản nào cần nhắc.</p>
      ) : (
        <table className="reminders-preview">
          <tbody>
            {upcoming.map((r) => (
              <tr key={r.key}>
                <td className="nowrap">{fmt.date(r.date)}</td>
                <td>{r.title}</td>
                <td className="r">{fmt.money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Cài ứng dụng</h3>
      {isStandalone() ? (
        <p className="small-text">Đang chạy như ứng dụng đã cài{swActive ? ' · dùng được khi không có mạng' : ''}.</p>
      ) : installEvent ? (
        <button onClick={() => promptInstall()}>Cài Debt Manager lên thiết bị</button>
      ) : (
        <p className="muted small-text">
          {isIos()
            ? 'Trên iPhone/iPad: bấm nút Chia sẻ trong Safari → "Thêm vào MH chính".'
            : 'Mở bằng Chrome/Edge và chọn "Cài đặt ứng dụng" trên thanh địa chỉ (nút cài hiện ở đây khi trình duyệt cho phép).'}
          {swActive && ' Đã sẵn sàng dùng offline.'}
        </p>
      )}

      {message && <p className="notice">{message}</p>}
    </section>
  );
}
