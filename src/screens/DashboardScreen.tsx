// A realistic landing screen after login, mixes stable IDs with a couple of
// nav targets. Nothing exotic here, just fills out the app so navigation
// has somewhere real to go.
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';

export default function DashboardScreen({ navigation }: any) {
  return (
    <View testID="dashboard-screen">
      <Text testID="dashboard-welcome-text">Welcome back</Text>
      <TouchableOpacity
        testID="dashboard-view-plans-button"
        onPress={() => navigation.navigate('PlanList')}
      >
        <Text>View Plans</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="dashboard-view-account-button"
        onPress={() => navigation.navigate('AccountSummary')}
      >
        <Text>Account Summary</Text>
      </TouchableOpacity>
    </View>
  );
}
