// Demo data. Usernames match the personas in test-data/testdata.json, and
// plan ids match its plan records.

export interface Member {
  username: string;
  name: string;
  initials: string;
  memberSince: number;
  tier: 'Premier' | 'Basic';
  isEntitled: boolean;
}

export const MEMBERS: Record<string, Member> = {
  'member.entitled': { username: 'member.entitled', name: 'Alex Morgan', initials: 'AM', memberSince: 2016, tier: 'Premier', isEntitled: true },
  'member.restricted': { username: 'member.restricted', name: 'Jordan Lee', initials: 'JL', memberSince: 2022, tier: 'Basic', isEntitled: false },
};

export interface Plan {
  id: string;
  name: string;
  kind: string;
  balance: number;
  ytdReturn: number;
  entitled: boolean;
  allocation: { label: string; percent: number; color: string }[];
}

export const PLANS: Plan[] = [
  {
    id: 'p1',
    name: 'Growth Fund 2045',
    kind: 'Target-date fund',
    balance: 48210.55,
    ytdReturn: 8.2,
    entitled: true,
    allocation: [
      { label: 'US stocks', percent: 52, color: '#2563EB' },
      { label: 'International', percent: 28, color: '#14B8A6' },
      { label: 'Bonds', percent: 20, color: '#F59E0B' },
    ],
  },
  {
    id: 'p2',
    name: 'Stable Income Fund',
    kind: 'Fixed income',
    balance: 12904.1,
    ytdReturn: 2.1,
    entitled: false,
    allocation: [
      { label: 'Bonds', percent: 75, color: '#F59E0B' },
      { label: 'Cash', percent: 25, color: '#94A3B8' },
    ],
  },
  {
    id: 'p3',
    name: 'Global ESG Balanced',
    kind: 'Balanced fund',
    balance: 21337.8,
    ytdReturn: 5.6,
    entitled: true,
    allocation: [
      { label: 'Global stocks', percent: 60, color: '#14B8A6' },
      { label: 'Green bonds', percent: 40, color: '#22C55E' },
    ],
  },
];

export const TOTAL_BALANCE = PLANS.reduce((sum, p) => sum + p.balance, 0);
export const MONTHLY_BALANCES = [74200, 75810, 76140, 78920, 80105, TOTAL_BALANCE];
export const MONTH_LABELS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

export type TransactionKind = 'contribution' | 'dividend' | 'fee' | 'withdrawal';

export interface Transaction {
  id: string;
  kind: TransactionKind;
  title: string;
  planId: string;
  date: string;
  amount: number;
}

export const TRANSACTIONS: Transaction[] = [
  { id: 't1', kind: 'contribution', title: 'Monthly contribution', planId: 'p1', date: '2026-09-15', amount: 500 },
  { id: 't2', kind: 'dividend', title: 'Dividend reinvested', planId: 'p3', date: '2026-09-10', amount: 84.12 },
  { id: 't3', kind: 'fee', title: 'Account maintenance fee', planId: 'p2', date: '2026-09-01', amount: -12.5 },
  { id: 't4', kind: 'contribution', title: 'Monthly contribution', planId: 'p1', date: '2026-08-15', amount: 500 },
  { id: 't5', kind: 'contribution', title: 'Employer match', planId: 'p1', date: '2026-08-15', amount: 250 },
  { id: 't6', kind: 'withdrawal', title: 'Hardship withdrawal', planId: 'p2', date: '2026-08-03', amount: -1200 },
  { id: 't7', kind: 'dividend', title: 'Dividend reinvested', planId: 'p1', date: '2026-07-11', amount: 132.4 },
  { id: 't8', kind: 'contribution', title: 'Monthly contribution', planId: 'p3', date: '2026-07-15', amount: 300 },
];

export interface Document {
  id: string;
  title: string;
  period: string;
}

export const DOCUMENTS: Document[] = [
  { id: 'd1', title: 'Quarterly statement', period: 'Q2 2026' },
  { id: 'd2', title: 'Quarterly statement', period: 'Q1 2026' },
  { id: 'd3', title: 'Annual tax summary', period: '2025' },
  { id: 'd4', title: 'Fee disclosure', period: '2026' },
];
