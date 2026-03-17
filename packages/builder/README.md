# @sse-ui/builder (sse-tools)

`sse-tools` is a high-performance CLI utility designed for managing, building, and publishing software packages within the SSE ecosystem. It provides a unified interface for library development, supporting both Babel for individual file transpilation and esbuild for high-speed bundling.

## ✨ Features

- **Hybrid Builder Engine**: Seamlessly switch between Babel for detailed transpilation or esbuild for rapid bundling via simple configuration.
- **Vite-style Watch Mode**: Features an incremental watcher that rebuilds only the specific files you change, significantly speeding up development loops.
- **Intelligent Export Management**: Automatically generates and optimizes your package.json exports field based on your build output, supporting both flat and nested structures.
- **TypeScript-First**: Built-in support for generating and bundling .d.ts declaration files using either standard tsc or the high-performance tsgo compiler.
- **React Compiler Support**: Integrated support for the React compiler, including automatic environment configuration and peer-dependency validation.
- **Interactive Versioning**: A CLI-guided versioning system that helps you bump package versions safely using SemVer standards.

## 🚀 Installation

Install the package as a development dependency:

```bash
npm install --save-dev @sse-ui/builder
```

## 🛠 Usage

Once installed, you can access the utility via the `sse-tools` command.

### Core Commands

| Command         | Description                                                                          |
| --------------- | ------------------------------------------------------------------------------------ |
| `build`         | Compiles the package for production using Babel or esbuild.                          |
| `watch`         | Starts an incremental rebuild watcher for rapid development.                         |
| `typecheck`     | Validates TypeScript types across the project without emitting files.                |
| `check-exports` | Verifies that all files declared in package.json actually exist in the build folder. |
| `version`       | Interactively bumps the package version (patch, minor, major).                       |
| `publish`       | Publishes the built package directly from your specified build directory.            |
| `info`          | Displays size and file statistics for your built package.                            |
| `clean`         | Safely removes the build directory to ensure a fresh start.                          |

## ⚙️ Configuration

`sse-tools` uses `c12` for robust configuration loading. You can define your configuration in `sse.config.ts`, `sse.config.js`, or within your `package.json`.

```typescript
import { defineConfig } from "@sse-ui/builder/config";

export default defineConfig({
  bundle: ["esm", "cjs"],
  buildTypes: true,
  flat: false,

  // Use esbuild for bundling single files
  esbuild: {
    entry: "src/index.ts",
    target: "es2022",
  },
});
```

### Build Options

- `bundle`: Specify output formats, such as `["esm", "cjs"]`.
- `flat`: When enabled, builds a flat structure instead of using format-specific subdirectories.
- `copy`: Define an array of glob patterns to copy static assets or documentation into the build folder.
- `tsgo`: Toggle between `tsc` and `tsgo` for faster type generation.

## Docs

Go to the Docs [click here](./docs)

## Example

Go to the Example [Click Here](./example)

## 📄 License

This project is licensed under the `MIT` License.
