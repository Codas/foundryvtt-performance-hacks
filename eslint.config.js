import antfu from '@antfu/eslint-config';

export default antfu({
	formatters: true,

	stylistic: {
		indent: 'tab',
		quotes: 'single',
	},

	rules: {
		'antfu/consistent-list-newline': 'warn',
		'antfu/if-newline': 'off',
		'import/no-mutable-exports': 'off',
		'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
		'unused-imports/no-unused-vars': 'warn',
	},

	ignores: [],
});
