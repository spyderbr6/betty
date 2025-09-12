import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MinimalApp() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>SDK 52 Test - Minimal App</Text>
      <Text style={styles.text}>React Native 0.76.9</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
});