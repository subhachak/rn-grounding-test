// Confirmation after submitting a contribution.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { PLANS } from '../data/mock';
import { useSession } from '../session';
import { colors, formatDate, formatMoney, spacing, type } from '../theme';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ContributionConfirmationScreen({ navigation }: any) {
  const { draft, updateDraft } = useSession();
  const plan = PLANS.find((p) => p.id === draft.planId) ?? PLANS[0];
  const reference = `HR-${isoDay(draft.startDate).replace(/-/g, '')}-${plan.id.toUpperCase()}`;

  return (
    <Screen testID="confirmation-screen">
      <View style={styles.hero}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={40} color={colors.textInverse} />
        </View>
        <Text testID="confirmation-title" style={styles.title}>
          Contribution scheduled
        </Text>
        <Text style={styles.subtitle}>We'll email you a receipt.</Text>
      </View>
      <Card>
        <Row label="Amount" value={formatMoney(Number(draft.amount))} />
        <Row label="Frequency" value={draft.frequency} />
        <Row label="Plan" value={plan.name} />
        <Row label="Starts" value={formatDate(isoDay(draft.startDate))} />
        <Row label="Reference" value={reference} testID="confirmation-reference" />
      </Card>
      <Button
        testID="confirmation-done-button"
        title="Done"
        onPress={() => {
          updateDraft({ amount: '' });
          navigation.goBack();
        }}
      />
    </Screen>
  );
}

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text testID={testID} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  check: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...type.body, color: colors.textMuted },
  value: { ...type.body, fontWeight: '600', color: colors.text },
});
