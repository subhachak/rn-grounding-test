// Premier upsell, reached from a restricted plan.
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { colors, spacing, type } from '../theme';

const BENEFITS = ['Make and schedule contributions', 'Employer match tracking', 'One-to-one retirement advice', 'Priority support'];

export default function UpgradeScreen({ navigation }: any) {
  return (
    <Screen testID="upgrade-screen">
      <View style={styles.hero}>
        <Ionicons name="diamond" size={36} color={colors.teal} />
        <Text style={styles.title}>Harbor Premier</Text>
        <Text style={styles.price}>$4.99 / month</Text>
      </View>
      <Card>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefit}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </Card>
      <Button
        testID="upgrade-confirm-button"
        title="Upgrade to Premier"
        onPress={() => Alert.alert('Upgrade requested', 'Our team will be in touch (simulated).', [{ text: 'OK', onPress: () => navigation.goBack() }])}
      />
      <Button testID="upgrade-not-now-button" title="Not now" variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  title: { ...type.title, color: colors.text },
  price: { ...type.body, color: colors.textMuted },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitText: { ...type.body, color: colors.text },
});
