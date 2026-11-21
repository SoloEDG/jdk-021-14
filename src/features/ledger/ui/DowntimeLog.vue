<script setup lang="ts">
import type { Game } from "../../../shared/types";
import { stoveName } from "../../kitchen/lib/heat";
import { recipes } from "../../../shared/catalog";
defineProps<{ game: Game }>();
function label(kind: string) {
  return kind === "cooling"
    ? "主动冷却"
    : kind === "overheat"
      ? "过热锁死"
      : kind === "repair"
        ? "检修"
        : "保养";
}
function outcome(o: string) {
  return o === "missed" ? "离店" : o === "served" ? "已出餐" : "打烊未决";
}
</script>
<template>
  <section class="downtime-log">
    <div class="section-heading">
      <div>
        <span class="eyebrow">06 / EQUIPMENT LOG</span>
        <h2>设备停机记录 <span class="small">TRACE</span></h2>
      </div>
      <span class="muted">每次停机对订单造成的结果</span>
    </div>
    <div class="downtime-list">
      <article v-for="d in game.downtimes.slice().reverse()" :key="d.id">
        <div class="downtime-top">
          <b>{{ label(d.kind) }} · {{ stoveName(game.stoves.find((s) => s.id === d.stoveId) ?? { id: d.stoveId, kind: "pan" }) }}</b>
          <span
            >{{ d.start.toFixed(1) }}s –
            {{ d.end === null ? "进行中" : d.end.toFixed(1) + "s" }}</span
          >
        </div>
        <p class="muted">{{ d.note }}<template v-if="d.fee"> · 费用 ¥{{ d.fee }}</template></p>
        <div v-if="d.impacts.length" class="impact-list">
          <span v-for="i in d.impacts" :key="i.orderId" :class="i.outcome">
            #{{ i.orderId }} {{ i.guest }} · {{ recipes[i.recipe].name }} →
            {{ outcome(i.outcome) }}
          </span>
        </div>
        <p v-else-if="d.affected.length" class="muted">
          停机时在进行中：{{ d.affected.map((id) => "#" + id).join("、") }}（结果未归因于本次停机）
        </p>
        <p v-else class="muted">停机期间没有进行中的订单。</p>
      </article>
      <p v-if="!game.downtimes.length" class="muted">
        还没有停机记录，灶台状态良好。
      </p>
    </div>
  </section>
</template>
