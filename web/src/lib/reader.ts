/**
 * Reading a data file field by field. Anything missing or of the wrong kind is a DataError that
 * names the field, so that a wrong or outdated file shows as an error and never as a wrong map.
 */

/** The data file came and is not what this version of the app reads. The message names the field. */
export class DataError extends Error {
  override name = "DataError";
}

export class Reader {
  private readonly value: Record<string, unknown>;
  private readonly path: string;

  constructor(value: unknown, path: string) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DataError(`${path} is missing or not an object`);
    this.value = value as Record<string, unknown>;
    this.path = path;
  }

  private fail(key: string, wanted: string): never {
    throw new DataError(`${this.path}.${key} is missing or not ${wanted}`);
  }

  text(key: string): string {
    const found = this.value[key];
    return typeof found === "string" ? found : this.fail(key, "text");
  }

  /** Text, or null where the file holds null. */
  textOrNull(key: string): string | null {
    const found = this.value[key];
    return found === null || typeof found === "string" ? found : this.fail(key, "text or null");
  }

  number(key: string): number {
    const found = this.value[key];
    return typeof found === "number" && Number.isFinite(found) ? found : this.fail(key, "a number");
  }

  /** A number above zero: a size or a scale, which the map is divided by. */
  positive(key: string): number {
    const found = this.number(key);
    return found > 0 ? found : this.fail(key, "above zero");
  }

  flag(key: string): boolean {
    const found = this.value[key];
    return typeof found === "boolean" ? found : this.fail(key, "true or false");
  }

  object(key: string): Reader {
    return new Reader(this.value[key], `${this.path}.${key}`);
  }

  list<T>(key: string, item: (value: unknown, path: string) => T): T[] {
    const found = this.value[key];
    if (!Array.isArray(found)) return this.fail(key, "a list");
    return found.map((value, index) => item(value, `${this.path}.${key}[${index}]`));
  }

  /** A list of whole numbers from `low` to `high`, both included: a column of a journey. */
  wholeNumbers(key: string, low: number, high: number): number[] {
    const found = this.value[key];
    if (!Array.isArray(found)) return this.fail(key, "a list");
    const numbers: number[] = [];
    for (const [index, entry] of found.entries()) {
      if (typeof entry !== "number" || !Number.isInteger(entry) || entry < low || entry > high) {
        throw new DataError(`${this.path}.${key}[${index}] is not a whole number from ${low} to ${high}`);
      }
      numbers.push(entry);
    }
    return numbers;
  }
}

export const asText = (value: unknown, path: string): string => {
  if (typeof value !== "string") throw new DataError(`${path} is not text`);
  return value;
};

export const asCode = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new DataError(`${path} is not a whole number`);
  return value;
};
