import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme';

// Labelled text input. Uncontrolled on purpose: a controlled value re-renders
// mid-typing and fast input (e.g. test automation) lands characters out of
// order.
export function Field({
  testID,
  label,
  icon,
  prefix,
  ...input
}: {
  testID?: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  prefix?: string;
} & Omit<TextInputProps, 'testID' | 'style'>) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.box}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} /> : null}
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput testID={testID} placeholderTextColor="#94A3B8" style={styles.input} {...input} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...type.label, color: colors.textMuted },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  prefix: { ...type.heading, color: colors.text },
  input: { flex: 1, ...type.body, color: colors.text, paddingVertical: spacing.md },
});
