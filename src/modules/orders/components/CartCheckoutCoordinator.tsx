"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type LineFlusher = () => Promise<boolean>;

type CartCheckoutCoordinatorValue = {
  hasPendingMutations: boolean;
  flushPendingMutations: () => Promise<void>;
  registerLineFlusher: (itemId: string, flusher: LineFlusher) => () => void;
  trackMutation: (mutation: Promise<boolean>) => Promise<boolean>;
};

const defaultValue: CartCheckoutCoordinatorValue = {
  hasPendingMutations: false,
  flushPendingMutations: async () => undefined,
  registerLineFlusher: () => () => undefined,
  trackMutation: (mutation) => mutation,
};

const CartCheckoutCoordinatorContext =
  createContext<CartCheckoutCoordinatorValue>(defaultValue);

export function CartCheckoutCoordinator({
  children,
}: {
  children: React.ReactNode;
}) {
  const flushers = useRef(new Map<string, LineFlusher>());
  const pending = useRef(new Set<Promise<boolean>>());
  const [pendingCount, setPendingCount] = useState(0);

  const registerLineFlusher = useCallback(
    (itemId: string, flusher: LineFlusher) => {
      flushers.current.set(itemId, flusher);
      return () => {
        if (flushers.current.get(itemId) === flusher) {
          flushers.current.delete(itemId);
        }
      };
    },
    [],
  );

  const trackMutation = useCallback(async (mutation: Promise<boolean>) => {
    pending.current.add(mutation);
    setPendingCount(pending.current.size);
    try {
      return await mutation;
    } finally {
      pending.current.delete(mutation);
      setPendingCount(pending.current.size);
    }
  }, []);

  const flushPendingMutations = useCallback(async () => {
    if (pending.current.size) {
      await Promise.all([...pending.current]);
    }
    const results = await Promise.all(
      [...flushers.current.values()].map((flush) => flush()),
    );
    if (pending.current.size) {
      await Promise.all([...pending.current]);
    }
    if (results.some((result) => !result)) {
      throw new Error("A cart line could not be saved.");
    }
  }, []);

  const value = useMemo<CartCheckoutCoordinatorValue>(
    () => ({
      hasPendingMutations: pendingCount > 0,
      flushPendingMutations,
      registerLineFlusher,
      trackMutation,
    }),
    [
      flushPendingMutations,
      pendingCount,
      registerLineFlusher,
      trackMutation,
    ],
  );

  return (
    <CartCheckoutCoordinatorContext.Provider value={value}>
      {children}
    </CartCheckoutCoordinatorContext.Provider>
  );
}

export function useCartCheckoutCoordinator(): CartCheckoutCoordinatorValue {
  return useContext(CartCheckoutCoordinatorContext);
}
