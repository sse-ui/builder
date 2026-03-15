# **Introduction**

`@sse-ui/builder` (distributed as the CLI tool `sse-tools`) is a professional-grade build utility engineered specifically for the SSE ecosystem. It streamlines the complexities of managing modern JavaScript and TypeScript libraries by providing a unified, high-performance interface for building, versioning, and publishing packages.

The tool is designed to provide a "best-of-both-worlds" developer experience: the granular control and ecosystem compatibility of **Babel** for standard file-by-file transpilation, and the extreme speed of **esbuild** for high-performance bundling.

## **Key Philosophies**

- **Zero-Config Intelligence**: While highly extensible, `sse-tools` automatically handles complex tasks like generating `package.json` exports, managing entry points, and configuring format-specific subdirectories (ESM/CJS) without manual intervention.
- **Performance First**: Featuring a Vite-inspired incremental watch mode, the builder only processes changed files, ensuring your development loop remains near-instant even in large monorepos.
- **Ecosystem Readiness**: Built-in support for cutting-edge features like the React Compiler, automated license injection, and `tsgo` for rapid TypeScript declaration generation ensures your packages are always production-ready.
- **Developer Experience**: With clear, color-coded terminal output (via `chalk`) and interactive CLI prompts for versioning and publishing, the tool minimizes friction throughout the entire package lifecycle.

Whether you are building a small utility or a complex UI component library, `@sse-ui/builder` provides the robust infrastructure needed to deliver high-quality, standardized packages.
