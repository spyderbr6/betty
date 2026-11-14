/**
 * Every friend, for inviting beyond the ones shown in the row. Follows MODAL_STANDARDS.md.
 */

import React, { useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalHeader } from '../ui/ModalHeader';
import { colors, commonStyles, spacing, textStyles } from '../../styles';
import type { User } from '../../types/betting';
import { Avatar } from './FriendAvatars';
import { friendName } from '../../services/createBetFlowLogic';

interface FriendPickerModalProps {
  visible: boolean;
  onClose: () => void;
  friends: User[];
  atGame: Set<string>;
  selected: Set<string>;
  onToggle: (friendId: string) => void;
}

export const FriendPickerModal: React.FC<FriendPickerModalProps> = ({ visible, onClose, friends, atGame, selected, onToggle }) => {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? friends.filter((friend) => friendName(friend).toLowerCase().includes(q)) : friends;
  }, [friends, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ModalHeader title="Invite friends" onClose={onClose} />
        <TextInput
          testID="create-friend-search"
          style={styles.search}
          placeholder="Search friends"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search friends"
        />
        <FlatList
          data={shown}
          keyExtractor={(friend) => friend.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            const name = friendName(item);
            return (
              <TouchableOpacity
                testID={`create-friend-list-${item.id}`}
                style={styles.row}
                onPress={() => onToggle(item.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
              >
                <Avatar name={name} pictureUrl={item.profilePictureUrl} selected={isSelected} size={spacing[10]} />
                <View style={styles.rowText}>
                  <Text style={styles.name}>{name}</Text>
                  {atGame.has(item.id) && <Text style={styles.atGame}>At the game</Text>}
                </View>
                <Text style={styles.state}>{isSelected ? 'Invited' : 'Invite'}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No friends match.</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.safeArea,
  },
  search: {
    ...commonStyles.textInput,
    textAlignVertical: 'center',
    margin: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  rowText: {
    flex: 1,
    marginLeft: spacing.padding.sm,
  },
  name: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  atGame: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  state: {
    ...textStyles.label,
    color: colors.textSecondary,
  },
  empty: {
    ...textStyles.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
