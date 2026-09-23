// Where each tap goes, from certain to unknown.
import React, { useState } from 'react';
import { View } from 'react-native';
import { PrimaryButton } from '@/components';

const track = () => {};

export default function TransferScreen({ navigation }: any) {
  const [valid] = useState(true);
  // conditional: may not navigate, so the target is unknown
  const submit = () => {
    if (!valid) return;
    navigation.navigate('Settings');
  };
  // a named handler, certain: Main shows Tabs, whose first route is Home
  const home = () => navigation.navigate('Main');
  return (
    <View testID="rx-transfer-screen">
      <PrimaryButton testID="rx-transfer-submit" title="Submit" onPress={submit} />
      <PrimaryButton testID="rx-transfer-home" title="Home" onPress={home} />
      <PrimaryButton testID="rx-transfer-back" title="Back" onPress={() => navigation.goBack()} />
      <PrimaryButton
        testID="rx-transfer-settings"
        title="Settings"
        onPress={() => {
          track();
          navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Settings' }] });
        }}
      />
      <PrimaryButton testID="rx-transfer-either" title="Either" onPress={() => (valid ? navigation.navigate('Settings') : navigation.navigate('Main'))} />
    </View>
  );
}
