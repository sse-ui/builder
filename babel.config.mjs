import getBaseConfig from "@sse-ui/builder/babel-config";

export default function getBabelConfig(api) {
  const baseConfig = getBaseConfig(api);

  return {
    ...baseConfig,
    overrides: [
      {
        exclude: /\.test\.(m?js|ts|tsx)$/,
        plugins: ["@babel/plugin-transform-react-constant-elements"],
      },
    ],
  };
}
