# Local RAG Plugin for Obsidian

An Obsidian plugin that enables Retrieval-Augmented Generation (RAG) locally using LLMs and vector databases. This plugin allows you to index your Obsidian notes and perform semantic search with AI-powered responses.

> **Note**: This repository was created from the Obsidian sample plugin template. My commits start from bfaaa37 - any commits before that are from the original template.

## Features

- **Document Indexing**: Index your Obsidian notes for semantic search
- **Local Search**: Perform RAG-powered searches against your indexed content
- **Configurable Embeddings**: Support for various embedding models (Ollama, OpenAI, etc.)
- **Flexible Chunking**: Configurable text chunking strategies
- **Vector Database**: Efficient storage and retrieval using vector databases
- **Settings Integration**: Full Obsidian settings integration for configuration

## Prerequisites

- **Obsidian** (minimum version 0.15.0)
- **Local RAG Server**: A running instance of the Local RAG backend server
- **Node.js** (v16 or higher for development)

## Installation

### From Obsidian Community Plugins (Future)

Once published to the community plugin list:

1. Open Obsidian Settings
2. Go to Community Plugins → Browse
3. Search for "Local RAG"
4. Install and enable the plugin

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/MaxIvanyshen/local-rag-obsidian/releases)
2. Extract the files to your vault: `VaultFolder/.obsidian/plugins/local-rag-obsidian/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

## Setup

### 1. Install Local RAG Server

You'll need to set up and run the Local RAG backend server. Refer to the [Local RAG project](https://github.com/MaxIvanyshen/local-rag) for installation instructions.

### 2. Configure the Plugin

1. Open Obsidian Settings
2. Navigate to the "Local RAG" plugin settings
3. Set the path to your Local RAG configuration file (default: `~/.config/local_rag/config.yml`)
4. Configure any exclude paths or tags if needed

### 3. Start Indexing

1. Open any note in your vault
2. Use the command palette (Ctrl/Cmd+P)
3. Run "Local RAG: Index Document" to index the current note
4. Or use "Local RAG: Open Local RAG Search" to search indexed content

## Configuration

The plugin reads configuration from a YAML file (typically `~/.config/local_rag/config.yml`). Key settings include:

- **Port**: Server port (default: 8080)
- **Database Path**: Location of the vector database
- **Embedder**: Embedding model configuration (Ollama, OpenAI, etc.)
- **Chunker**: Text chunking strategy and size
- **Search**: Search parameters (top_k results)

## Usage

### Indexing Documents

- Use the command "Local RAG: Index Document" while viewing any note
- The plugin sends the document content to your local RAG server for indexing

### Searching

- Use the command "Local RAG: Open Local RAG Search"
- Type your query in the search modal
- Select from the returned results to open the relevant document

## Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Setup

```bash
npm install
npm run dev  # For development with watch mode
npm run build  # For production build
npm run lint  # To run ESLint
```

### Project Structure

```
src/
├── main.ts           # Main plugin file
├── settings.ts       # Settings interface and UI
├── local_rag_config.ts # Configuration file parsing
└── styles.css        # Plugin styles
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

0-BSD License

## Support

- [GitHub Issues](https://github.com/MaxIvanyshen/local-rag-obsidian/issues)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

## API Documentation

- [Obsidian API](https://docs.obsidian.md)
- [Local RAG Backend](https://github.com/MaxIvanyshen/local-rag)
