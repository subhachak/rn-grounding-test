// Activity. Filter chips and transaction rows get testIDs built from data
// (activity-filter-contribution, activity-row-t1). TransactionRow lives in
// the same file as the screen: two components, two "screens" to the scanner.
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Screen } from '../components/Screen';
import { PLANS, TRANSACTIONS, type Transaction, type TransactionKind } from '../data/mock';
import { colors, formatDate, formatMoney, radius, spacing, type } from '../theme';

const FILTERS: { key: 'all' | TransactionKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'dividend', label: 'Dividends' },
  { key: 'fee', label: 'Fees' },
  { key: 'withdrawal', label: 'Withdrawals' },
];

export default function ActivityScreen() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const rows = TRANSACTIONS.filter((t) => filter === 'all' || t.kind === filter);

  return (
    <Screen testID="activity-screen" edges={['top']}>
      <Text style={styles.title}>Activity</Text>
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.key} testID={`activity-filter-${f.key}`} title={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>
      <Card>
        {rows.length ? (
          rows.map((t) => <TransactionRow key={t.id} transaction={t} />)
        ) : (
          <Text testID="activity-empty-text" style={styles.empty}>
            No activity of this type yet.
          </Text>
        )}
      </Card>
    </Screen>
  );
}

const ICONS: Record<TransactionKind, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  contribution: { name: 'arrow-down-circle', color: colors.success },
  dividend: { name: 'sparkles', color: colors.blue },
  fee: { name: 'receipt', color: colors.textMuted },
  withdrawal: { name: 'arrow-up-circle', color: colors.danger },
};

export function TransactionRow({ transaction: t }: { transaction: Transaction }) {
  const plan = PLANS.find((p) => p.id === t.planId);
  return (
    <View testID={`activity-row-${t.id}`} style={styles.row}>
      <View style={[styles.icon, { backgroundColor: `${ICONS[t.kind].color}18` }]}>
        <Ionicons name={ICONS[t.kind].name} size={20} color={ICONS[t.kind].color} />
      </View>
      <View style={styles.text}>
        <Text style={styles.rowTitle}>{t.title}</Text>
        <Text style={styles.rowSub}>
          {plan?.name} · {formatDate(t.date)}
        </Text>
      </View>
      <Text testID={`activity-amount-${t.id}`} style={[styles.amount, { color: t.amount < 0 ? colors.danger : colors.success }]}>
        {formatMoney(t.amount, { sign: true })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, fontWeight: '600', color: colors.text },
  rowSub: { ...type.caption, color: colors.textMuted },
  amount: { ...type.body, fontWeight: '700' },
});
