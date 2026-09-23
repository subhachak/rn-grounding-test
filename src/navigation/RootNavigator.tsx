import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import ActivityScreen from '../screens/ActivityScreen';
import ContributeScreen from '../screens/ContributeScreen';
import ContributionConfirmationScreen from '../screens/ContributionConfirmationScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import EnrollScreen from '../screens/EnrollScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import PlanDetailsScreen from '../screens/PlanDetailsScreen';
import PlansScreen from '../screens/PlansScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import UpgradeScreen from '../screens/UpgradeScreen';
import { colors } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home: ['home', 'home-outline'],
  Plans: ['pie-chart', 'pie-chart-outline'],
  Activity: ['pulse', 'pulse-outline'],
  Profile: ['person-circle', 'person-circle-outline'],
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarIcon: ({ focused, color, size }) => <Ionicons name={TAB_ICONS[route.name][focused ? 0 : 1]} size={size} color={color} />,
        tabBarButtonTestID: `tab-${route.name.toLowerCase()}`,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Plans" component={PlansScreen} />
      <Tab.Screen name="Activity" component={ActivityScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, primary: colors.navy } };

export default function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          // Light header: iOS 26+ draws the back button on a light glass
          // bubble whatever the tint, which read poorly on navy.
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.navy,
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '600' },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Enroll" component={EnrollScreen} options={{ title: 'Create your account' }} />
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="PlanDetails" component={PlanDetailsScreen} options={{ title: 'Plan details' }} />
        <Stack.Screen name="Contribute" component={ContributeScreen} options={{ title: 'Make a contribution' }} />
        <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ title: 'Schedule' }} />
        <Stack.Screen name="ContributionConfirmation" component={ContributionConfirmationScreen} options={{ title: 'Confirmation', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Statements & documents' }} />
        <Stack.Screen name="Upgrade" component={UpgradeScreen} options={{ title: 'Premier', presentation: 'modal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
