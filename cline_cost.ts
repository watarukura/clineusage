#!/usr/bin/env -S deno run -A
import { parseArgs } from "node:util";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import Table from "npm:cli-table3";

const BASE = `${
  Deno.env.get("HOME")
}/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks`;

// CLI引数取得
const args = parseArgs({
  options: {
    from: {
      type: "string",
      default: "20010101",
    },
    to: {
      type: "string",
      default: "29991231",
    },
  },
  allowPositionals: true,
});

// YYYYmmddで範囲比較する関数
function isInRange(day: string, from: string, to: string) {
  return from <= day && day <= to;
}

// 13桁エポック→YYYYmmdd変換
function epoch13ToYYYYMMDD(epoch13: string): string {
  const epoch10 = Number(epoch13.slice(0, 10));
  const d = new Date(epoch10 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

// 集計オブジェクト
type Agg = {
  tokensIn: number;
  tokensOut: number;
  cacheWrites: number;
  cacheReads: number;
  cost: number;
};
const dayAgg: Record<string, Agg> = {};

// ディレクトリ走査
for await (const dirEntry of Deno.readDir(BASE)) {
  const epoch13 = dirEntry.name;
  if (!dirEntry.isDirectory || !/^\d{13}$/.test(epoch13)) continue;
  const day = epoch13ToYYYYMMDD(epoch13);
  if (!isInRange(day, args.values.from, args.values.to)) continue;

  const jsonPath = join(BASE, epoch13, "ui_messages.json");
  let jsonText: string;
  try {
    jsonText = await Deno.readTextFile(jsonPath);
  } catch {
    continue;
  }

  // JSON読み込み
  let arr: object[] = [];
  try {
    arr = JSON.parse(jsonText);
    if (!Array.isArray(arr)) continue;
  } catch {
    continue;
  }

  // type/say/api_req_startedのみ抽出
  for (const obj of arr) {
    if (
      obj?.type === "say" &&
      obj?.say === "api_req_started" &&
      typeof obj?.text === "string"
    ) {
      let t: object = {};
      try {
        t = JSON.parse(obj.text);
      } catch {
        continue;
      }
      const {
        tokensIn = 0,
        tokensOut = 0,
        cacheWrites = 0,
        cacheReads = 0,
        cost = 0,
      } = t;
      if (!dayAgg[day]) {
        dayAgg[day] = {
          tokensIn: 0,
          tokensOut: 0,
          cacheWrites: 0,
          cacheReads: 0,
          cost: 0,
        };
      }
      dayAgg[day].tokensIn += Number(tokensIn) || 0;
      dayAgg[day].tokensOut += Number(tokensOut) || 0;
      dayAgg[day].cacheWrites += Number(cacheWrites) || 0;
      dayAgg[day].cacheReads += Number(cacheReads) || 0;
      dayAgg[day].cost += Number(cost) || 0;
    }
  }
}

const table = new Table({
  head: ["day", "tokensIn", "tokensOut", "cacheWrites", "cacheReads", "cost"],
  style: {
    head: ["cyan"],
  },
  colAligns: [
    "left",
    "right",
    "right",
    "right",
    "right",
    "right",
  ],
});

// 出力
Object.entries(dayAgg)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([day, agg]) => {
    table.push(
      [
        day,
        agg.tokensIn,
        agg.tokensOut,
        agg.cacheWrites,
        agg.cacheReads,
        agg.cost.toFixed(6),
      ],
    );
  });

console.log(table.toString());
