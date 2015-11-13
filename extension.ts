// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, commands, StatusBarAlignment, StatusBarItem, workspace} from 'vscode';
import path = require('path');
import fs = require('fs');

var Travis = require('travis-ci');
var travis = new Travis({ version: '2.0.0' });
var indicator;

export function activate() { 
	commands.registerCommand('extension.updateTravis', () => {
		if (!indicator) {
			indicator = new TravisStatusIndicator();
		}

		indicator.updateStatus();
	});
}

class TravisStatusIndicator {
	private _statusBarItem: StatusBarItem;
	
	public updateStatus() : void {
		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
		}
		
		if (this.isTravisProject()) {
			let repo = this.getUserRepo();
			
			// Display Message Box if not actually a Travis
			if (!repo || repo.length < 2) {
				this.displayError('Fetching Travis CI build status failed: Could not detect username and repository');
			}
			
			// Let's attempt getting a build status from Travis
			travis.repos(repo[0], repo[1]).get((err, res) => {
				if (err) return this.displayError(err);
				if (!res || res.repo) return this.displayError('Travis CI could not find your repository.');
				if (res.repo.last_build_number === null) return this.displayError('Travis found your repository, but it never ran a test.');
				
				// Build passed
				if (res.repo.last_build_state === 'passed') {
					let text = 'Build ' + res.repo.last_build_number + ' has passed.\n';
						text += 'Started: ' + res.repo.last_build_started_at + '\n';
						text += 'Duration: ' + res.repo.last_build_duration + '\n';
					
					return this.displaySuccess(text);
				}
				
				// Build is running
				if (res.repo.last_build_state === 'running') {
					let text = 'Build ' + res.repo.last_build_number + ' is currently running.\n';
						text += 'Started: ' + res.repo.last_build_started_at + '\n';
						text += 'Duration: ' + res.repo.last_build_duration + '\n';
					
					return this.displayRunning(text);
				}
				
				// Build has failed
				if (res.repo.last_build_state === 'failed') {
					let text = 'Build ' + res.repo.last_build_number + ' failed.\n';
						text += 'Started: ' + res.repo.last_build_started_at + '\n';
						text += 'Duration: ' + res.repo.last_build_duration + '\n';
					
					return this.displayFailure(text);
				}
			});
		}
	}
	
	// Check if a .travis.yml file is present, which indicates whether or not
	// this is a Travis project
	public isTravisProject() : Boolean {
		if (!workspace || !workspace.rootPath) return false;
		let conf = path.join(workspace.rootPath, '.travis.yml');
		
		try
		{
			return fs.statSync(conf).isFile();
		}
		catch (err)
		{
			return false;
		}
	}
	
	// Checks whether or not the current folder has a GitHub remote
	public getUserRepo() : Array<String> {
		if (!workspace || !workspace.rootPath) return null;
		
		let ini = require('ini');
		let configFile = path.join(workspace.rootPath, '.git', 'config');
			
		try
		{
			let config = ini.parse(fs.readFileSync(configFile, 'utf-8'));
			let origin = config['remote "origin"']
			
			if (origin && origin.url) {
				// Parse URL, get GitHub username
				let repo = origin.url.replace(/^.*\/\/[^\/]+\//, '');
				let combo = repo.replace(/(\.git)/, '');
				return combo.split('/');
			}
		}
		catch (err)
		{
			return null;
		}
	}
	
	// Setup status bar item to display that this plugin is in trouble
	private displayError(err : string) : void {
		this.setupStatusBarItem(err, 'octicon-stop');
	}
	
	// Setup status bar item to display that the build has passed;
	private displaySuccess(text : string) : void {
		this.setupStatusBarItem(text, 'octicon-checkmark');
	}
	
	// Setup status bar item to display that the build has failed;
	private displayFailure(text : string) : void {
		this.setupStatusBarItem(text, 'octicon-x');
	}
	
	// Setup status bar item to display that the build is running;
	private displayRunning(text : string) : void {
		this.setupStatusBarItem(text, 'octicon-clock');
	}
	
	// Setup StatusBarItem with an icon and a tooltip
	private setupStatusBarItem(tooltip : string, icon : string) : void {
		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
		}
		
		this._statusBarItem.text = 'Travis CI $(icon ' + icon + ')';
		this._statusBarItem.tooltip = tooltip;
		this._statusBarItem.show();
	}
}