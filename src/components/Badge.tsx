import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, radius, type } from '../theme';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function Badge({ testID, title, tone = 'neutral', style }: { testID?: string; title: string; tone?: Tone; style?: StyleProp<TextStyle> }) {
  const t = TONES[tone];
  return (
    <Text testID={testID} style={[styles.badge, { color: t.fg, backgroundColor: t.bg }, style]}>
      {title}
    </Text>
  );
}

const TONES: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  neutral: { fg: colors.textMuted, bg: colors.surfaceMuted },
  info: { fg: colors.blue, bg: '#DBEAFE' },
};

const styles = StyleSheet.create({
  badge: { ...type.label, fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, overflow: 'hidden', alignSelf: 'flex-start' },
});
