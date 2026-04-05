// @plugdash/callout - Native plugin for callout block types

import type {
	PluginDescriptor,
	NativePluginDefinition,
} from "@plugdash/types";

export function calloutPlugin(): PluginDescriptor {
	return {
		id: "callout",
		version: "0.1.0",
		format: "native",
		entrypoint: "@plugdash/callout",
		componentsEntry: "@plugdash/callout/astro",
		capabilities: [],
	};
}

export function createPlugin(): NativePluginDefinition {
	return {
		id: "callout",
		version: "0.1.0",
		hooks: {},
		admin: {
			portableTextBlocks: [
				{
					type: "callout",
					label: "Callout",
					icon: "info",
					fields: [
						{
							type: "select",
							action_id: "variant",
							label: "Type",
							options: [
								{ label: "Info", value: "info" },
								{ label: "Warning", value: "warning" },
								{ label: "Tip", value: "tip" },
								{ label: "Danger", value: "danger" },
							],
						},
						{
							type: "text_input",
							action_id: "title",
							label: "Title (optional)",
						},
						{
							type: "text_input",
							action_id: "body",
							label: "Content",
							multiline: true,
						},
						{
							type: "toggle",
							action_id: "icon",
							label: "Show icon",
							initial_value: true,
						},
					],
				},
			],
		},
	};
}

export default createPlugin;
