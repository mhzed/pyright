/*
* extension.ts
*
* Copyright (c) Microsoft Corporation.
* Licensed under the MIT license.
*
* Provides client for Pyright Python language server. This portion runs
* in the context of the VS Code process and talks to the server, which
* runs in another process.
*/

import * as path from 'path';
import { ExtensionContext, workspace as Workspace, TextDocument, OutputChannel, window as Window } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { ProgressReporting } from './progress';

let clients: Map<string, LanguageClient> = new Map();

export function activate(context: ExtensionContext) {
	let outputChannel: OutputChannel = Window.createOutputChannel('pyright');
	let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
	let debugOptions = { execArgv: ["--nolazy", "--inspect=6600"] };

	// If the extension is launched in debug mode, then the debug server options are used.
	// Otherwise the run options are used.
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	const runLanguageClient = (serverOptions: ServerOptions, clientOptions: LanguageClientOptions) => {
		let languageClient = new LanguageClient('python', 'Pyright', serverOptions, clientOptions);
		let disposable = languageClient.start();
		// Push the disposable to the context's subscriptions so that the 
		// client can be deactivated on extension deactivation.
		context.subscriptions.push(disposable);
		// Allocate a progress reporting object.
		const progressReporting = new ProgressReporting(languageClient);
		context.subscriptions.push(progressReporting);
		return languageClient;
	}

	const runLanguageClientOnDemand = (document: TextDocument) => {
		if (!(document.languageId === 'python' && document.uri.scheme === 'file')) {
			return;
		}
		let folder = Workspace.getWorkspaceFolder(document.uri);
		if (!folder || clients.has(folder.uri.toString())) {
			return;
		}

		// Create the language client and start the client.
		// Options to control the language client
		let clientOptions: LanguageClientOptions = {
			// Register the server for python source files.
			documentSelector: [{
				scheme: 'file',
				language: 'python',
				pattern: `${folder.uri.fsPath}/**/*`
			}],
			synchronize: {
				// Synchronize the setting section to the server.
				configurationSection: 'python'
			},
			workspaceFolder: folder,
			outputChannel: outputChannel
		};
		clients.set(folder.uri.toString(), runLanguageClient(serverOptions, clientOptions));
	};

	if (Workspace.workspaceFolders && Workspace.workspaceFolders.length > 1) {
		Workspace.onDidOpenTextDocument(runLanguageClientOnDemand);
		Workspace.textDocuments.forEach(runLanguageClientOnDemand);
		Workspace.onDidChangeWorkspaceFolders((event) => {
			for (let folder of event.removed) {
				let client = clients.get(folder.uri.toString());
				if (client) {
					clients.delete(folder.uri.toString());
					client.stop();
				}
			}
		});
	} else {
		const languageClient = runLanguageClient(serverOptions, {
			documentSelector: [{
				scheme: 'file',
				language: 'python'
			}],
			synchronize: {
				// Synchronize the setting section to the server.
				configurationSection: 'python'
			},
			outputChannel: outputChannel
		});
		clients.set(Workspace.rootPath || '/', languageClient);
	}
}

export function deactivate(): Thenable<void> {
	let promises: Thenable<void>[] = [];
	for (let client of clients.values()) {
		promises.push(client.stop());
	}
	return Promise.all(promises).then(() => undefined);
}
