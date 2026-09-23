// Home: balance, performance, quick actions, plans, and recent activity.
// testIDs here come from constants (src/testIds.ts), a common team pattern.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from '../components/BarChart';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { MONTH_LABELS, MONTHLY_BALANCES, PLANS, TOTAL_BALANCE, TRANSACTIONS } from '../data/mock';
import { useSession } from '../session';
import { HOME } from '../testIds';
import { colors, formatDate, formatMoney, radius, spacing, type } from '../theme';

const monthChange = MONTHLY_BALANCES[MONTHLY_BALANCES.length - 1] - MONTHLY_BALANCES[MONTHLY_BALANCES.length - 2];

export default function HomeScreen({ navigation }: any) {
  const { member } = useSession();
  const firstName = member?.name.split(' ')[0] ?? '';

  return (
    <Screen testID={HOME.screen} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Good morning,</Text>
          <Text testID={HOME.greeting} style={styles.name}>
            {firstName}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{member?.initials}</Text>
        </View>
      </View>

      <LinearGradient testID={HOME.balanceCard} colors={[colors.navy, colors.navyLight]} style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total balance</Text>
        <Text testID={HOME.balanceAmount} style={styles.balance}>
          {formatMoney(TOTAL_BALANCE)}
        </Text>
        <View style={styles.changeRow}>
          <Ionicons name="trending-up" size={16} color="#5EEAD4" />
          <Text style={styles.change}>{formatMoney(monthChange, { sign: true })} this month</Text>
        </View>
        <BarChart values={MONTHLY_BALANCES} labels={MONTH_LABELS} />
      </LinearGradient>

      <View style={styles.actions}>
        <QuickAction testID={HOME.contributeAction} title="Contribute" icon="add-circle" onPress={() => navigation.navigate('Contribute')} />
        <QuickAction testID={HOME.documentsAction} title="Statements" icon="document-text" onPress={() => navigation.navigate('Documents')} />
        <QuickAction testID={HOME.activityAction} title="Activity" icon="pulse" onPress={() => navigation.navigate('Activity')} />
      </View>

      <Card>
        <SectionHeader title="Your plans" action="Manage" testID={HOME.managePlans} onAction={() => navigation.navigate('Plans')} />
        {PLANS.map((plan) => (
          <ListRow
            key={plan.id}
            testID={`home-plan-${plan.id}`}
            title={plan.name}
            subtitle={plan.kind}
            value={formatMoney(plan.balance)}
            icon="pie-chart"
            iconColor={colors.teal}
            onPress={() => navigation.navigate('PlanDetails', { planId: plan.id })}
          />
        ))}
      </Card>

      <Card>
        <SectionHeader title="Recent activity" action="See all" testID={HOME.seeAllActivity} onAction={() => navigation.navigate('Activity')} />
        {TRANSACTIONS.slice(0, 3).map((t) => (
          <View key={t.id} style={styles.txn}>
            <Text style={styles.txnTitle}>{t.title}</Text>
            <Text style={[styles.txnAmount, { color: t.amount < 0 ? colors.danger : colors.success }]}>{formatMoney(t.amount, { sign: true })}</Text>
            <Text style={styles.txnDate}>{formatDate(t.date)}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function QuickAction({ testID, title, icon, onPress }: { testID?: string; title: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.8} style={styles.action}>
      <Text style={styles.actionLabel}>{title}</Text>
      <Ionicons name={icon} size={22} color={colors.navy} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hello: { ...type.body, color: colors.textMuted },
  name: { ...type.title, color: colors.text },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...type.label, color: colors.textInverse },
  balanceCard: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  balanceLabel: { ...type.label, color: 'rgba(255,255,255,0.7)' },
  balance: { ...type.display, color: colors.textInverse },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  change: { ...type.label, color: '#5EEAD4' },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: {
    flex: 1,
    flexDirection: 'column-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  actionLabel: { ...type.label, color: colors.text },
  txn: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingVertical: spacing.xs },
  txnTitle: { ...type.body, color: colors.text },
  txnAmount: { ...type.body, fontWeight: '600' },
  txnDate: { ...type.caption, color: colors.textMuted, width: '100%' },
});
