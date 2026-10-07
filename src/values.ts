import { parse } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, label: string): ObjectValue {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function decode(text: string, label: string): ObjectValue {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    throw new Error(`Malformed JSON/JSONC in ${label} (offset ${errors[0]?.offset})`);
  }
  return object(value, label);
}

function array(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Expected array");
  }
  return value;
}

export { array, decode, object };
export type { ObjectValue };
