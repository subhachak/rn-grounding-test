// Profile and settings. The membership badge is persona-gated (isEntitled).
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { useSession } from '../session';
import { colors, spacing, type } from '../theme';

export default function ProfileScreen({ navigation }: any) {
  const { member, isEntitled, signOut } = useSession();
  const [notifications, setNotifications] = useState(true);
  const [biometrics, setBiometrics] = useState(false);

  return (
    <Screen testID="profile-screen" edges={['top']}>
      <Text style={styles.title}>Profile</Text>
      <Card style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{member?.initials}</Text>
        </View>
        <Text testID="profile-name" style={styles.name}>
          {member?.name}
        </Text>
        <Text style={styles.since}>Member since {member?.memberSince}</Text>
        {isEntitled ? (
          <Badge testID="profile-premier-badge" title="Premier member" tone="success" style={styles.badge} />
        ) : (
          <Badge testID="profile-basic-badge" title="Basic member" tone="neutral" style={styles.badge} />
        )}
      </Card>

      <Card>
        <ListRow testID="profile-documents-row" title="Statements & documents" icon="document-text" onPress={() => navigation.navigate('Documents')} />
        <ListRow testID="profile-help-row" title="Help & support" icon="help-buoy" onPress={() => Alert.alert('Help & support', 'Call 1-800-555-0100, 8am to 8pm ET.')} />
      </Card>

      <Card>
        <View style={styles.setting}>
          <Text style={styles.settingLabel}>Push notifications</Text>
          <Switch testID="profile-notifications-switch" value={notifications} onValueChange={setNotifications} trackColor={{ true: colors.teal }} />
        </View>
        <View style={styles.setting}>
          <Text style={styles.settingLabel}>Sign in with Face ID</Text>
          <Switch testID="profile-biometrics-switch" value={biometrics} onValueChange={setBiometrics} trackColor={{ true: colors.teal }} />
        </View>
      </Card>

      <Button
        testID="profile-sign-out-button"
        title="Sign out"
        variant="danger"
        icon="log-out-outline"
        onPress={() => {
          signOut();
          navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Login' }] });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  identity: { alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...type.title, color: colors.textInverse },
  name: { ...type.heading, color: colors.text },
  since: { ...type.caption, color: colors.textMuted, marginTop: -spacing.sm },
  badge: { alignSelf: 'center' },
  setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { ...type.body, color: colors.text },
});
