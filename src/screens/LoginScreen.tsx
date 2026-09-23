// Sign in. Two demo personas decide what the rest of the app shows: the
// Premier member (entitled) and the Basic member (restricted).
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { MEMBERS } from '../data/mock';
import { useSession } from '../session';
import { colors, radius, spacing, type } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useSession();
  const username = useRef('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (signIn(username.current)) {
      setError(null);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } else {
      setError("We couldn't find an account with that username.");
    }
  };

  return (
    <View testID="login-screen" style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={[colors.navy, colors.navyLight]} style={styles.hero}>
        <SafeAreaView edges={['top']} style={styles.heroInner}>
          <View style={styles.logo}>
            <Ionicons name="boat" size={28} color={colors.teal} />
          </View>
          <Text style={styles.brand}>Harbor Retirement</Text>
          <Text style={styles.tagline}>Your retirement, in calm waters.</Text>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <Card style={styles.form}>
          <Text style={styles.formTitle}>Sign in</Text>
          <Field
            testID="login-username-input"
            label="Username"
            placeholder="Username"
            icon="person-outline"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(t) => (username.current = t)}
          />
          <Field testID="login-password-input" label="Password" placeholder="Password" icon="lock-closed-outline" secureTextEntry />
          {error ? (
            <Text testID="login-error-text" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Button testID="login-submit-button" title="Log In" onPress={submit} />
          <Button testID="login-enroll-button" title="Enroll" variant="ghost" onPress={() => navigation.navigate('Enroll')} />
        </Card>

        <View style={styles.hint}>
          <Text style={styles.hintTitle}>Demo accounts (any password)</Text>
          {Object.values(MEMBERS).map((m) => (
            <TouchableOpacity key={m.username} testID={`login-demo-${m.username}`} onPress={() => setError(null)} style={styles.hintRow}>
              <Text style={styles.hintUser}>{m.username}</Text>
              <Text style={styles.hintTier}>{m.tier}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { paddingBottom: 72 },
  heroInner: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm },
  logo: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  brand: { ...type.title, color: colors.textInverse },
  tagline: { ...type.body, color: 'rgba(255,255,255,0.75)' },
  body: { flex: 1, paddingHorizontal: spacing.lg, marginTop: -56, gap: spacing.lg },
  form: { gap: spacing.lg },
  formTitle: { ...type.heading, color: colors.text },
  error: { ...type.caption, color: colors.danger, backgroundColor: colors.dangerBg, padding: spacing.sm, borderRadius: radius.sm },
  hint: { gap: spacing.xs, paddingHorizontal: spacing.sm },
  hintTitle: { ...type.label, color: colors.textMuted },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between' },
  hintUser: { ...type.caption, color: colors.text, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  hintTier: { ...type.caption, color: colors.textMuted },
});
