import {window, commands, workspace} from 'vscode';
import TravisStatusIndicator from './travis-status';

var indicator;

export function activate() { 
	// Create File System Watcher
	let watcher = workspace.createFileSystemWatcher('.travis.yml', false, false, true);
	watcher.onDidChange((e) => updateStatus());
	watcher.onDidCreate((e) => updateStatus());
	
	// Register Commands
	commands.registerCommand('extension.updateTravis', () => updateStatus());
	commands.registerCommand('extension.openInTravis', () => openInTravis());
	
	// Check if file already present
	workspace.findFiles('.travis.yml', '', 1).then((result) => {
		if (result && result.length > 0) {
			updateStatus();
		}
	});
}

// Helper Function
function updateStatus() {
	indicator = indicator || new TravisStatusIndicator();
	indicator.updateStatus();
}

function openInTravis() {
	indicator = indicator || new TravisStatusIndicator();
	indicator.openInTravis();
}