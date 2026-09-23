import React from 'react';
import { View } from 'react-native';

export default function Card({ testID, children }: { testID?: string; children?: React.ReactNode }) {
  return <View testID={testID}>{children}</View>;
}
