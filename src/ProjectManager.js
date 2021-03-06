/** @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by Mozilla.

 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.

 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */

var EventEmitter = require('events').EventEmitter;
var fs = require('graceful-fs');
var path = require('path');
var util = require('util');
var ff = require('ff');
var common = require('./common');
var packageManager = require('./PackageManager');
var packager = require('./build/packager');

var logger = new common.Formatter('games');

var ProjectManager = Class(EventEmitter, function () {
	this.init = function () {
		this._projectDirs = [];
		this._projects = {};
		this._loaded = false;

		this.loadConfig();

		common.config.on('change', bind(this, 'loadConfig', true));
	};

	this.loadConfig = function (reload) {
		if (this._reloading) { return; }
		this._reloading = true;

		var localProjectsPath = common.paths.root('./projects');
		var localProjects = [];
		fs.readdirSync(localProjectsPath).map(function (filename) {
			return common.paths.projects(filename);
		}).forEach(function(item) {
			if (path.basename(item).charAt(0) != '.') {
				localProjects.push(item);
			}
		});
		var configProjects = common.config.get('projects') || [];
		this._projectDirs = configProjects.concat(localProjects);

		var projects = {};
		var added = [];
		var removed = merge({}, this._projects);
		var f = ff(this, function() {
			this._projectDirs.forEach(function (dir) {
				var next = f.wait();
				
				packageManager.getProject(dir, bind(this, function (err, project) {
					if (err) {
						logger.error('Game at', dir, 'could not be loaded.  Run `basil clean-register` to remove it.');
						logger.error('Specific report:', err);

						next();
					} else {
						var id = project.getID().toLowerCase();

						// insert into working copy of projects
						projects[id] = project;

						// For every addon in each project, call onProjectLoad
						packager.getAddonsForApp(project, function (addons) {
							var f2 = ff(this, function () {
                                //backwards compatibility with old manifest style
								if (!util.isArray(addons)) {
									addons = Object.keys(addons);
								}
								addons.forEach(function(addonName) {
									var addon = addons[addonName];

									if (addon && addon.hasBuildPlugin()) {
										var buildAddon = require(addon.getPath('build'));

										var onFinish = f.wait();
										try {
											if (buildAddon && buildAddon.onProjectLoad) {
												buildAddon.onProjectLoad(project, onFinish);
											} else {
												onFinish();
											}
										} catch (e) {
											onFinish();
											logger.error("Error executing onProjectLoad for addon", addonName, e);
										}
									}
								});
							}).success(next).error(next);
						});

						// track added and removed projects
						if (!(id in this._projects)) {
							if (projects[id]) added.push(projects[id]);
						} else {
							delete removed[id];
						}
					}

				}));
			}, this);
		}, function () {
			// override this._projects with new dictionary
			this._projects = projects;

			// emit add/remove events!
			added.forEach(function (project) {
				if (reload) {
					logger.log('added', project.getID());
				}

				this.emit('AddProject', project);
			}, this);
			
			Object.keys(removed).forEach(function (id) {
				if (reload) {
					logger.log('removed', removed[id].getID());
				}
				
				this.emit('RemoveProject', removed[id]);
			}, this);

			this._reloading = false;
			this._loaded = true;

			this.emit('Updated');
		});
	};

	this.getProjectDirs = function (next) {
		if (this._loaded) {
			next(this._projectDirs);
		} else {
			var that = this;
			this.on('Updated', function() {
				next(that._projectDirs);
			});
		}
	};

	this.getProjects = function (next) {
		if (this._loaded) {
			next(this._projects);
		} else {
			var that = this;
			this.on('Updated', function() {
				next(that._projects);
			});
		}
	};
});

module.exports = new ProjectManager();
