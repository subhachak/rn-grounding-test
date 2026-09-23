// Imports through aliases and barrels, the way production apps do.
import React from 'react';
import { PrimaryButton, Card } from '@/components';
import Plain from '~ui/Card';
import { IDS } from '@ids';

export default function HomeScreen({ navigation }: { navigation?: any }) {
  return (
    <Card testID="rx-home-card">
      <Plain testID="rx-home-plain" />
      <PrimaryButton testID={IDS.home.transfer} title="Transfer" onPress={() => {}} />
      <PrimaryButton title="Pay" onPress={() => {}} />
      <PrimaryButton testID="rx-home-open-transfer" title="New transfer" onPress={() => navigation.navigate('Transfer')} />
    </Card>
  );
}
