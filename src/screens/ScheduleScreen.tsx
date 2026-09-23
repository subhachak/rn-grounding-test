// Pick the first contribution date. VENDOR COMPONENT, deliberately: the
// picker is @react-native-community/datetimepicker, whose native internals
// (the iOS wheels, the Android dialog) are invisible to a source scan. Android
// has no inline picker, so there the date is chosen in a dialog.
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { useSession } from '../session';
import { colors, formatDate, type } from '../theme';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ScheduleScreen({ navigation }: any) {
  const { draft, updateDraft } = useSession();
  const today = new Date();

  return (
    <Screen testID="schedule-screen">
      <Card>
        <Text style={styles.label}>First contribution date</Text>
        <Text testID="schedule-selected-date" style={styles.date}>
          {formatDate(isoDay(draft.startDate))}
        </Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker
            testID="schedule-date-picker"
            value={draft.startDate}
            mode="date"
            display="spinner"
            minimumDate={today}
            onChange={(_, d) => d && updateDraft({ startDate: d })}
          />
        ) : (
          <Button
            testID="schedule-open-picker-button"
            title="Choose a date"
            variant="secondary"
            icon="calendar"
            onPress={() =>
              DateTimePickerAndroid.open({ value: draft.startDate, mode: 'date', minimumDate: today, onChange: (_, d) => d && updateDraft({ startDate: d }) })
            }
          />
        )}
      </Card>
      <Button testID="schedule-done-button" title="Done" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textMuted },
  date: { ...type.title, color: colors.text },
});
