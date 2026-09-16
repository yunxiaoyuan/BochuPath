import { styleDimensionProperties } from "../domain/style-dimensions";
import type { StyleDimensionInput } from "./commands";
import type { StyleDimensionProperty } from "../domain/types";

export interface StyleDimensionPasteRow {
  dimension: string;
  property: StyleDimensionProperty | "";
  option: string;
  value: string;
}

const propertyAliases = new Map<string, StyleDimensionProperty>(
  styleDimensionProperties.flatMap(({ value, label }) => [
    [value.toLocaleLowerCase(), value],
    [label, value],
  ]),
);

export function parseStyleDimensionRows(raw: string): StyleDimensionPasteRow[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean))
    .map(([dimension = "", rawProperty = "", option = "", value = ""]) => ({
      dimension,
      property: propertyAliases.get(rawProperty.toLocaleLowerCase()) ?? "",
      option,
      value,
    }));
}

export function groupStyleDimensionRows(rows: StyleDimensionPasteRow[]): StyleDimensionInput[] {
  const groups = new Map<string, StyleDimensionInput>();
  rows.forEach((row) => {
    const key = row.dimension.trim();
    if (!key || !row.property || !row.option.trim() || !row.value.trim()) return;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        name: key,
        property: row.property,
        options: [{ name: row.option.trim(), value: row.value.trim() }],
      });
      return;
    }
    if (current.property !== row.property) return;
    current.options.push({ name: row.option.trim(), value: row.value.trim() });
  });
  return [...groups.values()];
}

