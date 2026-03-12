// @ts-check
import { fileURLToPath } from "node:url";
import * as path from "node:path";
// @ts-ignore
import getBaseConfig from "@sse-ui/builder/babel-config";

/**
 * @typedef {import('@babel/core')} babel
 */

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const errorCodesPath = path.resolve(
  dirname,
  "./test-lib/err/error-codes.json",
);

/**
 * @param {string} relativeToBabelConf
 * @returns {string}
 */
function resolveAliasPath(relativeToBabelConf) {
  const resolvedPath = path.relative(
    process.cwd(),
    path.resolve(dirname, relativeToBabelConf),
  );
  return `./${resolvedPath.replace("\\", "/")}`;
}

/** @type {babel.ConfigFunction} */
export default function getBabelConfig(api) {
  const baseConfig = getBaseConfig(api);

  const plugins = [
    [
      "@mui/internal-babel-plugin-minify-errors",
      {
        missingError: "annotate",
        errorCodesPath,
        runtimeModule: "@mui/utils/formatMuiErrorMessage",
        outExtension: process.env.MUI_OUT_FILE_EXTENSION ?? undefined,
      },
    ],
  ];

  const basePlugins = (baseConfig.plugins || []).filter(
    ([, , pluginName]) =>
      pluginName !== "@mui/internal-babel-plugin-display-name",
  );
  basePlugins.push(...plugins);

  return {
    ...baseConfig,
    plugins: basePlugins,
    overrides: [
      {
        exclude: /\.test\.(m?js|ts|tsx)$/,
        plugins: ["@babel/plugin-transform-react-constant-elements"],
      },
    ],
  };
}
