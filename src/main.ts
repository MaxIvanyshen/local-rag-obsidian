import { MarkdownView, Notice, Plugin, requestUrl, MarkdownRenderer, Component, TFile, TFolder, App, Modal } from 'obsidian';
import { DEFAULT_SETTINGS, LocalRagSettings, SettingTab } from "./settings";
import { LocalRagConfig } from 'local_rag_config';


export default class LocalRag extends Plugin {
	baseURL: string;
	config: LocalRagConfig;
	settings: LocalRagSettings;

	toIndex: Set<string> = new Set();
	private data: LocalRagData;

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

		this.registerInterval(window.setInterval(async () => {
			if (this.toIndex.size > 0) {
				new Notice(`Indexing ${this.toIndex.size} documents in queue...`);
				this.toIndex = await this.batchIndexDocuments(this.toIndex);
				await this.savePluginData();
			}
			//}, this.settings.indexIntervalMinutes * 60 * 1000));
		}, 5 * 1000));

		this.addCommand({
			id: 'search-local-rag',
			name: 'Open Local RAG Search',
			callback: () => {
				new LocalRagSearchModal(this.app, this.baseURL).open();
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

		this.addCommand({
			id: 'index-all-documents',
			name: 'Index All Documents in Vault',
			callback: async () => {
				new Notice('Indexing all documents in vault...');
				const filesSet = new Set<string>();
				const folders = this.app.vault.getAllFolders().filter(folder => {
					return !this.settings.excludePaths?.some(excludedPath => folder.path.startsWith(excludedPath));
				});
				for (const folder of folders) {
					traverseFolder(folder, this.app, filesSet);
				}
				const batchSize = 10;
				const batches = chunkArray(Array.from(filesSet), batchSize);
				const remaining = new Set<string>();
				for (const batch of batches) {
					const batchRemaining = await this.batchIndexDocuments(new Set(batch));
					batchRemaining.forEach((path) => remaining.add(path));
				}

				// try 5 more times for remaining
				let attempts = 0;
				let currentRemaining = remaining;
				while (currentRemaining.size > 0 && attempts < 5) {
					new Notice(`Retrying indexing ${currentRemaining.size} documents... Attempt ${attempts + 1}`);
					const retryBatches = chunkArray(Array.from(currentRemaining), batchSize);
					const nextRemaining = new Set<string>();
					for (const batch of retryBatches) {
						const batchRemaining = await this.batchIndexDocuments(new Set(batch));
						batchRemaining.forEach((path) => nextRemaining.add(path));
					}
					currentRemaining = nextRemaining;
					attempts += 1;
				}

				if (currentRemaining.size > 0) {
					new Notice(`Failed to index ${currentRemaining.size} documents after multiple attempts.`);
				}
				new Notice('Completed indexing all documents in vault.');
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
		this.savePluginData();
	}

	async loadSettings() {
		const loadedData = await this.loadData() as LocalRagData | null;
		this.data = this.normalizeData(loadedData);
		this.settings = this.data.settings;
		this.toIndex = new Set(this.data.toIndex);

		if (this.toIndex.size > 0) {
			const filtered = new Set<string>();
			for (const path of this.toIndex) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile && !this.isExcluded(file)) {
					filtered.add(path);
				}
			}
			this.toIndex = filtered;
			new Notice(`Loaded ${this.toIndex.size} documents to index from previous session.`);
		}

		this.config = LocalRagConfig.load(this.settings.configPath);
		this.baseURL = `${this.config.extensions.host}:${this.config.port}`;
		new Notice(`Local RAG Plugin loaded. Server at ${this.baseURL}`);
	}

	async saveSettings() {
		this.data.settings = this.settings;
		await this.savePluginData();
	}

	private normalizeData(data: LocalRagData | null): LocalRagData {
		return {
			settings: Object.assign({}, DEFAULT_SETTINGS, data?.settings ?? {}),
			toIndex: Array.isArray(data?.toIndex) ? data!.toIndex : [],
		};
	}

	private async savePluginData() {
		this.data.toIndex = Array.from(this.toIndex);
		await this.saveData(this.data);
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

interface LocalRagData {
	settings: LocalRagSettings;
	toIndex: string[];
}

class LocalRagSearchModal extends Modal {
	private inputEl!: HTMLInputElement;
	private resultsEl!: HTMLDivElement;
	private statusEl!: HTMLDivElement;
	private previewEl!: HTMLDivElement;
	private activeIndex = -1;
	private results: SearchResult[] = [];
	private previewVisible = true;
	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			this.moveSelection(1);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			this.moveSelection(-1);
			return;
		}
		if (event.key === "Tab") {
			event.preventDefault();
			this.togglePreview();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (event.target === this.inputEl) {
				void this.search();
				return;
			}
			if (this.activeIndex >= 0) {
				this.activateSelected();
				return;
			}
			void this.search();
		}
	};

	constructor(app: App, private baseURL: string) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("local-rag-search-modal-root");
		contentEl.addClass("local-rag-search-modal");

		const inputRow = contentEl.createDiv({ cls: "local-rag-search-row" });
		this.inputEl = inputRow.createEl("input", {
			type: "text",
			placeholder: "Type your query and press Enter",
		});

		const buttonEl = inputRow.createEl("button", { text: "Search" });
		buttonEl.addEventListener("click", () => void this.search());

		this.statusEl = contentEl.createDiv({ cls: "local-rag-search-status" });
		const body = contentEl.createDiv({ cls: "local-rag-search-body" });
		this.resultsEl = body.createDiv({ cls: "local-rag-search-results" });
		this.previewEl = body.createDiv({ cls: "local-rag-search-preview" });
		this.previewEl.setText("Preview will appear here.");

		contentEl.addEventListener("keydown", this.handleKeyDown);
		this.inputEl.focus();
	}

	onClose() {
		this.contentEl.removeEventListener("keydown", this.handleKeyDown);
		this.contentEl.empty();
	}

	private async search() {
		const query = this.inputEl.value.trim();
		this.resultsEl.empty();
		this.activeIndex = -1;
		this.results = [];
		if (!query) {
			this.statusEl.setText("Type a query and press Enter.");
			return;
		}

		this.statusEl.setText("Searching...");
		try {
			const resp = await requestUrl({
				url: `${this.baseURL}/api/search`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query }),
			});
			this.results = resp.json as SearchResult[];
			this.renderResults();
			this.statusEl.setText(this.results.length ? "" : "No results.");
		} catch (error) {
			this.statusEl.setText("Search failed.");
			new Notice(`Error during search: ${error}`);
		}
	}

	private renderResults() {
		this.resultsEl.empty();
		const list = this.resultsEl.createDiv({ cls: "local-rag-result-list" });
		this.results.forEach((item, index) => {
			const button = list.createEl("button", {
				cls: "local-rag-result",
				type: "button",
				attr: {
					"data-index": `${index}`,
				},
			});
			button.addEventListener("click", async () => {
				const fileName = item.document_name.replace(/^\.\//, "");
				// Navigate to the specific line in the search result
				await this.app.workspace.openLinkText(fileName, "", false);

				// Set cursor to the start line after the file opens
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view && view.editor) {
					view.editor.setCursor({ line: item.start_line - 1 + 100, ch: 0 });
					// Scroll the line into view
					view.editor.scrollIntoView({ from: { line: item.start_line - 1, ch: 0 }, to: { line: item.start_line - 1, ch: 0 } });
				}
				this.close();
			});
			button.addEventListener("mouseover", () => {
				this.setActiveIndex(index);
			});
			const lineInfo = item.start_line === item.end_line
				? `L${item.start_line}`
				: `L${item.start_line}-L${item.end_line}`;
			const header = button.createDiv({ cls: "local-rag-result-header" });
			header.createEl("div", { text: this.getFileName(item.document_name), cls: "local-rag-result-title" });
			header.createEl("div", { text: lineInfo, cls: "local-rag-result-line" });
		});
		if (this.results.length > 0) {
			this.setActiveIndex(0);
		}
	}

	private moveSelection(delta: number) {
		const items = this.getResultButtons();
		if (items.length === 0) return;
		const next = this.activeIndex < 0 ? 0 : this.activeIndex + delta;
		const clamped = Math.max(0, Math.min(items.length - 1, next));
		this.setActiveIndex(clamped);
		items[clamped]?.scrollIntoView({ block: "nearest" });
	}

	private setActiveIndex(index: number) {
		const items = this.getResultButtons();
		items.forEach((item) => item.classList.remove("is-active"));
		if (index >= 0 && index < items.length) {
			items[index]?.classList.add("is-active");
			items[index]?.focus();
			this.activeIndex = index;
			this.updatePreview();
		}
	}

	private togglePreview() {
		this.previewVisible = !this.previewVisible;
		this.previewEl.toggleClass("is-hidden", !this.previewVisible);
	}

	private updatePreview() {
		if (!this.previewVisible) return;
		this.previewEl.empty();
		if (this.activeIndex < 0 || this.activeIndex >= this.results.length) {
			this.previewEl.setText("Preview will appear here.");
			return;
		}
		const item = this.results[this.activeIndex];
		if (!item) {
			this.previewEl.setText("Preview will appear here.");
			return;
		}
		const header = this.previewEl.createDiv({ cls: "local-rag-preview-header" });
		const lineInfo = item.start_line === item.end_line
			? `L${item.start_line}`
			: `L${item.start_line}-L${item.end_line}`;
		header.createEl("div", { text: item.document_name, cls: "local-rag-preview-title" });
		header.createEl("div", { text: lineInfo, cls: "local-rag-preview-line" });
		const body = this.previewEl.createDiv({ cls: "local-rag-preview-body" });
		MarkdownRenderer.render(this.app, item.data, body, "", new Component());
	}

	private getFileName(path: string): string {
		const parts = path.split("/");
		return parts[parts.length - 1] || path;
	}

	private activateSelected() {
		const items = this.getResultButtons();
		if (this.activeIndex < 0 || this.activeIndex >= items.length) return;
		items[this.activeIndex]?.click();
	}

	private getResultButtons(): HTMLButtonElement[] {
		return Array.from(this.resultsEl.querySelectorAll(".local-rag-result")) as HTMLButtonElement[];
	}
}

function traverseFolder(folder: TFolder, app: App, filePaths: Set<String>) {
	const children = folder.children;
	for (const abstractFile of children) {
		if (abstractFile instanceof TFile) {
			filePaths.add(abstractFile.path);
		} else {
			folder = abstractFile as TFolder;
			traverseFolder(folder, app, filePaths);
		}
	}
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		result.push(items.slice(i, i + chunkSize));
	}
	return result;
}
