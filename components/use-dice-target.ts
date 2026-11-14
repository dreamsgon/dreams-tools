"use client";
import { useEffect } from "react";
import { diceTargetStore, type DiceTarget } from "@/lib/dice-target";

/** Tells the page's Dice button where its rolls may be posted. It reads "this device only" again when the page goes away. */
export function useDiceTarget(target: DiceTarget) {
  const key = JSON.stringify(target);
  useEffect(() => diceTargetStore.set(JSON.parse(key) as DiceTarget), [key]);
}
