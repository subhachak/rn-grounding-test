// CASE 6: contribution date picker built on a vendor component
// (@react-native-community/datetimepicker). Static extraction sees the testID
// we pass to it, but never its internals (the native spinner wheels); a
// vendor adapter in the test layer knows how to operate those.
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function ContributionDatePickerScreen() {
  const [date, setDate] = useState(() => new Date());
  return (
    <View testID="contribution-date-picker-screen">
      <Text testID="contribution-date-picker-label">Select contribution date</Text>
      <DateTimePicker
        testID="contribution-date-picker"
        value={date}
        mode="date"
        display="spinner"
        onChange={(_, selected) => selected && setDate(selected)}
      />
      <Text testID="contribution-date-picker-value">{isoDate(date)}</Text>
    </View>
  );
}
