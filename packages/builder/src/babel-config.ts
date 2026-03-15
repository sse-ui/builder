import pluginTransformRuntime from "@ssets/babel/plugin/transform-runtime";
import presetEnv, { Options as EnvOptions } from "@ssets/babel/preset/env";
import presetReact from "@babel/preset-react";
import presetTypescript from "@babel/preset-typescript";
import pluginDisplayName from "@ssets/babel/plugin/display-name";
import pluginResolveImports from "@ssets/babel/plugin/resolve-imports";
import pluginOptimizeClsx from "babel-plugin-optimize-clsx";
import pluginReactCompiler, {
  PluginOptions as BabelReactPluginOptions,
} from "babel-plugin-react-compiler";
import pluginTransformImportMeta from "babel-plugin-transform-import-meta";
import pluginTransformInlineEnvVars from "babel-plugin-transform-inline-environment-variables";
import pluginRemovePropTypes from "babel-plugin-transform-react-remove-prop-types";
import { BundleType } from "./utils/build";
import { TransformOptions, ConfigAPI } from "@babel/core";

interface GetBaseConfigOptions {
  debug: boolean;
  optimizeClsx: boolean;
  removePropTypes: boolean;
  noResolveImports: boolean;
  bundle: BundleType;
  outExtension: string | null;
  runtimeVersion: string;
  reactCompilerReactVersion?: string;
  reactCompilerMode?: string;
}

export function getBaseConfig({
  debug = false,
  optimizeClsx = false,
  removePropTypes = false,
  noResolveImports = false,
  bundle,
  runtimeVersion,
  outExtension,
  reactCompilerReactVersion,
  reactCompilerMode,
}: GetBaseConfigOptions): TransformOptions {
  const presetEnvOptions: EnvOptions = {
    bugfixes: true,
    debug,
    modules: bundle === "esm" ? false : "commonjs",
    // @TODO
    browserslistEnv: bundle === "esm" ? "stable" : "node",
  };

  const plugins: TransformOptions["plugins"] = [
    [
      pluginTransformRuntime,
      {
        version: runtimeVersion,
        regenerator: false,
        useESModules: bundle === "esm",
      },
      "@babel/plugin-transform-runtime",
    ],
    [pluginDisplayName, {}, "babel-plugin-display-name"],
    [
      pluginTransformInlineEnvVars,
      {
        include: [
          "SSE_VERSION",
          "SSE_MAJOR_VERSION",
          "SSE_MINOR_VERSION",
          "SSE_PATCH_VERSION",
          "SSE_PRERELEASE",
        ],
      },
      "babel-plugin-transform-inline-environment-variables",
    ],
  ];

  if (bundle !== "esm") {
    plugins.push([
      pluginTransformImportMeta,
      {},
      "babel-plugin-transform-import-meta",
    ]);
  }

  if (reactCompilerReactVersion) {
    const reactCompilerOptions: BabelReactPluginOptions = {
      // comes from the package's peerDependencies
      target: reactCompilerReactVersion.split(
        ".",
      )[0] as BabelReactPluginOptions["target"],
      enableReanimatedCheck: false,
      compilationMode: reactCompilerMode ?? "annotation",
      // Skip components with errors instead of failing the build
      panicThreshold: "none",
    };
    // The plugin must be the first one to run
    plugins.unshift([
      pluginReactCompiler,
      reactCompilerOptions,
      "babel-plugin-react-compiler",
    ]);
  }

  if (removePropTypes) {
    plugins.push([
      pluginRemovePropTypes,
      {
        mode: "unsafe-wrap",
      },
      "babel-plugin-transform-react-remove-prop-types",
    ]);
  }

  if (optimizeClsx) {
    plugins.push([pluginOptimizeClsx, {}, "babel-plugin-optimize-clsx"]);
  }

  if (bundle === "esm" && !noResolveImports) {
    plugins.push([
      pluginResolveImports,
      { outExtension },
      "babel-plugin-resolve-imports",
    ]);
  }

  return {
    assumptions: {
      noDocumentAll: true,
      // With our case these assumptions are safe, and the
      // resulting behavior is equivalent to spec mode.
      setPublicClassFields: true,
      privateFieldsAsProperties: true,
      objectRestNoSymbols: true,
      setSpreadProperties: true,
    },
    ignore: [
      // Fix a Windows issue.
      /@babel[\\|/]runtime/,
      // Fix const foo = /{{(.+?)}}/gs; crashing.
      /prettier/,
      "**/*.template.js",
    ],
    presets: [
      [presetEnv, presetEnvOptions],
      [
        presetReact,
        {
          runtime: "automatic",
          useBuiltIns: bundle === "esm",
          useSpread: bundle === "esm",
        },
      ],
      [presetTypescript],
    ],
    plugins,
    minified: process.env.SSE_MINIFY === "true",
    shouldPrintComment: (val) =>
      process.env.SSE_MINIFY !== "true" ||
      /[@#]__PURE__|license|copyright/i.test(val),
  };
}

interface GetBabelConfigOptions {
  bundle: BundleType;
  noResolveImports: boolean;
  env: any;
}

export default function getBabelConfig(
  api: ConfigAPI | GetBabelConfigOptions,
): TransformOptions {
  let bundle: BundleType;
  let noResolveImports: boolean;

  if (api.env) {
    // legacy
    bundle = api.env(["regressions", "stable"]) ? "esm" : "cjs";
    noResolveImports = api.env("test") || process.env.NODE_ENV === "test";
  } else {
    bundle = (api as GetBabelConfigOptions).bundle || "esm";
    noResolveImports = (api as GetBabelConfigOptions).noResolveImports || false;
  }

  return getBaseConfig({
    debug: process.env.SSE_BUILD_VERBOSE === "true",
    bundle,
    outExtension: process.env.SSE_OUT_FILE_EXTENSION || null,
    // any package needs to declare 7.25.0 as a runtime dependency. default is ^7.0.0
    runtimeVersion: process.env.SSE_BABEL_RUNTIME_VERSION || "^7.25.0",
    optimizeClsx: process.env.SSE_OPTIMIZE_CLSX === "true",
    removePropTypes: process.env.SSE_REMOVE_PROP_TYPES === "true",
    noResolveImports,
    reactCompilerReactVersion: process.env.SSE_REACT_COMPILER_REACT_VERSION,
    reactCompilerMode: process.env.SSE_REACT_COMPILER_MODE,
  });
}
