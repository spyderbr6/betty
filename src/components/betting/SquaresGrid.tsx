/**
 * SquaresGrid Component
 *
 * Interactive 10x10 grid for betting squares game.
 * Shows square ownership, allows selection for purchase, displays numbers after lock.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
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
  // Calculate responsive cell size based on screen width
  const screenWidth = Dimensions.get('window').width;
  const PADDING = spacing.md * 2; // Account for screen padding
  const HEADER_SIZE = 24;
  const maxGridWidth = screenWidth - PADDING - HEADER_SIZE - 10; // Extra margin
  const CELL_SIZE = Math.floor(maxGridWidth / 10);

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
      {/* Team Axis Labels (only shown after numbers assigned) */}
      {game.numbersAssigned && (
        <View style={styles.axisLabelsContainer}>
          <Text style={styles.axisLabel}>
            ↓ {homeTeamCode || 'Home'} (Rows)
          </Text>
          <Text style={styles.axisLabel}>
            → {awayTeamCode || 'Away'} (Columns)
          </Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View>
          {/* Column Headers (Away Team Numbers) - shown after lock */}
          {game.numbersAssigned && (
            <View style={styles.columnHeaders}>
              <View style={[styles.cornerCell, { width: HEADER_SIZE, height: HEADER_SIZE }]} />
              {game.colNumbers.map((num: number, col: number) => (
                <View key={col} style={[styles.headerCell, { width: CELL_SIZE, height: HEADER_SIZE }]}>
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
                  <View key={row} style={[styles.rowHeader, { width: HEADER_SIZE, height: CELL_SIZE }]}>
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
                          { width: CELL_SIZE, height: CELL_SIZE },
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
                            <Text style={[styles.ownerName, { fontSize: Math.max(8, CELL_SIZE / 5) }]} numberOfLines={1}>
                              {truncateNameForGrid(cell.owner)}
                            </Text>
                            {isUserBought && <View style={styles.userDot} />}
                          </View>
                        )}
                        {isSelected && (
                          <View style={styles.checkmarkContainer}>
                            <Text style={[styles.checkmark, { fontSize: CELL_SIZE / 2 }]}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.lg,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  axisLabelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  axisLabel: {
    ...textStyles.caption,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.bold,
    textAlign: 'center',
  },
  columnHeaders: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  cornerCell: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  headerCell: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerText: {
    ...textStyles.label,
    fontSize: typography.fontSize.xs,
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
    color: colors.textInverse,
    fontWeight: typography.fontWeight.bold,
  },
});
