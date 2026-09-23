import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

// Every screen's root: background, safe area, and scrolling. The testID
// lands on the root View, which identifies the screen.
export function Screen({
  testID,
  children,
  scroll = true,
  edges = [],
  style,
}: {
  testID?: string;
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
}) {
  return (
    <View testID={testID} style={styles.root}>
      <SafeAreaView edges={edges} style={styles.root}>
        {scroll ? (
          <ScrollView contentContainerStyle={[styles.content, style]} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.fill, style]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  fill: { flex: 1 },
});
