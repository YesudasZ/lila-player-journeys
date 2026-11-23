import { DataError } from "../lib/reader.ts";

/**
 * Why a load failed, as far as the screen needs to know. "unreachable": no usable answer came, so
 * trying again can help. "refused": the file came and is not what this version of the app reads,
 * so trying again cannot help and loading the current version of the app can.
 */
export type Failure = "unreachable" | "refused";

export function failureOf(error: unknown): Failure {
  return error instanceof DataError ? "refused" : "unreachable";
}
