// Plans. Each card's testID is built from the plan's id (plan-card-p1), and
// its status badge depends on that plan's own entitlement: a condition inside
// a list item, not a screen-level flag.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../components/Badge';
import { Screen } from '../components/Screen';
import { PLANS, TOTAL_BALANCE } from '../data/mock';
import { colors, formatMoney, radius, shadow, spacing, type } from '../theme';

export default function PlansScreen({ navigation }: any) {
  return (
    <Screen testID="plans-screen" edges={['top']}>
      <Text style={styles.title}>Plans</Text>
      <Text style={styles.subtitle}>
        {PLANS.length} plans · {formatMoney(TOTAL_BALANCE)} total
      </Text>
      {PLANS.map((plan) => (
        <TouchableOpacity
          key={plan.id}
          testID={`plan-card-${plan.id}`}
          activeOpacity={0.85}
          style={styles.card}
          onPress={() => navigation.navigate('PlanDetails', { planId: plan.id })}
        >
          <View style={styles.cardTop}>
            <View style={styles.icon}>
              <Ionicons name="pie-chart" size={20} color={colors.teal} />
            </View>
            {plan.entitled ? (
              <Badge testID={`plan-card-active-badge-${plan.id}`} title="Active" tone="success" />
            ) : (
              <Badge testID={`plan-card-restricted-badge-${plan.id}`} title="Restricted" tone="warning" />
            )}
          </View>
          <Text testID={`plan-card-name-${plan.id}`} style={styles.name}>
            {plan.name}
          </Text>
          <Text style={styles.kind}>{plan.kind}</Text>
          <View style={styles.cardBottom}>
            <Text style={styles.balance}>{formatMoney(plan.balance)}</Text>
            <Text style={[styles.ytd, { color: plan.ytdReturn >= 0 ? colors.success : colors.danger }]}>
              {plan.ytdReturn >= 0 ? '+' : ''}
              {plan.ytdReturn}% YTD
            </Text>
          </View>
          <View style={styles.allocation}>
            {plan.allocation.map((a) => (
              <View key={a.label} style={{ flex: a.percent, backgroundColor: a.color }} />
            ))}
          </View>
        </TouchableOpacity>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted, marginTop: -spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs, ...shadow },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  name: { ...type.heading, color: colors.text },
  kind: { ...type.caption, color: colors.textMuted },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm },
  balance: { ...type.title, fontSize: 22, color: colors.text },
  ytd: { ...type.label },
  allocation: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: spacing.sm },
});
