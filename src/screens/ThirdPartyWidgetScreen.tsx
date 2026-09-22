// CASE 6: contribution date picker built on a vendor component that
// doesn't expose a testID prop. Static extraction only ever sees our own
// wrapper, never what's inside the dependency.
import React from 'react';
import { View, Text } from 'react-native';
// import DatePicker from 'react-native-date-picker'; // hypothetical vendor lib

export default function ContributionDatePickerScreen() {
  return (
    <View testID="contribution-date-picker-screen">
      <Text testID="contribution-date-picker-label">Select contribution date</Text>
      {/* <DatePicker date={new Date()} onDateChange={() => {}} />
          vendor component, no testID prop supported, invisible to AST scan */}
    </View>
  );
}
