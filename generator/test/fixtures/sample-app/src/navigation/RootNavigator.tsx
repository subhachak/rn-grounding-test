import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import PlanListScreen from '../screens/PlanListScreen';
import PlanDetailsScreen from '../screens/PlanDetailsScreen';
import ContributionFormScreen from '../screens/ContributionFormScreen';
import ContributionDatePickerScreen from '../screens/ThirdPartyWidgetScreen';
import AccountSummaryScreen from '../screens/AccountSummaryScreen';

export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  PlanList: undefined;
  PlanDetails: { planId: string };
  ContributionForm: undefined;
  ContributionDatePicker: undefined;
  AccountSummary: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: true }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="PlanList" component={PlanListScreen} options={{ title: 'Your Plans' }} />
        <Stack.Screen name="PlanDetails" component={PlanDetailsScreen} options={{ title: 'Plan Details' }} />
        <Stack.Screen name="ContributionForm" component={ContributionFormScreen} options={{ title: 'Contribute' }} />
        <Stack.Screen name="ContributionDatePicker" component={ContributionDatePickerScreen} options={{ title: 'Schedule' }} />
        <Stack.Screen name="AccountSummary" component={AccountSummaryScreen} options={{ title: 'Account' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
