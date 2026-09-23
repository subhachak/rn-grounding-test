// Make a contribution. Persona-gated: Basic members see the Premier upsell.
// GAPS, deliberately: the frequency options have no testID (and their label
// is a variable, so there is no visible text to fall back on), and neither
// does the Cancel button (whose "Cancel" text a fallback can use).
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { PLANS } from '../data/mock';
import { useSession, type Frequency } from '../session';
import { colors, formatDate, formatMoney, radius, spacing, type } from '../theme';

const QUICK_AMOUNTS = [
  { id: '100', value: 100 },
  { id: '250', value: 250 },
  { id: '500', value: 500 },
];
const FREQUENCIES: Frequency[] = ['One-time', 'Monthly', 'Quarterly'];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ContributeScreen({ navigation }: any) {
  const { isEntitled, draft, updateDraft } = useSession();
  const [amountKey, setAmountKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const eligible = PLANS.filter((p) => p.entitled);
  const plan = eligible.find((p) => p.id === draft.planId) ?? eligible[0];
  const amount = Number(draft.amount);

  const submit = () => {
    if (!(amount > 0)) {
      setError('Enter an amount greater than $0.');
      return;
    }
    setError(null);
    navigation.replace('ContributionConfirmation');
  };

  return (
    <Screen testID="contribute-screen">
      {isEntitled ? (
        <View testID="contribute-form" style={styles.form}>
          <Card>
            <Text style={styles.section}>Plan</Text>
            <View style={styles.chips}>
              {eligible.map((p) => (
                <Chip key={p.id} testID={`contribute-plan-${p.id}`} title={p.name} selected={p.id === plan.id} onPress={() => updateDraft({ planId: p.id })} />
              ))}
            </View>
          </Card>

          <Card>
            <Field
              key={amountKey}
              testID="contribute-amount-input"
              label="Amount"
              placeholder="0.00"
              prefix="$"
              keyboardType="decimal-pad"
              defaultValue={draft.amount}
              onChangeText={(t) => updateDraft({ amount: t })}
            />
            <View style={styles.chips}>
              {QUICK_AMOUNTS.map((q) => (
                <Chip
                  key={q.id}
                  testID={`contribute-quick-amount-${q.id}`}
                  title={formatMoney(q.value)}
                  selected={amount === q.value}
                  onPress={() => {
                    updateDraft({ amount: String(q.value) });
                    setAmountKey((k) => k + 1);
                  }}
                />
              ))}
            </View>
            <Text style={styles.section}>Frequency</Text>
            <View style={styles.segment}>
              {FREQUENCIES.map((f) => (
                <TouchableOpacity key={f} onPress={() => updateDraft({ frequency: f })} style={[styles.segmentItem, draft.frequency === f && styles.segmentOn]}>
                  <Text style={[styles.segmentText, draft.frequency === f && styles.segmentTextOn]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ListRow
              testID="contribute-start-date-row"
              title="First contribution"
              value={formatDate(isoDay(draft.startDate))}
              icon="calendar"
              iconColor={colors.blue}
              onPress={() => navigation.navigate('Schedule')}
            />
          </Card>

          <Card style={styles.summary}>
            <Ionicons name="information-circle" size={20} color={colors.blue} />
            <Text testID="contribute-summary-text" style={styles.summaryText}>
              {amount > 0
                ? `${formatMoney(amount)} ${draft.frequency.toLowerCase()} to ${plan.name}, starting ${formatDate(isoDay(draft.startDate))}.`
                : 'Choose an amount to see your contribution summary.'}
            </Text>
          </Card>

          {error ? (
            <Text testID="contribute-error-text" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button testID="contribute-submit-button" title="Submit contribution" onPress={submit} />
          <Button title="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      ) : (
        <Card testID="contribute-locked-panel" style={styles.locked}>
          <Ionicons name="lock-closed" size={28} color={colors.warning} />
          <Text testID="contribute-locked-text" style={styles.lockedTitle}>
            Contributions are a Premier feature
          </Text>
          <Text style={styles.lockedHint}>Upgrade to make one-time and recurring contributions from the app.</Text>
          <Button testID="contribute-upgrade-button" title="See Premier benefits" variant="secondary" onPress={() => navigation.navigate('Upgrade')} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  section: { ...type.label, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { ...type.label, color: colors.textMuted },
  segmentTextOn: { color: colors.navy },
  summary: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EFF6FF' },
  summaryText: { ...type.body, color: colors.text, flex: 1 },
  error: { ...type.caption, color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.sm, borderRadius: radius.sm },
  locked: { alignItems: 'center', backgroundColor: '#FFFBEB' },
  lockedTitle: { ...type.heading, color: colors.text, textAlign: 'center' },
  lockedHint: { ...type.body, color: colors.textMuted, textAlign: 'center' },
});
