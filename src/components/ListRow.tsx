import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type } from '../theme';

// A tappable row: icon, title, optional subtitle and trailing value.
export function ListRow({
  testID,
  title,
  subtitle,
  value,
  icon,
  iconColor = colors.navy,
  onPress,
}: {
  testID?: string;
  title: string;
  subtitle?: string;
  value?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={[styles.icon, { backgroundColor: `${iconColor}14` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { ...type.body, fontWeight: '600', color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted },
  value: { ...type.body, fontWeight: '600', color: colors.text },
});
