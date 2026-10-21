import React from 'react';
import { SquaresGrid, View } from 'sidebet-ui';

const owners = [
  { name: 'Jordan Miles', id: 'user-jordan' },
  { name: 'Sam Rivera', id: 'user-sam' },
  { name: 'Ava Chen', id: 'user-ava' },
  { name: 'Li Wei', id: 'user-li' },
  { name: 'Noah Patel', id: 'user-noah' },
  { name: 'Maria Lopez', id: 'user-maria' },
];

// Deterministic spread of purchased squares (row, col) -> owner.
const buildPurchases = (count: number) => {
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const cell = (i * 37) % 100;
    const owner = owners[(i * 7 + (i >> 2)) % owners.length];
    out.push({
      id: `pur-${i}`, gridRow: Math.floor(cell / 10), gridCol: cell % 10,
      ownerName: owner.name, userId: owner.id,
    });
  }
  return out;
};

const openGame = { id: 'sq-1', status: 'ACTIVE', numbersAssigned: false };
const lockedGame = {
  id: 'sq-2', status: 'LIVE', numbersAssigned: true,
  rowNumbers: [3, 7, 0, 9, 4, 1, 6, 8, 2, 5],
  colNumbers: [8, 2, 5, 0, 7, 3, 9, 1, 6, 4],
};

// The grid sizes its cells from the window width (screen padding 16 in the app);
// the card adds ~24px margins, so reach 16px into them to match the app's room.
const frame = { width: 390, paddingVertical: 8, marginHorizontal: -16 };
const noop = () => {};

export const Selecting = () => (
  <View style={frame}>
    <SquaresGrid
      game={openGame}
      purchases={buildPurchases(38)}
      selectedSquares={[{ row: 0, col: 1 }, { row: 4, col: 5 }, { row: 8, col: 8 }]}
      onSquarePress={noop}
      editable
      currentUserId="user-jordan"
      homeTeamCode="KC"
      awayTeamCode="BUF"
    />
  </View>
);

export const LockedWithNumbers = () => (
  <View style={frame}>
    <SquaresGrid
      game={lockedGame}
      purchases={buildPurchases(100)}
      selectedSquares={[]}
      onSquarePress={noop}
      editable={false}
      currentUserId="user-jordan"
      homeTeamCode="KC"
      awayTeamCode="BUF"
    />
  </View>
);

export const EmptyBoard = () => (
  <View style={frame}>
    <SquaresGrid
      game={openGame}
      purchases={[]}
      selectedSquares={[]}
      onSquarePress={noop}
      editable
      currentUserId="user-jordan"
    />
  </View>
);
