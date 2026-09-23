import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, type } from '../theme';

// A small bar chart drawn with Views (no chart library): the last bar is
// highlighted as the current month.
export function BarChart({ values, labels, color = 'rgba(255,255,255,0.35)', highlight = '#5EEAD4', labelColor = 'rgba(255,255,255,0.7)' }: {
  values: number[];
  labels: string[];
  color?: string;
  highlight?: string;
  labelColor?: string;
}) {
  const min = Math.min(...values) * 0.97;
  const max = Math.max(...values);
  return (
    <View style={styles.row}>
      {values.map((v, i) => (
        <View key={labels[i]} style={styles.col}>
          <View style={styles.track}>
            <View style={[styles.bar, { height: `${((v - min) / (max - min || 1)) * 80 + 20}%`, backgroundColor: i === values.length - 1 ? highlight : color }]} />
          </View>
          <Text style={[styles.label, { color: labelColor }]}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 90 },
  col: { flex: 1, alignItems: 'center', gap: spacing.xs, height: '100%' },
  track: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6 },
  label: { ...type.caption, fontSize: 11 },
});
