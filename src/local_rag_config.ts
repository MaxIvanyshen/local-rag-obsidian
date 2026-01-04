import { parse } from 'yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SearchConfig {
	top_k: number;
}

interface EmbedderConfig {
	type: string;
	base_url: string;
	model: string;
}

interface LoggingConfig {
	log_to_file: boolean;
	log_file_path: string;
}

interface ChunkerConfig {
	type: string;
	overlap_bytes: number;
	chunk_size: number;
}

interface BatchProcessingConfig {
	worker_count: number;
}

interface ExtensionsConfig {
	host: string;
}

interface ConfigData {
	port: number;
	db_path: string;
	search: SearchConfig;
	embedder: EmbedderConfig;
	logging: LoggingConfig;
	chunker: ChunkerConfig;
	batch_processing: BatchProcessingConfig;
	extensions: ExtensionsConfig;
}

export class LocalRagConfig {
	port: number;
	dbPath: string;
	search: SearchConfig;
	embedder: EmbedderConfig;
	logging: LoggingConfig;
	chunker: ChunkerConfig;
	batchProcessing: BatchProcessingConfig;
	extensions: ExtensionsConfig;

	constructor(data: ConfigData) {
		this.port = data.port;
		this.dbPath = this.expandHome(data.db_path);
		this.search = data.search;
		this.embedder = data.embedder;
		this.logging = { ...data.logging, log_file_path: this.expandHome(data.logging.log_file_path) };
		this.chunker = data.chunker;
		this.batchProcessing = data.batch_processing;
		this.extensions = data.extensions;
	}

	private expandHome(p: string): string {
		if (p.startsWith('~/')) {
			return path.join(os.homedir(), p.slice(2));
		}
		return p;
	}

	static load(configPath: string = path.join(os.homedir(), '.config', 'local_rag', 'config.yml')): LocalRagConfig {
		if (!fs.existsSync(configPath)) {
			throw new Error(`Config file not found: ${configPath}`);
		}
		try {
			const content = fs.readFileSync(configPath, 'utf8');
			const data = parse(content) as ConfigData;
			return new LocalRagConfig(data);
		} catch (err) {
			throw new Error(`Error reading config file: ${err}`);
		}
	}

	static loadWithDefaults(): LocalRagConfig {
		const configPath = path.join(os.homedir(), '.config', 'local_rag', 'config.yml');
		try {
			return this.load(configPath);
		} catch {
			// Return defaults if file not found
			const defaults: ConfigData = {
				port: 8080,
				db_path: path.join(os.homedir(), '.local_rag', 'local_rag.db'),
				search: { top_k: 5 },
				embedder: { type: 'ollama', base_url: 'http://localhost:11434', model: 'nomic-embed-text' },
				logging: { log_to_file: true, log_file_path: path.join(os.homedir(), '.local_rag', 'local_rag.log') },
				chunker: { type: 'paragraph', overlap_bytes: 0, chunk_size: 1000 },
				batch_processing: { worker_count: 4 },
				extensions: { host: 'http://localhost' }
			};
			return new LocalRagConfig(defaults);
		}
	}
}
