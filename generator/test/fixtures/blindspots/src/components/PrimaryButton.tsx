import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

export function PrimaryButton({ testID, title, onPress }: { testID?: string; title: string; onPress?: () => void }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
}
