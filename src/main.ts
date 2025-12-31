import { Editor, MarkdownView, Notice, Plugin, requestUrl, SuggestModal, MarkdownRenderer, Component, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, LocalRagSettings, SettingTab } from "./settings";


export default class LocalRag extends Plugin {
	settings: LocalRagSettings;

	async onload() {
		new Notice('Loading Local RAG Plugin...');

		await this.loadSettings();

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status bar text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-modal-simple',
			name: 'Open modal (simple)',
			callback: () => {
				new SearchModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				new Notice('Replacing selected content with data from local server with requestUrl()...');
				const selection = editor.getSelection();
				try {
					const resp = await requestUrl({
						url: 'http://localhost:8080/api/search',
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ query: selection })
					});
					const data = resp.json;
					editor.replaceSelection(data[0].data);
				} catch (error) {
					new Notice(`Error communicating with local server. ${error}`);
				}
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'index-document',
			name: 'Index Document',
			checkCallback: (checking: boolean) => {
				// index the current document
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file) {
					if (!checking) {
						this.indexDocument(markdownView.file);
					}
					return true;
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

	}

	onunload() {
		new Notice('Unloading Local RAG Plugin...');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<LocalRagSettings>);
	}

 	async saveSettings() {
 		await this.saveData(this.settings);
 	}

 	async indexDocument(file: TFile) {
 		const content = await this.app.vault.read(file);
 		// send content to local server for indexing as base64
 		requestUrl({
 			url: 'http://localhost:8080/api/process_document', // TODO: take that from settings later
 			method: 'POST',
 			headers: {
 				'Content-Type': 'application/json'
 			},
 			body: JSON.stringify({ document_name: file.name, document_data: btoa(content) })
 		}).then(() => {
 			new Notice(`Document "${file.name}" indexed successfully.`);
 		}).catch((error) => {
 			new Notice(`Error indexing document. ${error}`);
 		});
 	}
}

interface SearchResult {
 	document_name: string;
 	data: string;
 	chunk_index: number;
 	start_line: number;
 	end_line: number;
}

class SearchModal extends SuggestModal<SearchResult> {
	async getSuggestions(query: string): Promise<SearchResult[]> {
		if (!query.trim()) return [];
		try {
			const resp = await requestUrl({
				url: 'http://localhost:8080/api/search', // TODO: take that from settings later	
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ query: query.trim() })
			});
			return resp.json;
		} catch (error) {
			console.error('Search error:', error);
			return [];
		}
	}

	renderSuggestion(item: SearchResult, el: HTMLElement) {
		el.empty();
		el.createEl('div', { text: item.document_name, cls: 'suggestion-title' });
		el.createEl('div', { cls: 'suggestion-preview' });
		// (app, markdown, element, sourcePath, component)
		MarkdownRenderer.render(this.app, item.data.substring(0, 100), el.querySelector('.suggestion-preview')!, '', new Component());
	}

 	async onChooseSuggestion(item: SearchResult) {
 		// open that document
 		const fileName = item.document_name.replace(/^\.\//, '');
 		this.app.workspace.openLinkText(fileName, '', true);
 	}
}
