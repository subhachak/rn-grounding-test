// Options rendered from constant lists, and one list that is not constant.
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Card } from '@/components';

const SORT_ORDERS = ['Newest', 'Oldest'] as const;
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
];

export default function StatementsScreen({ accounts }: { accounts: { id: string; name: string }[] }) {
  return (
    <View testID="rx-statements-screen">
      {TABS.map((t) => (
        <TouchableOpacity key={t.id} testID={`rx-statements-tab-${t.id}`} onPress={() => {}}>
          <Text>{t.label}</Text>
        </TouchableOpacity>
      ))}
      {SORT_ORDERS.map((s) => (
        <TouchableOpacity key={s} onPress={() => {}}>
          <Text>{s}</Text>
        </TouchableOpacity>
      ))}
      {accounts.map((a) => (
        <TouchableOpacity key={a.id} onPress={() => {}}>
          <Text>{a.name}</Text>
        </TouchableOpacity>
      ))}
      <Card />
    </View>
  );
}
