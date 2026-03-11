declare module "@babel/plugin-transform-runtime" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "@babel/plugin-syntax-jsx" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "@babel/plugin-syntax-typescript" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "babel-plugin-optimize-clsx" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "babel-plugin-transform-react-remove-prop-types" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "babel-plugin-transform-import-meta" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "babel-plugin-transform-inline-environment-variables" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "@babel/preset-react" {
  import type { PluginItem } from "@babel/core";

  export type Options = {
    runtime: "string";
  };

  declare const preset: PluginItem;
  export default preset;
}

declare module "@babel/preset-typescript" {
  import type { PluginItem } from "@babel/core";

  declare const preset: PluginItem;
  export default preset;
}
