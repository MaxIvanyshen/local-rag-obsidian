import { MarkdownView, Notice, Plugin, requestUrl, SuggestModal, MarkdownRenderer, Component, TFile, App } from 'obsidian';
import { DEFAULT_SETTINGS, LocalRagSettings, SettingTab } from "./settings";
import { LocalRagConfig } from 'local_rag_config';


export default class LocalRag extends Plugin {
	baseURL: string;
	config: LocalRagConfig;
	settings: LocalRagSettings;

	toIndex: Set<string> = new Set();

	isExcluded(file: TFile): boolean {
		// check excludePaths
		for (const path of this.settings.excludePaths || []) {
			if (file.path.startsWith(path)) return true;
		}

		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatterTags = cache?.frontmatter?.tags.map((t: string) => t.startsWith('#') ? t : `#${t}`) || [];
		const inlineTags = cache?.tags?.map(t => t.tag).map(t => t.startsWith('#') ? t : `#${t}`) || [];
		const allTags = [...frontmatterTags, ...inlineTags];

		for (const tag of this.settings.excludeTags || []) {
			if (allTags.includes(tag)) return true;
		}
		return false;
	}

	async onload() {
		new Notice('Loading Local RAG Plugin...');

		await this.loadSettings();

		// load documents to index
		await this.loadData().then((data) => {
			if (data && data instanceof Array) {
				this.toIndex = new Set(data);
				// filter out excluded documents
				const filtered = new Set<string>();
				for (const path of this.toIndex) {
					const file = this.app.vault.getAbstractFileByPath(path);
					if (file instanceof TFile && !this.isExcluded(file)) {
						filtered.add(path);
					}
				}
				this.toIndex = filtered;
			}

			if (this.toIndex.size > 0) {
				new Notice(`Loaded ${this.toIndex.size} documents to index from previous session.`);
			}
		});

		this.registerInterval(window.setInterval(async () => {
			if (this.toIndex.size > 0) {
				new Notice(`Indexing ${this.toIndex.size} documents in queue...`);
				this.toIndex = await this.batchIndexDocuments(this.toIndex);
				this.saveData(this.toIndex);
			}
		}, this.settings.indexIntervalMinutes * 60 * 1000));

		this.addCommand({
			id: 'search-local-rag',
			name: 'Open Local RAG Search',
			callback: () => {
				new SearchModal(this.app, this.baseURL).open();
			}
		});

		this.addCommand({
			id: 'index-document',
			name: 'Index Document',
			checkCallback: (checking: boolean) => {
				// index the current document
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file && !this.isExcluded(markdownView.file)) {
					if (!checking) {
						this.indexDocument(markdownView.file);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'remove-indexed-document',
			name: 'Remove Indexed Document',
			checkCallback: (checking: boolean) => {
				// remove the current document from the index
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView && markdownView.file) {
					if (!checking) {
						const fileName = markdownView.file.path;
						this.removeIndexedDocument(fileName);
					}
					return true;
				}
				return false;
			}
		});

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && !this.isExcluded(file)) {
					this.toIndex.add(file.path); // add to index queue
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					this.removeIndexedDocument(oldPath);
					// index new document if not excluded
					if (!this.isExcluded(file)) {
						this.indexDocument(file);
					}
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && !this.isExcluded(file)) {
					this.toIndex.add(file.path); // add to index queue
				}
			})
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {
		new Notice('Unloading Local RAG Plugin...');
		this.saveData(this.toIndex);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<LocalRagSettings>);
		this.config = LocalRagConfig.load(this.settings.configPath);
		this.baseURL = `${this.config.extensions.host}:${this.config.port}`;
		new Notice(`Local RAG Plugin loaded. Server at ${this.baseURL}`);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async removeIndexedDocument(documentName: string) {
		requestUrl({
			url: `${this.baseURL}/api/delete_document`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ document_name: documentName })
		}).then(() => {
			new Notice(`Document "${documentName}" removed from index successfully.`);
		}).catch((error) => {
			new Notice(`Error removing document from index. ${error}`);
		});
	}

	async indexDocument(file: TFile) {
		if (this.isExcluded(file)) {
			new Notice(`Skipping indexing excluded document "${file.path}".`);
			return;
		}

		const content = await this.app.vault.read(file);

		new Notice(`Indexing document "${file.path}"...`);

		const url = `${this.baseURL}/api/process_document`;

		const docData = btoa(encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));

		requestUrl({
			url,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ document_name: file.path, document_data: docData })
		}).then(() => {
			new Notice(`Document "${file.name}" indexed successfully.`);
		}).catch((error) => {
			console.error('Indexing error:', error);
			new Notice(`Error indexing document. ${error}`);
		});
	}

	async batchIndexDocuments(filePaths: Set<string>): Promise<Set<string>> {
		const files: TFile[] = [];
		filePaths.forEach((filePath) => {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile && !this.isExcluded(file)) {
				files.push(file);
			}
		});

		const documents = [];
		for (const file of files) {
			const content = await this.app.vault.read(file);
			const docData = btoa(encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
			documents.push({ document_name: file.path, document_data: docData });
		}

		const url = `${this.baseURL}/api/batch_process_documents`;
		try {
			const resp = await requestUrl({
				url,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ documents })
			});
			const remaining = resp.json.failed_documents as string[]; // assuming API returns array of remaining paths
			const remainingSet = new Set(remaining);
			return remainingSet;
		} catch (error) {
			console.error('Batch indexing error:', error);
			new Notice(`Error batch indexing documents. ${error}`);
			return filePaths; // return original set on error
		}
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
	constructor(app: App, private baseURL: string) {
		super(app);
	}

	async getSuggestions(query: string): Promise<SearchResult[]> {
		if (!query.trim()) return [];
		try {
			const resp = await requestUrl({
				url: `${this.baseURL}/api/search`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ query: query.trim() })
			});
			return resp.json;
		} catch (error) {
			new Notice(`Error during search: ${error}`);
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
