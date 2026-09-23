import React from 'react';
import { Text, View } from 'react-native';
import { IDS, TITLE_ID } from '../ids';
import { PrimaryButton } from '../components/PrimaryButton';
import IconButton from '../components/IconButton';

const LOCAL_ID = 'fx-local';

export function HomeScreen({ items }: { items: { id: string }[] }) {
  return (
    <View testID={IDS.login.submit}>
      <Text testID={LOCAL_ID}>Local</Text>
      <PrimaryButton testID="fx-save" title="Save" onPress={() => {}} />
      <PrimaryButton title="No id" onPress={() => {}} />
      <IconButton testID={`${TITLE_ID}-icon`} />
      {items.map((item) => (
        <Text key={item.id} testID={`${IDS.cancel}-${item.id}`}>{item.id}</Text>
      ))}
    </View>
  );
}

export function SettingsScreen() {
  return <View testID="fx-settings-screen" />;
}
