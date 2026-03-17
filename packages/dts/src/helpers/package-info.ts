import * as fs from "fs";
import * as path from "path";

export interface PackageInfo {
  name: string;
  version: string;
  license: string;
  author?: string;
}

export function getPackageInfo(): PackageInfo {
  let dirName = process.cwd();
  while (dirName.length !== 0) {
    const packageJsonFilePath = path.join(dirName, "package.json");

    if (fs.existsSync(packageJsonFilePath)) {
      const pkgContent = fs.readFileSync(packageJsonFilePath, "utf8");
      const pkg = JSON.parse(pkgContent);

      let authorName: string | undefined = undefined;
      if (pkg.author) {
        authorName =
          typeof pkg.author === "string" ? pkg.author : pkg.author.name;
      }

      return {
        name: pkg.name || "@sse-ui/locale",
        version: pkg.version as string,
        license: pkg.license || "MIT",
        author: authorName,
      };
    }

    const parentDir = path.join(dirName, "..");
    if (parentDir === dirName) {
      break;
    }

    dirName = parentDir;
  }

  throw new Error(`Cannot find up package.json in ${__dirname}`);
}

export function packageVersion(): string {
  return getPackageInfo().version;
}
