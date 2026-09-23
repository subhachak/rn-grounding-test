// Harbor Retirement design tokens. One place for colour, spacing, radius,
// type, and elevation so every screen looks like the same product.
import { Platform } from 'react-native';

export const colors = {
  navy: '#0B1F3A',
  navyLight: '#1E3A8A',
  teal: '#14B8A6',
  tealDark: '#0F766E',
  blue: '#2563EB',
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F7',
  border: '#E3E8EF',
  text: '#0F172A',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',
  success: '#16A34A',
  successBg: '#DCFCE7',
  warning: '#B45309',
  warningBg: '#FEF3C7',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const type = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};

export const shadow = Platform.select({
  ios: { shadowColor: '#0B1F3A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  default: { elevation: 3 },
});

export function formatMoney(amount: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = amount < 0 ? '-' : opts.sign ? '+' : '';
  return `${sign}$${abs}`;
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
