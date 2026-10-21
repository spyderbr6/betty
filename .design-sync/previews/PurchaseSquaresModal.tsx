import React from 'react';
import { PurchaseSquaresModal } from 'sidebet-ui';

const game = { id: 'sq-1', title: 'Sunday Night Football Squares', status: 'ACTIVE', pricePerSquare: 10 };
const noop = () => {};
const confirm = async () => {};

export const ForYourself = () => (
  <PurchaseSquaresModal
    visible
    onClose={noop}
    game={game}
    selectedSquares={[{ row: 0, col: 1 }, { row: 4, col: 5 }, { row: 8, col: 8 }]}
    onConfirmPurchase={confirm}
    userDisplayName="Jordan Miles"
  />
);

export const NameRequired = () => (
  <PurchaseSquaresModal
    visible
    onClose={noop}
    game={{ ...game, pricePerSquare: 25 }}
    selectedSquares={[{ row: 2, col: 7 }]}
    onConfirmPurchase={confirm}
  />
);
