"use client";

import { useEffect } from "react";

import { markWarehouseArrivalSeenAction } from "../actions";

export function ArrivalSeenMarker({ arrivalId, seen }: { arrivalId: string; seen: boolean }) {
  useEffect(() => {
    if (!seen) void markWarehouseArrivalSeenAction(arrivalId);
  }, [arrivalId, seen]);
  return null;
}
