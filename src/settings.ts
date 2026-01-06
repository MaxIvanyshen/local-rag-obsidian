import { App, PluginSettingTab, Setting } from "obsidian";
import LocalRag from "./main";
import path from "path";
import os from "os";

export interface LocalRagSettings {
	configPath: string;
	indexIntervalMinutes: number;
	excludePaths: string[];
	excludeTags: string[];
}

export const DEFAULT_SETTINGS: LocalRagSettings = {
	configPath: path.join(os.homedir(), '.config', 'local_rag', 'config.yml'),
	indexIntervalMinutes: 5,
	excludePaths: [],
	excludeTags: []
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

		new Setting(containerEl)
			.setName('Exclude Paths')
			.setDesc('Paths to exclude from indexing (comma-separated).')
			.addText(text => text
				.setPlaceholder('e.g., /path/to/exclude1, /path/to/exclude2')
				.setValue(this.plugin.settings.excludePaths?.join(', ') || '')
				.onChange(async (value) => {
					this.plugin.settings.excludePaths = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Exclude Tags')
			.setDesc('Tags to exclude from indexing (comma-separated).')
			.addText(text => text
				.setPlaceholder('e.g., #tag1, #tag2')
				.setValue(this.plugin.settings.excludeTags?.join(', ') || '')
				.onChange(async (value) => {
					this.plugin.settings.excludeTags = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));
	}
}
