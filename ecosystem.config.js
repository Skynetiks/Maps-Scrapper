module.exports = {
	apps: [
		{
			name: "theprospect-sqs-poll",
			script: "./node_modules/.bin/ts-node",
			args: "googleMapsScraper.ts",
			watch: true,
			env_production: {
				NODE_ENV: "production",
				PORT: 8000,
				// Add other environment variables here
			}
		}
	]
};
