// Imports through aliases and barrels, the way production apps do.
import React from 'react';
import { PrimaryButton, Card } from '@/components';
import Plain from '~ui/Card';
import { IDS } from '@ids';

export default function HomeScreen() {
  return (
    <Card testID="rx-home-card">
      <Plain testID="rx-home-plain" />
      <PrimaryButton testID={IDS.home.transfer} title="Transfer" onPress={() => {}} />
      <PrimaryButton title="Pay" onPress={() => {}} />
    </Card>
  );
}
