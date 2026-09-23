// Statements and documents. WEAK LOCATORS, deliberately: rows carry only an
// accessibilityLabel, no testID. They work, but a label is user-facing copy
// that gets reworded and localized.
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { DOCUMENTS } from '../data/mock';
import { colors, radius, spacing, type } from '../theme';

export default function DocumentsScreen() {
  return (
    <Screen testID="documents-screen">
      <Text style={styles.intro}>Statements are available for the last three years.</Text>
      <Card>
        {DOCUMENTS.map((d) => (
          <TouchableOpacity
            key={d.id}
            accessibilityLabel={`${d.title} ${d.period}`}
            onPress={() => Alert.alert(d.title, `Opening ${d.period} (simulated).`)}
            style={styles.row}
          >
            <View style={styles.icon}>
              <Ionicons name="document-text" size={20} color={colors.blue} />
            </View>
            <View style={styles.text}>
              <Text style={styles.title}>{d.title}</Text>
              <Text style={styles.period}>{d.period}</Text>
            </View>
            <Ionicons name="download-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { ...type.body, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { ...type.body, fontWeight: '600', color: colors.text },
  period: { ...type.caption, color: colors.textMuted },
});
