// CASE 4, but more realistic: a mixed form where SOME fields have IDs and
// SOME don't, which is the actual common failure mode, not usually a whole
// screen with nothing, usually a couple of fields the dev forgot.
import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';

export default function ContributionFormScreen({ navigation }: any) {
  return (
    <View testID="contribution-form-screen">
      <TextInput testID="contribution-amount-input" placeholder="Contribution amount" />
      {/* frequency selector shipped without a testID, common gap */}
      <TextInput placeholder="Frequency (monthly/annual)" />
      <TouchableOpacity testID="contribution-submit-button" onPress={() => navigation.goBack()}>
        <Text>Submit</Text>
      </TouchableOpacity>
      {/* cancel action, also missing, same gap pattern */}
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}
