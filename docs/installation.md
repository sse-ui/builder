# **Installation**

You can integrate `@sse-ui/builder` into your project either as a local development dependency or run it on-the-fly using your preferred package manager.

### **Prerequisites**

Before installing, ensure your environment meets the following requirements:

- **Node.js**: A version compatible with modern ESM (ECMAScript Modules) is required.
- **Package Type**: Your project should ideally be set to `"type": "module"` in `package.json` to leverage full ESM support.

### **Local Installation**

It is recommended to install the builder as a `devDependencies` to ensure all team members use the same version.

```bash
# npm
npm install --save-dev @sse-ui/builder

# pnpm
pnpm add -D @sse-ui/builder

# yarn
yarn add -D @sse-ui/builder
```

### **Direct Usage via npx**

If you need to run a command once without adding it to your `package.json`, you can use `npx`. This is useful for checking package info or cleaning directories in projects where the builder isn't a permanent dependency.

```bash
# Run a build without installation
npx @sse-ui/builder@latest build

# Check package statistics
npx @sse-ui/builder@latest info
```

### **Adding to Scripts**

For a streamlined workflow, add the `sse-tools` commands to your `package.json` scripts section:

```json
{
  "name": "your-package-name",
  "type": "module",
  "scripts": {
    "build": "sse-tools build",
    "watch": "sse-tools watch",
    "typecheck": "sse-tools typecheck",
    "version": "sse-tools version"
  }
}
```

Once configured, you can simply run `npm run build` or `pnpm build` to execute the builder.
