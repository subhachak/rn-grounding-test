import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  testID,
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
}: {
  testID?: string;
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
}) {
  const v = VARIANTS[variant];
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.base, { backgroundColor: v.bg, borderColor: v.border }, (disabled || loading) && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          <Text style={[styles.label, { color: v.fg }]}>{title}</Text>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.navy, fg: colors.textInverse, border: colors.navy },
  secondary: { bg: colors.surface, fg: colors.navy, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.blue, border: 'transparent' },
  danger: { bg: colors.dangerBg, fg: colors.danger, border: colors.dangerBg },
};

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...type.body, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
