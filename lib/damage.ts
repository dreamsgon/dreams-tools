export type DamageCategory = 'normal' | 'precision' | 'persistent' | 'splash';
export type DamageComponent = { id: string; label: string; formula?: string; amount: number; type: string; category: DamageCategory; criticalMode?: 'double' | 'once' | 'criticalOnly'; tags?: string[] };
