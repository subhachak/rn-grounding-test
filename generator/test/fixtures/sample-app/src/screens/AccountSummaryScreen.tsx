// CASE 5: accessibilityLabel present but no testID. A legitimate secondary
// anchor, but worth flagging separately from a "real" testID since it's a
// weaker/less conventional locator strategy on Android vs iOS.
import React from 'react';
import { View, Text } from 'react-native';

export default function AccountSummaryScreen() {
  return (
    <View accessibilityLabel="account-summary-container">
      <Text accessibilityLabel="account-balance-text">$12,340.00</Text>
    </View>
  );
}
