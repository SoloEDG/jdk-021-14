<script setup lang="ts">
import { computed } from "vue";
import type { Game, Stove, Command } from "../../../shared/types";
import { recipes } from "../../../shared/catalog";
import {
  HEAT_MAX,
  estimateFinishSeconds,
  heatBand,
  heatTransfer,
  maintenanceCost,
  repairQuote,
  statusLabel,
  stoveName,
} from "../lib/heat";
defineEmits<{ command: [cmd: Command] }>();
const props = defineProps<{ game: Game; stove: Stove }>();
const transfer = computed(() => Math.round(heatTransfer(props.stove) * 100));
const estimate = computed(() =>
  props.stove.status === "cooking"
    ? estimateFinishSeconds(props.stove)
    : null,
);
const maintain = computed(() => maintenanceCost(props.stove));
const repair = computed(() => repairQuote(props.stove));
const offline = computed(() =>
  ["cooling", "locked", "repairing", "maintaining"].includes(
    props.stove.status,
  ),
);
const reserve = computed(() => {
  const s = props.stove;
  return (
    !s.booking &&
    (s.status === "idle" || s.status === "cooking") &&
    s.health < 99
  );
});
const canLift = computed(
  () =>
    !!props.stove.portion &&
    (props.stove.status === "cooking" || props.stove.status === "locked"),
);
const lockReason = computed(() => {
  const s = props.stove;
  if (s.status === "cooling") return "冷却中";
  if (s.status === "locked") return "过热锁死";
  if (s.status === "repairing") return "检修中";
  if (s.status === "maintaining") return "保养中";
  if (s.booking) return "已预约保养";
  return "";
});
</script>
<template>
  <article
    class="stove"
    :class="{
      cooking: stove.status === 'cooking',
      hot: stove.heat >= HEAT_MAX,
      offline,
      booked: !!stove.booking,
    }"
  >
    <div class="stove-head">
      <b>{{ stoveName(stove) }}</b
      ><span class="status-dot">{{ statusLabel(game, stove) }}</span>
    </div>
    <div class="burner">
      <div class="pan-shape">
        <span>{{
          stove.status === "locked"
            ? "✕"
            : stove.portion
              ? recipes[stove.portion.recipe].icon
              : stove.status === "cooling"
                ? "❄"
                : stove.status === "repairing"
                  ? "🔧"
                  : stove.status === "maintaining"
                    ? "🧽"
                    : "＋"
        }}</span>
      </div>
      <div v-if="stove.status === 'cooking'" class="flame">♨ ♨ ♨</div>
      <div v-else-if="stove.status === 'locked'" class="flame locked-flame">
        ⚠ 过热
      </div>
    </div>

    <div class="gauge-row">
      <div class="gauge">
        <span>热负荷</span>
        <div class="gauge-track heat">
          <i :style="{ width: stove.heat + '%' }"></i>
        </div>
        <small :class="{ red: stove.heat >= 55 }"
          >{{ Math.round(stove.heat) }} · {{ heatBand(stove) }}</small
        >
      </div>
      <div class="gauge">
        <span>健康</span>
        <div class="gauge-track health">
          <i :style="{ width: stove.health + '%' }"></i>
        </div>
        <small :class="{ red: stove.health < 45 }"
          >{{ Math.round(stove.health) }} · 传热 {{ transfer }}%</small
        >
      </div>
    </div>

    <template v-if="stove.portion"
      ><strong>{{ recipes[stove.portion.recipe].name }}</strong>
      <p class="timer">
        {{ stove.progress.toFixed(1)
        }}<small> / {{ recipes[stove.portion.recipe].target }} 火候秒</small>
      </p>
      <p v-if="stove.status === 'cooking'" class="estimate">
        <template v-if="estimate === null"
          ><b class="red">按当前状态会在到火候前过热锁死</b></template
        ><template v-else-if="estimate === 0">已达最佳火候</template
        ><template v-else>预计 {{ estimate }} 秒后达到最佳火候</template>
      </p>
      <p v-else class="estimate red">
        设备已停火，可起锅抢救；起锅后仍需检修
      </p>
      <div class="heat-track">
        <i
          :style="{
            width:
              Math.min(
                100,
                (stove.progress /
                  (recipes[stove.portion.recipe].target * 1.8)) *
                  100,
              ) + '%',
          }"
        ></i
        ><span
          :style="{
            left:
              (recipes[stove.portion.recipe].target /
                (recipes[stove.portion.recipe].target * 1.8)) *
                100 +
              '%',
          }"
        ></span>
      </div>
      <button
        class="warm"
        :disabled="!canLift"
        @click="$emit('command', { type: 'lift', id: stove.id })"
      >
        起锅</button
      ></template
    ><template v-else
      ><p class="muted">
        {{ lockReason ? `当前${lockReason}，不接收新食品` : "等待食材下锅" }}
      </p>
      <div class="portion-picker">
        <button
          v-for="p in game.portions.filter(
            (p) => recipes[p.recipe].station === stove.kind,
          )"
          :key="p.id"
          class="tiny soft"
          :disabled="!!lockReason"
          @click="
            $emit('command', { type: 'cook', portion: p.id, stove: stove.id })
          "
        >
          {{ recipes[p.recipe].icon }} #{{ p.id }} 下锅</button
        ><small
          v-if="
            !game.portions.some((p) => recipes[p.recipe].station === stove.kind)
          "
          >先到备料台准备食材</small
        >
      </div></template
    >

    <div class="stove-actions">
      <button
        v-if="stove.status === 'locked'"
        class="tiny repair"
        :disabled="!!stove.portion"
        @click="$emit('command', { type: 'repair', stove: stove.id })"
      >
        检修 ¥{{ repair.fee }} / {{ repair.seconds }}s
      </button>
      <button
        v-if="stove.status === 'idle' && !stove.portion"
        class="tiny soft"
        :disabled="stove.heat < 1 || !!stove.booking"
        @click="$emit('command', { type: 'cool', stove: stove.id })"
      >
        冷却 4s
      </button>
      <button
        v-if="reserve"
        class="tiny soft"
        @click="$emit('command', { type: 'maintain', stove: stove.id })"
      >
        预约保养 ¥{{ maintain }}
      </button>
      <button
        v-if="stove.booking"
        class="tiny ghost cancel-booking"
        @click="
          $emit('command', { type: 'cancel-maintenance', stove: stove.id })
        "
      >
        取消预约（¥{{ stove.booking.fee }} 不退）
      </button>
    </div>
  </article>
</template>
