declare module "@babel/plugin-transform-react-jsx" {
  import type { PluginItem } from "@babel/core";

  declare const plugin: PluginItem;
  export default plugin;
}

declare module "@babel/plugin-transform-react-jsx/lib/create-plugin" {
  import type { PluginItem } from "@babel/core";

  interface PluginObj {
    name: string;
    development: boolean;
    developmentSourceSelf: boolean;
  }

  declare const plugin: PluginItem<PluginObj>;
  export default plugin;
}
