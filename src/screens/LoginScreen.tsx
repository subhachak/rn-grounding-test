// CASE 1: Stable, hand-authored testIDs. This is the easy majority case.
import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';

export default function LoginScreen() {
  return (
    <View testID="login-screen">
      <TextInput testID="login-username-input" placeholder="Username" />
      <TextInput testID="login-password-input" placeholder="Password" secureTextEntry />
      <TouchableOpacity testID="login-enroll-button">
        <Text>Enroll</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="login-submit-button">
        <Text>Log In</Text>
      </TouchableOpacity>
    </View>
  );
}
