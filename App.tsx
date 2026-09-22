// Entry point stub, wires the test screens together so this reads as a real
// (if minimal) RN app rather than a loose folder of components. Not meant
// to be run on a device/simulator, this repo exists to test the static
// grounding script against representative source patterns.
import React from 'react';
import LoginScreen from './src/screens/LoginScreen';
import PlanListScreen from './src/screens/PlanListScreen';
import PlanDetailsScreen from './src/screens/PlanDetailsScreen';
import ContributionFormScreen from './src/screens/ContributionFormScreen';
import AccountSummaryScreen from './src/screens/AccountSummaryScreen';
import ThirdPartyWidgetScreen from './src/screens/ThirdPartyWidgetScreen';

export default function App() {
  return null; // navigation wiring omitted, not relevant to the grounding test
}

export {
  LoginScreen,
  PlanListScreen,
  PlanDetailsScreen,
  ContributionFormScreen,
  AccountSummaryScreen,
  ThirdPartyWidgetScreen,
};
