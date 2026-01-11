/**
 * SquaresGrid Component
 *
 * Interactive 10x10 grid for betting squares game.
 * Shows square ownership, allows selection for purchase, displays numbers after lock.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, textStyles } from '../../styles';

interface SquaresGridProps {
  game: any; // SquaresGame
  purchases: any[]; // SquaresPurchase[]
  selectedSquares: Array<{ row: number; col: number }>;
  onSquarePress: (row: number, col: number) => void;
  editable: boolean;
  currentUserId?: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
}

export const SquaresGrid: React.FC<SquaresGridProps> = ({
  game,
  purchases,
  selectedSquares,
  onSquarePress,
  editable,
  currentUserId,
  homeTeamCode,
  awayTeamCode,
}) => {
  // Create 10x10 grid with ownership data
  const gridData = useMemo(() => {
    const grid: Array<Array<any>> = Array(10)
      .fill(null)
      .map(() => Array(10).fill(null));

    purchases.forEach((purchase) => {
      grid[purchase.gridRow][purchase.gridCol] = {
        purchase,
        owner: purchase.ownerName,
        isUserBought: purchase.userId === currentUserId,
      };
    });

    return grid;
  }, [purchases, currentUserId]);

  // Check if square is selected
  const isSquareSelected = (row: number, col: number): boolean => {
    return selectedSquares.some((s) => s.row === row && s.col === col);
  };

  // Truncate name to fit in small square
  const truncateNameForGrid = (name: string): string => {
    if (name.length <= 6) return name;

    const parts = name.split(' ');
    if (parts.length > 1) {
      // "John Smith" → "J.S."
      return parts.map((p) => p[0]).join('.') + '.';
    }

    // "Christopher" → "Chris"
    return name.slice(0, 5);
  };

  return (
    <View style={styles.container}>
      {/* Column Headers (Away Team Numbers) - shown after lock */}
      {game.numbersAssigned && (
        <View style={styles.columnHeaders}>
          <View style={styles.cornerCell}>
            <Text style={styles.cornerText}>{awayTeamCode || 'Away'}</Text>
          </View>
          {game.colNumbers.map((num: number, col: number) => (
            <View key={col} style={styles.headerCell}>
              <Text style={styles.headerText}>{num}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Grid Rows */}
      <View style={styles.gridRows}>
        {/* Row Headers (Home Team) - shown after lock */}
        {game.numbersAssigned && (
          <View style={styles.rowHeadersContainer}>
            {game.rowNumbers.map((num: number, row: number) => (
              <View key={row} style={styles.rowHeader}>
                <Text style={styles.headerText}>{num}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Grid Cells */}
        <View style={styles.gridContainer}>
          {gridData.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gridRow}>
              {row.map((cell, colIndex) => {
                const isAvailable = cell === null;
                const isSelected = isSquareSelected(rowIndex, colIndex);
                const isUserBought = cell?.isUserBought || false;

                return (
                  <TouchableOpacity
                    key={colIndex}
                    style={[
                      styles.gridCell,
                      isAvailable && styles.availableCell,
                      isSelected && styles.selectedCell,
                      isUserBought && styles.userBoughtCell,
                      !editable && styles.disabledCell,
                    ]}
                    onPress={() => editable && isAvailable && onSquarePress(rowIndex, colIndex)}
                    disabled={!editable || !isAvailable}
                    activeOpacity={editable && isAvailable ? 0.7 : 1}
                  >
                    {!isAvailable && (
                      <View style={styles.cellContent}>
                        <Text style={styles.ownerName} numberOfLines={1}>
                          {truncateNameForGrid(cell.owner)}
                        </Text>
                        {isUserBought && <View style={styles.userDot} />}
                      </View>
                    )}
                    {isSelected && (
                      <View style={styles.checkmarkContainer}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Home Team Label (Vertical) */}
      {game.numbersAssigned && (
        <View style={styles.homeTeamLabelContainer}>
          <Text style={styles.homeTeamLabel}>{homeTeamCode || 'Home'}</Text>
        </View>
      )}
    </View>
  );
};

const CELL_SIZE = 35;
const HEADER_SIZE = 30;

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    marginVertical: spacing.lg,
  },
  columnHeaders: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  cornerCell: {
    width: HEADER_SIZE,
    height: HEADER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  cornerText: {
    ...textStyles.caption,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
  headerCell: {
    width: CELL_SIZE,
    height: HEADER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: {
    ...textStyles.label,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
  },
  gridRows: {
    flexDirection: 'row',
  },
  rowHeadersContainer: {
    marginRight: 0,
  },
  rowHeader: {
    width: HEADER_SIZE,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gridContainer: {
    // Grid cells container
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    position: 'relative',
  },
  availableCell: {
    backgroundColor: colors.success + '15', // 15% opacity green
  },
  selectedCell: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  userBoughtCell: {
    backgroundColor: colors.secondary + '30', // 30% opacity
    borderColor: colors.secondary,
    borderWidth: 1.5,
  },
  disabledCell: {
    opacity: 0.8,
  },
  cellContent: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  ownerName: {
    fontSize: typography.fontSize.xs,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
    includeFontPadding: false, // Android-specific
  },
  userDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: typography.fontSize.xl,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
  homeTeamLabelContainer: {
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  homeTeamLabel: {
    ...textStyles.caption,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
  },
});
