// CASE 4: Missing IDs entirely. No testID, no accessibilityLabel, nothing.
// Static extraction correctly finds NOTHING here, this should surface as a
// "testability gap" rather than fail silently.
import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';

export default function ContributionFormScreen() {
  return (
    <View>
      <TextInput placeholder="Contribution amount" />
      <TouchableOpacity>
        <Text>Submit</Text>
      </TouchableOpacity>
    </View>
  );
}
