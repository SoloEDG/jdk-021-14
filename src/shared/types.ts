export type RecipeId = "steak" | "pasta" | "salad";
export type Ingredient = "beef" | "noodle" | "greens";
export interface Recipe {
  id: RecipeId;
  name: string;
  icon: string;
  ingredient: Ingredient;
  station: "pan" | "pot";
  target: number;
  price: number;
}
export interface Order {
  id: number;
  recipe: RecipeId;
  guest: string;
  arrived: number;
  deadline: number;
  status: "waiting" | "accepted" | "served" | "left";
}
export interface Portion {
  id: number;
  recipe: RecipeId;
  preparedAt: number;
}
export type StoveStatus =
  | "idle"
  | "cooking"
  | "cooling"
  | "locked"
  | "repairing"
  | "maintaining";
export interface StoveBooking {
  fee: number;
  bookedAt: number;
  entryId: number;
}
export interface Stove {
  id: number;
  kind: "pan" | "pot";
  portion: Portion | null;
  started: number;
  /** 有效火候秒数（受传热效率影响，与墙上时间不同步） */
  progress: number;
  /** 累积热负荷 0-100 */
  heat: number;
  /** 设备健康度 0-100，跨局迁移 */
  health: number;
  status: StoveStatus;
  statusUntil: number;
  booking: StoveBooking | null;
  downtimeId: number | null;
}
export interface Dish {
  id: number;
  recipe: RecipeId;
  quality: number;
  cookedAt: number;
  stage: "counter" | "plated";
}
export type EntryKind =
  | "sale"
  | "waste"
  | "miss"
  | "supply"
  | "repair"
  | "upkeep";
export interface Entry {
  id: number;
  time: number;
  label: string;
  amount: number;
  kind: EntryKind;
}
export type DowntimeKind = "cooling" | "overheat" | "repair" | "maintenance";
export interface DowntimeImpact {
  orderId: number;
  guest: string;
  recipe: RecipeId;
  /** 停机期间这张订单的最终去向 */
  outcome: "missed" | "served" | "closed";
  at: number;
}
export interface Downtime {
  id: number;
  stoveId: number;
  kind: DowntimeKind;
  start: number;
  /** null 表示仍在停机中 */
  end: number | null;
  fee: number;
  /** 停机开始时受影响、尚未交付的订单 */
  affected: number[];
  impacts: DowntimeImpact[];
  note: string;
}
/** 跨局迁移只保存设备的健康状态，停机与热负荷属于当班状态。 */
export interface StoveSnapshot {
  id: number;
  kind: Stove["kind"];
  health: number;
  heat: number;
}
export interface EquipmentSnapshot {
  best: number;
  stoves: StoveSnapshot[];
}
export interface Game {
  time: number;
  duration: number;
  running: boolean;
  ended: boolean;
  nextId: number;
  selectedOrder: number | null;
  selectedDish: number | null;
  orders: Order[];
  stock: Record<Ingredient, number>;
  portions: Portion[];
  stoves: Stove[];
  dishes: Dish[];
  entries: Entry[];
  downtimes: Downtime[];
  combo: number;
  served: number;
  missed: number;
  notice: string;
  best: number;
}
export type Command =
  | { type: "accept"; id: number }
  | { type: "select-order"; id: number }
  | { type: "prepare"; recipe: RecipeId }
  | { type: "cook"; portion: number; stove: number }
  | { type: "lift"; id: number }
  | { type: "plate"; id: number }
  | { type: "select-dish"; id: number }
  | { type: "serve" }
  | { type: "discard"; id: number }
  | { type: "restock"; ingredient: Ingredient }
  | { type: "cool"; stove: number }
  | { type: "repair"; stove: number }
  | { type: "maintain"; stove: number }
  | { type: "cancel-maintenance"; stove: number };
