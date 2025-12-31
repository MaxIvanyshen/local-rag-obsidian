import { App, PluginSettingTab, Setting } from "obsidian";
import LocalRag from "./main";

export interface LocalRagSettings {
	configPath: string;
}

export const DEFAULT_SETTINGS: LocalRagSettings = {
	configPath: '~/.config/local-rag/config.yml',
}

export class SettingTab extends PluginSettingTab {
	plugin: LocalRag;

	constructor(app: App, plugin: LocalRag) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Local RAG Config Path')
			.setDesc('Path to the Local RAG configuration file.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.configPath)
				.onChange(async (value) => {
					this.plugin.settings.configPath = value;
					await this.plugin.saveSettings();
				}));
	}
}
