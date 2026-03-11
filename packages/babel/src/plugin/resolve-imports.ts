import nodePath from "node:path";
import resolve from "resolve/sync";
import babel, { PluginObj } from "@babel/core";

type Options = {
  outExtension?: string | null;
};

function toPosixPath(importPath: string): string {
  return nodePath
    .normalize(importPath)
    .split(nodePath.sep)
    .join(nodePath.posix.sep);
}

function pathToNodeImportSpecifier(importPath: string): string {
  const normalized = toPosixPath(importPath);
  return normalized.startsWith("/") || normalized.startsWith(".")
    ? normalized
    : `./${normalized}`;
}

export default function plugin(
  { types }: { types: typeof babel.types },
  { outExtension }: Options = {},
): PluginObj {
  const cache = new Map<string, string>();
  const extensions = [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx"];
  const extensionsSet = new Set(extensions);

  function doResolve(
    importSource: babel.NodePath<babel.types.StringLiteral>,
    state: babel.PluginPass,
  ) {
    const importedPath = importSource.node.value;
    if (
      extensionsSet.has(nodePath.extname(importedPath)) ||
      importedPath.endsWith(".css") ||
      !importedPath.startsWith(".")
    ) {
      return;
    }

    const importerDir = nodePath.dirname(state.filename!);
    const absoluteImportPath = nodePath.resolve(importerDir, importedPath);

    let resolvedPath = cache.get(absoluteImportPath);
    if (!resolvedPath) {
      try {
        resolvedPath = resolve(absoluteImportPath, { extensions });
        if (
          outExtension &&
          extensionsSet.has(nodePath.extname(resolvedPath!))
        ) {
          const dir = nodePath.dirname(resolvedPath!);
          const ext = nodePath.extname(resolvedPath!);
          const base = nodePath.basename(resolvedPath!, ext);
          resolvedPath = nodePath.resolve(dir, base + outExtension);
        }
        cache.set(absoluteImportPath, resolvedPath!);
      } catch (e) {
        throw new Error(
          `Could not resolve "${importedPath}" from "${state.filename}"`,
        );
      }
    }

    const relativeResolvedPath = nodePath.relative(importerDir, resolvedPath!);
    importSource.replaceWith(
      types.stringLiteral(pathToNodeImportSpecifier(relativeResolvedPath)),
    );
  }

  return {
    visitor: {
      ImportDeclaration(path, state) {
        doResolve(path.get("source"), state);
      },
      ExportNamedDeclaration(path, state) {
        if (path.get("source").isStringLiteral())
          doResolve(path.get("source") as any, state);
      },
      ExportAllDeclaration(path, state) {
        doResolve(path.get("source"), state);
      },
    },
  };
}
