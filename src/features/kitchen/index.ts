export { default as KitchenPanel } from "./ui/KitchenPanel.vue";
export { cook, lift } from "./model/cooking";
export {
  tickStoves,
  startCooling,
  startRepair,
  bookMaintenance,
  cancelMaintenance,
  noteOrderOutcome,
} from "./model/equipment";
export { maintenanceCost } from "./lib/heat";
