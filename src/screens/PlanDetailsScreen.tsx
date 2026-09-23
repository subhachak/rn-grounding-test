// Plan details. Persona-gated: a Premier member (isEntitled) sees the
// contribution panel; a Basic member sees an upgrade prompt instead. Both
// panels are in the source; which one mounts depends on who signed in.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { PLANS } from '../data/mock';
import { useSession } from '../session';
import { colors, formatMoney, radius, spacing, type } from '../theme';

export default function PlanDetailsScreen({ navigation, route }: any) {
  const { isEntitled, updateDraft } = useSession();
  const plan = PLANS.find((p) => p.id === route.params?.planId) ?? PLANS[0];

  return (
    <Screen testID="plan-details-screen">
      <LinearGradient colors={[colors.navy, colors.navyLight]} style={styles.hero}>
        <Text style={styles.kind}>{plan.kind}</Text>
        <Text testID="plan-details-name" style={styles.name}>
          {plan.name}
        </Text>
        <Text testID="plan-details-balance" style={styles.balance}>
          {formatMoney(plan.balance)}
        </Text>
        <Text style={styles.ytd}>
          {plan.ytdReturn >= 0 ? '+' : ''}
          {plan.ytdReturn}% year to date
        </Text>
      </LinearGradient>

      <Card>
        <Text style={styles.section}>Allocation</Text>
        {plan.allocation.map((a) => (
          <View key={a.label} style={styles.allocRow}>
            <View style={[styles.dot, { backgroundColor: a.color }]} />
            <Text style={styles.allocLabel}>{a.label}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${a.percent}%`, backgroundColor: a.color }]} />
            </View>
            <Text style={styles.percent}>{a.percent}%</Text>
          </View>
        ))}
      </Card>

      {isEntitled ? (
        <Card testID="plan-details-entitled-panel">
          <Text style={styles.section}>Contributions</Text>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Your monthly contribution</Text>
            <Text testID="plan-details-contribution-amount" style={styles.statValue}>
              $500.00
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Employer match</Text>
            <Text style={styles.statValue}>50% up to 6%</Text>
          </View>
          <Button
            testID="plan-details-contribute-button"
            title="Make a contribution"
            icon="arrow-forward"
            onPress={() => {
              updateDraft({ planId: plan.id });
              navigation.navigate('Contribute');
            }}
          />
        </Card>
      ) : (
        <Card testID="plan-details-restricted-panel" style={styles.restricted}>
          <View style={styles.lock}>
            <Ionicons name="lock-closed" size={22} color={colors.warning} />
          </View>
          <Text testID="plan-details-upgrade-prompt" style={styles.upgradeText}>
            Upgrade to Premier to manage contributions
          </Text>
          <Text style={styles.upgradeHint}>Basic members can view balances. Premier adds contributions, employer match, and advice.</Text>
          <Button testID="plan-details-upgrade-button" title="See Premier benefits" variant="secondary" onPress={() => navigation.navigate('Upgrade')} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xs },
  kind: { ...type.label, color: 'rgba(255,255,255,0.7)' },
  name: { ...type.title, color: colors.textInverse },
  balance: { ...type.display, color: colors.textInverse, marginTop: spacing.sm },
  ytd: { ...type.label, color: '#5EEAD4' },
  section: { ...type.heading, color: colors.text },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  allocLabel: { ...type.body, color: colors.text, width: 110 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: '100%' },
  percent: { ...type.label, color: colors.textMuted, width: 40, textAlign: 'right' },
  stat: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { ...type.body, color: colors.textMuted },
  statValue: { ...type.body, fontWeight: '700', color: colors.text },
  restricted: { alignItems: 'flex-start', backgroundColor: '#FFFBEB' },
  lock: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' },
  upgradeText: { ...type.heading, color: colors.text },
  upgradeHint: { ...type.body, color: colors.textMuted },
});
