declare module "resolve/sync.js" {
  import { Opts } from "resolve";

  function resolve(id: string, options?: Opts): string;
  export = resolve;
}
