import { _codeFrameColumns, type NodeLocation, type Options } from "./common";
import { defs, isColorSupported } from "./defs";
import { highlight } from "./highlight";

export { highlight };
export type { Options };

export function codeFrameColumns(
  rawLines: string,
  loc: NodeLocation,
  opts: Options = {},
): string {
  const shouldHighlight =
    opts.forceColor || (isColorSupported() && opts.highlightCode);

  return _codeFrameColumns(
    rawLines,
    loc,
    opts,
    shouldHighlight
      ? {
          defs,
          highlight,
        }
      : undefined,
  );
}
