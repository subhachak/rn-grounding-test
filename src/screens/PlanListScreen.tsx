// CASE 2: Templated / parameterized dynamic testIDs. Pattern is stable, the
// resolved value depends on the data (item.id) at runtime. Static AST
// extraction should capture the TEMPLATE EXPRESSION, not a literal string.
import React from 'react';
import { View, FlatList, TouchableOpacity, Text } from 'react-native';

const plans = [{ id: 'p1' }, { id: 'p2' }];

export default function PlanListScreen() {
  return (
    <View testID="plan-list-screen">
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity testID={`plan-item-${item.id}`}>
            <Text testID={`plan-item-label-${item.id}`}>{item.id}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
