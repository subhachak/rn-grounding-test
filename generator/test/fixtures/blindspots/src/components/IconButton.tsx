import React from 'react';
import { PrimaryButton } from './PrimaryButton';

export default function IconButton(props: { testID?: string }) {
  return <PrimaryButton testID={props.testID} title="Icon" />;
}
