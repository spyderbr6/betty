import React from 'react';
import { CreateSquaresForm, View } from 'sidebet-ui';

// The form takes no data props: it starts with no event picked, $10.00 per
// square and the default 15/25/15/45 payout split. Friends load from AWS, which
// is not configured on the canvas, so the invite list is empty. The form is a
// full-height ScrollView, so it is framed as one phone screenful (the sections
// have their own padding, as on the Create screen).

const noop = () => {};

export const Default = () => (
  <View style={{ width: 390, height: 680 }}>
    <CreateSquaresForm onSuccess={noop} onCancel={noop} />
  </View>
);
