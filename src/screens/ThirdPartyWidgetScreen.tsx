// CASE 6: Wraps a third-party component that doesn't expose a testID prop
// at all. Static extraction can only see what OUR code passes down, it
// can't see inside the vendor component. Worth surfacing as a distinct
// "no control over source" gap, different from case 4 (dev just forgot).
import React from 'react';
import { View } from 'react-native';
// import { VendorDatePicker } from 'third-party-date-picker'; // hypothetical

export default function ThirdPartyWidgetScreen() {
  return (
    <View testID="third-party-widget-screen">
      {/* <VendorDatePicker onChange={() => {}} /> no testID prop supported */}
    </View>
  );
}
