// Enrollment (simulated). GAP, deliberately: the date-of-birth field has no
// testID, the kind a developer forgets.
import React from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Screen } from '../components/Screen';
import { colors, radius, spacing, type } from '../theme';

export default function EnrollScreen({ navigation }: any) {
  return (
    <Screen testID="enroll-screen">
      <Text style={styles.intro}>Open a Harbor Retirement account in a couple of minutes.</Text>
      <Card>
        <Field testID="enroll-name-input" label="Full name" placeholder="Full name" icon="person-outline" />
        <Field testID="enroll-email-input" label="Email" placeholder="Email address" icon="mail-outline" keyboardType="email-address" autoCapitalize="none" />
        <View style={styles.dob}>
          <Text style={styles.label}>Date of birth</Text>
          <TextInput placeholder="MM / DD / YYYY" placeholderTextColor="#94A3B8" style={styles.dobInput} />
        </View>
        <Field testID="enroll-password-input" label="Create a password" placeholder="Create a password" icon="lock-closed-outline" secureTextEntry />
      </Card>
      <Button
        testID="enroll-submit-button"
        title="Create account"
        onPress={() => Alert.alert('Enrollment is simulated', 'Sign in with one of the demo accounts.', [{ text: 'OK', onPress: () => navigation.goBack() }])}
      />
      <Button testID="enroll-back-button" title="Back to sign in" variant="ghost" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, color: colors.textMuted },
  dob: { gap: spacing.xs },
  label: { ...type.label, color: colors.textMuted },
  dobInput: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, ...type.body, color: colors.text },
});
