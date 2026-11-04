import { create } from 'zustand';

export type Page =
  | 'dashboard'
  | 'calendar'
  | 'obligations'
  | 'obligation'
  | 'cards'
  | 'projection'
  | 'cashflow'
  | 'institutions'
  | 'settings';

interface Nav {
  page: Page;
  id?: string;
  go(page: Page, id?: string): void;
}

const parse = (): { page: Page; id?: string } => {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: (page as Page) || 'dashboard', id: id ? decodeURIComponent(id) : undefined };
};

export const useNav = create<Nav>((set) => ({
  ...parse(),
  go(page, id) {
    location.hash = `/${page}${id ? `/${encodeURIComponent(id)}` : ''}`;
    set({ page, id });
    window.scrollTo(0, 0);
  },
}));

window.addEventListener('hashchange', () => useNav.setState(parse()));
