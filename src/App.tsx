import { useEffect, useState } from 'react';
import { Button, Menu, Select, Tooltip, Spin, Badge } from 'antd';
import { AppstoreOutlined, CalendarOutlined, WalletOutlined, CreditCardOutlined, LineChartOutlined, SwapOutlined, BankOutlined, SettingOutlined, SafetyCertificateOutlined, EyeOutlined, EyeInvisibleOutlined, LeftOutlined, RightOutlined, MenuOutlined, CloseOutlined } from '@ant-design/icons';
import { addMonthsYM, formatYM, monthOf } from './domain/dates';
import { Calendar } from './features/calendar/Calendar';
import { CardsPage } from './features/cards/CardsPage';
import { Cashflow } from './features/cashflow/Cashflow';
import { Dashboard } from './features/dashboard/Dashboard';
import { Institutions } from './features/institutions/Institutions';
import { ObligationDetail } from './features/obligations/ObligationDetail';
import { ObligationList } from './features/obligations/ObligationList';
import { Onboarding } from './features/onboarding/Onboarding';
import { Projection } from './features/projection/Projection';
import { Settings } from './features/settings/Settings';
import { useAlerts, useProfile, useUpdate } from './state/hooks';
import { useNav, type Page } from './state/nav';
import { useStore } from './state/store';
import { useReminderSync } from './state/reminders';
import { useBackupSync } from './state/backup';

const NAV: { page: Page; label: string }[] = [
  { page: 'dashboard', label: 'Tổng quan' },
  { page: 'calendar', label: 'Lịch' },
  { page: 'obligations', label: 'Khoản nợ' },
  { page: 'cards', label: 'Thẻ & hạn mức' },
  { page: 'projection', label: 'Dự phóng' },
  { page: 'cashflow', label: 'Dòng tiền' },
  { page: 'institutions', label: 'Tổ chức & preset' },
  { page: 'settings', label: 'Cài đặt' },
];

export default function App() {
  const { ready, state, notice, init, setNotice } = useStore();
  useEffect(() => {
    init();
  }, [init]);

  if (!ready) return <div className="loading"><Spin size="large" /><p>Đang chuẩn bị không gian tài chính…</p></div>;
  return (
    <>
      {notice && (
        <div className="toast" role="status">
          {notice} <button className="ghost small" onClick={() => setNotice(undefined)}>✕</button>
        </div>
      )}
      {state ? <Shell /> : <Onboarding />}
    </>
  );
}

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const state = useProfile();
  const update = useUpdate();
  const { profiles, switchProfile, privacy, setPrivacy, today } = useStore();
  const { page, id, go } = useNav();
  const alerts = useAlerts();
  useReminderSync();
  useBackupSync();
  const urgent = alerts.filter((a) => a.level === 'error').length;
  const setMonth = (viewMonth: string) => update((s) => ({ ...s, viewMonth }));

  return (
    <div className="app">
      {mobileOpen && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`side ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand"><span className="brand-mark"><WalletOutlined /></span><div>Debt Manager<small>TÀI CHÍNH TRONG TẦM TAY</small></div><Button className="mobile-close" type="text" icon={<CloseOutlined />} aria-label="Đóng menu" onClick={() => setMobileOpen(false)} /></div>
        <div className="profile-box"><span className="eyebrow">KHÔNG GIAN CỦA BẠN</span><Select className="profile-switch" value={state.profile.id} onChange={switchProfile} aria-label="Chọn hồ sơ" options={profiles.map(p => ({ value: p.id, label: p.name }))} /></div>
        <span className="nav-caption">QUẢN LÝ TÀI CHÍNH</span>
        <nav aria-label="Điều hướng chính"><Menu mode="inline" inlineCollapsed={false} selectedKeys={[page === 'obligation' ? 'obligations' : page]} onClick={({ key }) => { go(key as Page); setMobileOpen(false); }} items={NAV.map((n, i) => ({ key: n.page, icon: [<AppstoreOutlined />, <CalendarOutlined />, <WalletOutlined />, <CreditCardOutlined />, <LineChartOutlined />, <SwapOutlined />, <BankOutlined />, <SettingOutlined />][i], label: <span className="nav-label">{n.label}{n.page === 'dashboard' && urgent > 0 && <Badge count={urgent} size="small" />}</span> }))} /></nav>
        <div className="sidebar-footer"><SafetyCertificateOutlined /><div>Dữ liệu của riêng bạn<small>Được lưu trên thiết bị này</small></div></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Button className="mobile-toggle" type="text" icon={<MenuOutlined />} aria-label="Mở menu" onClick={() => setMobileOpen(true)} />
          <div className="topbar-title">{NAV.find(n => n.page === (page === 'obligation' ? 'obligations' : page))?.label}<span>Không gian tài chính cá nhân</span></div>
          <span className="spacer" />
          <div className="month-picker">
            <Button type="text" icon={<LeftOutlined />} onClick={() => setMonth(addMonthsYM(state.viewMonth, -1))} aria-label="Tháng trước" />
            <input type="month" value={state.viewMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            <Button type="text" icon={<RightOutlined />} onClick={() => setMonth(addMonthsYM(state.viewMonth, 1))} aria-label="Tháng sau" />
            {state.viewMonth !== monthOf(today) && (
              <button className="small" onClick={() => setMonth(monthOf(today))}>Về {formatYM(monthOf(today))}</button>
            )}
          </div>
          <Tooltip title={privacy ? 'Hiện số tiền' : 'Ẩn số tiền khi chia sẻ màn hình'}><Button aria-label={privacy ? 'Hiện số tiền' : 'Ẩn số tiền'} icon={privacy ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => setPrivacy(!privacy)} /></Tooltip>
        </header>
        <main key={`${page}-${id ?? ""}`} className="page-enter">
          {page === 'dashboard' && <Dashboard />}
          {page === 'calendar' && <Calendar />}
          {page === 'obligations' && <ObligationList />}
          {page === 'obligation' && id && <ObligationDetail id={id} />}
          {page === 'cards' && <CardsPage />}
          {page === 'projection' && <Projection />}
          {page === 'cashflow' && <Cashflow />}
          {page === 'institutions' && <Institutions />}
          {page === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}
