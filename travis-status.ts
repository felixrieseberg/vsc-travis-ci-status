import {window, commands, StatusBarAlignment, StatusBarItem, workspace, extensions} from 'vscode';
import path = require('path');
import fs = require('fs');
var Travis = require('travis-ci');

export default class TravisStatusIndicator {
	private _travis = new Travis({ version: '2.0.0' });
	private _statusBarItem: StatusBarItem;
	
	public updateStatus() : void {
		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
			this._statusBarItem.command = 'extension.updateTravis';
		}
		
		// Mark statusBarItem as 'loading'
		this._statusBarItem.text = 'Travis CI $(icon octicon-sync)';
		this._statusBarItem.tooltip = 'Fetching Travis CI status for this project...'
		
		if (this.isTravisProject()) {
			let repo = this.getUserRepo();
			
			// Display Message Box if not actually a Travis
			if (!repo || repo.length < 2 || repo[0].length === 0 || repo[1].length === 0) {
				this.displayError('Fetching Travis CI build status failed: Could not detect username and repository');
			}
			
			// Let's attempt getting a build status from Travis
			this._travis.repos(repo[0], repo[1]).get((err, res) => {
				if (err) return this.displayError(`Travis could not find ${repo[0]}/${repo[1]}`);
				if (!res || !res.repo) return this.displayError('Travis CI could not find your repository.');
				if (res.repo.last_build_number === null) return this.displayError('Travis found your repository, but it never ran a test.');
				
				let started = new Date(res.repo.last_build_started_at);
				let duration = Math.round(res.repo.last_build_duration / 60).toString();
					duration += (duration === '1') ? ' minute' : ' minutes';
				
				// Build passed
				if (res.repo.last_build_state === 'passed') {
					let text = 'Build ' + res.repo.last_build_number + ' has passed.\n';
						text += 'Started: ' + started.toLocaleDateString() + '\n';
						text += 'Duration: ' + duration;
					
					return this.displaySuccess(text);
				}
				
				// Build is running
				if (res.repo.last_build_state === 'running') {
					let text = 'Build ' + res.repo.last_build_number + ' is currently running.\n';
						text += 'Started: ' + started.toLocaleDateString() + '\n';
						text += 'Duration: ' + duration;
					
					return this.displayRunning(text);
				}
				
				// Build has failed
				if (res.repo.last_build_state === 'failed') {
					let text = 'Build ' + res.repo.last_build_number + ' failed.\n';
						text += 'Started: ' + started.toLocaleDateString() + '\n';
						text += 'Duration: ' + duration;
					
					return this.displayFailure(text);
				}
			});
		}
	}
	
	// Opens the current project on Travis
	public openInTravis() : void {
		if (!workspace || !workspace.rootPath || !this.isTravisProject()) return;
		
		let open = require('open');
		let repo = this.getUserRepo();
		
		if (repo && repo.length === 2) {
			return open(`https://travis-ci.org/${repo[0]}/${repo[1]}`);
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
		
		let fSettings = this.getUserRepoFromSettings();
		let fTravis = this.getUserRepoFromTravis();
		
		// Quick sanity check
		let user = (fSettings && fSettings.length > 0 && fSettings[0]) ? fSettings[0] : fTravis[0];
		let repo = (fSettings && fSettings.length > 1 && fSettings[1]) ? fSettings[1] : fTravis[1];
		
		return [user, repo];
	}
	
	// Setup status bar item to display that this plugin is in trouble
	private displayError(err : string) : void {
		this.setupStatusBarItem(err, 'octicon-stop');
	}
	
	// Setup status bar item to display that the build has passed;
	private displaySuccess(text : string) : void {
		this.setupStatusBarItem(text, 'octicon-check');
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
	
	// Get the username/repository combo from .vscode/settings.json
	private getUserRepoFromSettings() : Array<String> {
		if (!workspace || !workspace.rootPath) return null;
		
		let settingsFile = path.join(workspace.rootPath, '.vscode', 'settings.json');
		
		try {
			let settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
			
			if (settings) {
				let repo = settings['travis.repository'];
				let user = settings['travis.username'];
				
				return [user, repo];
			} else {
				return ['', ''];
			}
		} catch (e) {
			return ['', ''];	
		}	
	}
	
	// Get the username/repository combo from .travis.yml
	private getUserRepoFromTravis() : Array<String> {
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
				let split = combo.split('/');
				
				if (split && split.length > 1) {
					return split;
				} else {
					return ['', ''];
				}
			}
		}
		catch (err)
		{
			return ['', ''];
		}
	}
	
	dispose() {
        this._statusBarItem.dispose();
    }
}