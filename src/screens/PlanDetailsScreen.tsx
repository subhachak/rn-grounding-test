// CASE 3: Conditional / persona-gated rendering. Each branch has its OWN
// stable testID, but the branch that mounts depends on entitlement/role.
// This is a "structural variant" problem, not a dynamic-ID problem: static
// extraction finds both IDs fine, live validation is what confirms which
// variant actually renders for a given persona.
import React from 'react';
import { View, Text } from 'react-native';

export default function PlanDetailsScreen({ isEntitled }: { isEntitled: boolean }) {
  return (
    <View testID="plan-details-screen">
      {isEntitled ? (
        <View testID="plan-details-entitled-panel">
          <Text testID="plan-details-contribution-amount">$500</Text>
        </View>
      ) : (
        <View testID="plan-details-restricted-panel">
          <Text testID="plan-details-upgrade-prompt">Upgrade to view details</Text>
        </View>
      )}
    </View>
  );
}
