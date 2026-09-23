// CASE 2 + CASE 7: templated dynamic IDs, now combined with a nested
// conditional INSIDE the list item (case 3's pattern nested inside case 2's
// pattern). This is closer to what a real plan list probably looks like:
// each row has a stable-pattern ID, but which sub-branch renders depends on
// that specific plan's entitlement, not a screen-level flag.
import React from 'react';
import { View, FlatList, TouchableOpacity, Text } from 'react-native';

const plans = [
  { id: 'p1', entitled: true },
  { id: 'p2', entitled: false },
];

export default function PlanListScreen({ navigation }: any) {
  return (
    <View testID="plan-list-screen">
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`plan-item-${item.id}`}
            onPress={() => navigation.navigate('PlanDetails', { planId: item.id })}
          >
            <Text testID={`plan-item-label-${item.id}`}>{item.id}</Text>
            {item.entitled ? (
              <Text testID={`plan-item-entitled-badge-${item.id}`}>Active</Text>
            ) : (
              <Text testID={`plan-item-restricted-badge-${item.id}`}>Restricted</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
