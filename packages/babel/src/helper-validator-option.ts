const { min } = Math;

// a minimal leven distance implementation
// balanced maintainability with code size
// It is not blazingly fast but should be okay for Babel user case
// where it will be run for at most tens of time on strings
// that have less than 20 ASCII characters

// https://rosettacode.org/wiki/Levenshtein_distance#ES5
function levenshtein(a: string, b: string): number {
  let t = [],
    u: number[] = [],
    i,
    j;
  const m = a.length,
    n = b.length;
  if (!m) {
    return n;
  }
  if (!n) {
    return m;
  }
  for (j = 0; j <= n; j++) {
    t[j] = j;
  }
  for (i = 1; i <= m; i++) {
    for (u = [i], j = 1; j <= n; j++) {
      u[j] =
        a[i - 1] === b[j - 1] ? t[j - 1] : min(t[j - 1], t[j], u[j - 1]) + 1;
    }
    t = u;
  }
  return u[n];
}

/**
 * Given a string `str` and an array of candidates `arr`,
 * return the first of elements in candidates that has minimal
 * Levenshtein distance with `str`.
 * @export
 * @param {string} str
 * @param {string[]} arr
 * @returns {string}
 */
export function findSuggestion(str: string, arr: readonly string[]): string {
  const distances = arr.map<number>((el) => levenshtein(el, str));
  return arr[distances.indexOf(min(...distances))];
}

export class OptionValidator {
  declare descriptor: string;
  constructor(descriptor: string) {
    this.descriptor = descriptor;
  }

  /**
   * Validate if the given `options` follow the name of keys defined in the `TopLevelOptionShape`
   *
   * @param {Object} options
   * @param {Object} TopLevelOptionShape
   *   An object with all the valid key names that `options` should be allowed to have
   *   The property values of `TopLevelOptionShape` can be arbitrary
   * @memberof OptionValidator
   */
  validateTopLevelOptions(options: object, TopLevelOptionShape: object): void {
    const validOptionNames = Object.keys(TopLevelOptionShape);
    for (const option of Object.keys(options)) {
      if (!validOptionNames.includes(option)) {
        throw new Error(
          this.formatMessage(`'${option}' is not a valid top-level option.
- Did you mean '${findSuggestion(option, validOptionNames)}'?`),
        );
      }
    }
  }

  // note: we do not consider rewrite them to high order functions
  // until we have to support `validateNumberOption`.
  validateBooleanOption<T extends boolean>(
    name: string,
    value?: boolean,
    defaultValue?: T,
  ): boolean | T {
    if (value === undefined) {
      return defaultValue!;
    } else {
      this.invariant(
        typeof value === "boolean",
        `'${name}' option must be a boolean.`,
      );
    }
    return value;
  }

  validateStringOption<T extends string>(
    name: string,
    value?: string,
    defaultValue?: T,
  ): string | T {
    if (value === undefined) {
      return defaultValue!;
    } else {
      this.invariant(
        typeof value === "string",
        `'${name}' option must be a string.`,
      );
    }
    return value;
  }
  /**
   * A helper interface copied from the `invariant` npm package.
   * It throws given `message` when `condition` is not met
   *
   * @param {boolean} condition
   * @param {string} message
   * @memberof OptionValidator
   */
  invariant(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(this.formatMessage(message));
    }
  }

  formatMessage(message: string): string {
    return `${this.descriptor}: ${message}`;
  }
}
