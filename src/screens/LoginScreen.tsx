// CASE 1: Stable, hand-authored testIDs. This is the easy majority case.
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { useSession } from '../session';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useSession();
  const [username, setUsername] = useState('');
  return (
    <View testID="login-screen">
      <TextInput
        testID="login-username-input"
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
        // Uncontrolled on purpose: with value={username}, re-renders during
        // fast input (XCUITest) reordered characters ("mer.restrictedmbe"),
        // signing in the wrong persona.
        onChangeText={setUsername}
      />
      <TextInput testID="login-password-input" placeholder="Password" secureTextEntry />
      <TouchableOpacity testID="login-enroll-button">
        <Text>Enroll</Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID="login-submit-button"
        onPress={() => {
          signIn(username);
          navigation.navigate('Dashboard');
        }}
      >
        <Text>Log In</Text>
      </TouchableOpacity>
    </View>
  );
}
