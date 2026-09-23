import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, type } from '../theme';

// testID goes to the action link, the only interactive part.
export function SectionHeader({ testID, title, action, onAction }: { testID?: string; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <TouchableOpacity testID={testID} onPress={onAction}>
          <Text style={styles.action}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.heading, color: colors.text },
  action: { ...type.label, color: colors.blue },
});
