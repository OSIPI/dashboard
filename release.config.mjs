export default {
	branches: ['main'],
	tagFormat: 'v${version}',
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				parserOpts: {
					headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
					headerCorrespondence: ['type', 'scope', 'subject'],
					breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
					breakingHeaderCorrespondence: ['type', 'scope', 'subject']
				},
				releaseRules: [
					{ type: '*', release: false },
					{ breaking: true, release: 'major' },
					{ type: 'feat', release: 'minor' },
					{ type: 'fix', release: 'patch' }
				]
			}
		],
		[
			'@semantic-release/release-notes-generator',
			{
				parserOpts: {
					headerPattern: /^(\w*)(?:\((.*)\))?(!)?: (.*)$/,
					headerCorrespondence: ['type', 'scope', 'breaking', 'subject']
				}
			}
		],
		'./scripts/semantic-release-build.mjs',
		[
			'@semantic-release/github',
			{
				assets: [{ path: 'osipy-v*.tar.gz', label: 'Production site artifact' }],
				successComment: false,
				failComment: false,
				releasedLabels: false
			}
		]
	]
};
