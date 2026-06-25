module.exports = {
  extends: ["expo"],
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"],
      },
    },
  },
  rules: {
    "import/no-unresolved": [
      "error",
      { ignore: ["^@guildpass/sdk$"] },
    ],
  },
};
