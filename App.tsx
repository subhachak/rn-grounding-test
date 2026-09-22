import React from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import { SessionProvider } from './src/session';

export default function App() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
