export default [
    {
        files: ["**/*.js"],
        ignores: ["node_modules/**", "package-lock.json"],
        languageOptions:
        {
            ecmaVersion: "latest",
            sourceType: "module"
        },
        rules:
        {
            "brace-style": ["error", "allman", { "allowSingleLine": false }],
            "comma-dangle": ["error", "never"],
            "semi": ["error", "always"],
            "quotes": ["error", "double", { "allowTemplateLiterals": true }],
            "no-unused-vars": ["error", { "args": "after-used", "argsIgnorePattern": "^_" }]
        }
    }
];
