import {window, commands, StatusBarAlignment, StatusBarItem, workspace, extensions} from 'vscode';
import path = require('path');
import fs = require('fs');

var Travis = require('travis-ci');
var Git = require('git-rev-2');

export default class TravisStatusIndicator {
	private _travis;
	private _statusBarItem: StatusBarItem;
	private _useProxy : boolean = false;
	private _proxyData = { host: null, port: null};

	public updateStatus() : void {
		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
			this._statusBarItem.command = 'extension.updateTravis';
		}

		// Mark statusBarItem as 'loading'
		this._statusBarItem.text = 'Travis CI $(sync)';
		this._statusBarItem.tooltip = 'Fetching Travis CI status for this project...'

		if (this.isTravisProject()) {
			let userRepo = this.getUserRepo();

			// Display Message Box if not actually a Travis
			if (!userRepo || userRepo.length < 2 || userRepo[0].length === 0 || userRepo[1].length === 0) {
				this.displayError('Fetching Travis CI build status failed: Could not detect username and repository');
			}
			let [username, repoName] = userRepo;

			//Get active branch
			Git.branch(workspace.rootPath, (err1, currentActiveBranch: string) => {
				//Get head commit hash
				Git.long(workspace.rootPath, (err2, currentCommitSha: string) => {
					// Let's attempt getting a build status from Travis
					this.getTravis().repos(username, repoName).branches(currentActiveBranch).get( (branchError, branchResponse) => {
						if (!branchError && branchResponse.commit.sha === currentCommitSha) {
							let started: Date = new Date(branchResponse.branch.started_at);
							let state: string = branchResponse.branch.state;
							let buildNumber: number = branchResponse.branch.number;
							let durationInSeconds: number = branchResponse.branch.duration;

							this.show(durationInSeconds, state, buildNumber, started, currentCommitSha.substr(0, 7));
						} else {
							this.getTravis().repos(username, repoName).get((repoError, repoResponse) => {
								if (repoError) return this.displayError(`Travis could not find ${userRepo[0]}/${userRepo[1]}`);
								if (!repoResponse || !repoResponse.repo) return this.displayError('Travis CI could not find your repository.');
								if (repoResponse.repo.last_build_number === null) return this.displayError('Travis found your repository, but it never ran a test.');

								let started: Date = new Date(repoResponse.repo.last_build_started_at);
								let state: string = repoResponse.repo.last_build_state;
								let buildNumber: number = repoResponse.repo.last_build_number;
								let durationInSeconds: number = repoResponse.repo.last_build_duration;

								this.show(durationInSeconds, state, buildNumber, started, 'master');
							});
						}
					});
				});
			});
		}
	}

	private show(buildDuration: number, state: string, buildNumber: number, started: Date, identifier?:string ) {
		let duration = Math.round(buildDuration / 60).toString();
		duration += (duration === '1') ? ' minute' : ' minutes';
		let timeInfo:string = `Started: ${started.toLocaleDateString()}\nDuration: ${duration}`

		switch(state) {
			case 'passed':
				return this.displaySuccess(`Build ${buildNumber} has passed.\n${timeInfo}`, identifier );
			case 'running':
				return this.displayRunning(`Build ${buildNumber} is currently running.\n${timeInfo}`, identifier);
			case 'failed':
				return this.displayFailure(`Build ${buildNumber} failed.\n${timeInfo}`, identifier);
			default:
				throw "Unsupported build state";
		}
	}

	// Opens the current project on Travis
	public openInTravis() : void {
		if (!workspace || !workspace.rootPath || !this.isTravisProject()) return;

		let open = require('open');
		let repo = this.getUserRepo();
		let base = "https://travis-ci"
		if (workspace.getConfiguration('travis')['pro']) {
			base += '.com/'
		} else {
			base += '.org/'
		}
		if (repo && repo.length === 2) {
			return open(`${base}${repo[0]}/${repo[1]}`);
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
	private displayError(err : string, identifier?: string) : void {
		this.setupStatusBarItem(err, 'stop', identifier);
	}

	// Setup status bar item to display that the build has passed;
	private displaySuccess(text : string, identifier?: string) : void {
		this.setupStatusBarItem(text, 'check', identifier);
	}

	// Setup status bar item to display that the build has failed;
	private displayFailure(text : string, identifier?: string) : void {
		this.setupStatusBarItem(text, 'x', identifier);
	}

	// Setup status bar item to display that the build is running;
	private displayRunning(text : string, identifier?: string) : void {
		this.setupStatusBarItem(text, 'clock', identifier);
	}

	// Setup StatusBarItem with an icon and a tooltip
	private setupStatusBarItem(tooltip : string, icon : string, identifier?: string) : void {
		if (!this._statusBarItem) {
			this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
		}

		this._statusBarItem.text = identifier? `Travis CI ${identifier} $(${icon})`:`Travis CI $(${icon})`;
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
				let repo = origin.url.replace(/^(.*\/\/)?[^\/:]+[\/:]/, '');
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

	private getTravis(): any {
		if (this._travis == null) {
			this._travis = new Travis({
				version: '2.0.0',
				pro: workspace.getConfiguration('travis')['pro']
			})
		}
		// Make sure that we have github token or basic credentials
		if (workspace.getConfiguration('travis')['github_oauth_token'] != "") {
			this._travis.authenticate({
				github_token: workspace.getConfiguration('travis')['github_oauth_token']
			}, function (err) {
				// we've authenticated!
			});
		} else if (workspace.getConfiguration('travis')['github_user'] != "" && workspace.getConfiguration('travis')['github_password'] != "") {
			this._travis.authenticate({
				username: workspace.getConfiguration('travis')['github_user'],
				password: workspace.getConfiguration('travis')['github_password']
			}, function (err) {
				//we've authenticated!
			});
		}

		return this._travis
	}

	dispose() {
        this._statusBarItem.dispose();
    }
}
