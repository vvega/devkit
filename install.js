// this stand-alone script clones and installs the latest stable gcsdk

var REPO_URL = "https://github.com/gameclosure/gcsdk.git";
var TARGET_DIR = "gcsdk";

var fs = require('fs');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var path = require('path');

// 1. check git version
// 2. check that gcsdk directory doesn't already exist
// 3. prompt to continue
// 4. call install();
function main () {
	console.log("Preparing to download and install the GC SDK...");
	checkGit(function () {
		checkDir(function () {
			getKey("Downloading the GC SDK into "
					+ path.join(process.cwd(), TARGET_DIR) + ". "
					+ "Continue? [y/N] ", function (str) {
				if (str.toLowerCase() == 'y') {
					install();
				} else {
					console.log("You must type 'y' to continue. Exiting...");
					process.exit(1);
				}
			});
		});
	});
}

// (called after main)
// 1. run git clone
// 2. switch to sdk dir
// 3. call checkoutLatestVersion();
function install () {
	console.log("Downloading the GC SDK...");
	spawn('git', ['clone', REPO_URL, TARGET_DIR], {stdio: 'inherit'}).on('exit', function (code) {
		if (code) {
			exitWithGitError("could not successfully clone " + REPO_URL);
		}

		process.chdir(TARGET_DIR);
		checkoutLatestVersion();
	});
}

// (called after install)
// 1. get all versions from the repository tags
// 2. checkout the latest version
// 3. call runInstall();
function checkoutLatestVersion () {
	exec('git fetch --tags', function (code, out, err) {

		if (code) {
			exitWithGitError("could not complete sdk download", code, out, err);
		}

		exec('git tag', function (code, out, err) {
			if (code) {
				exitWithGitError("could not get a list of sdk versions", code, out, err);
			}

			var latestVersion = getLatestVersion(out.split("\n"));
			if (!latestVersion) {
				console.error('Could not find a version to install');
				process.exit(1);
			}

			console.log('Latest version is', latestVersion);
			exec('git checkout ' + latestVersion, function (code, out, err) {
				if (code) {
					exitWithGitError("could not checkout " + latestVersion, code, out, err);
				}
				
				runInstall();
			});
		});

	});
}

function runInstall () {
	console.log("Installing...");
	spawn('./install.sh', null, {stdio: 'inherit'}).on('exit', function (code) {
		console.error(code);
		console.error(err);
	});
}

// utils

function getLatestVersion (tags) {
	var tagParser = /^release-(\d+).(\d+).(\d+)$/;
	var latestVersion = [0, 0, 0, 0];
	tags.forEach(function (tag) {
		var result = tag.match(tagParser);
		if (result && (result[1] > latestVersion[1]
			|| result[1] == latestVersion[1] && (result[2] > latestVersion[2]
			|| result[2] == latestVersion[2] && result[3] > latestVersion[3]))) {
			latestVersion = result;
		}
	});

	return latestVersion[0];
}

function exitWithGitError (msg, code, out, err) {
	console.error(err);
	console.error("[git exited with code", code + "]");
	console.error("");
	console.error("Error:", msg);
	process.exit(1);
}

function getKey (message, cb) {
	process.stdin.resume();
	process.stdin.setRawMode(true);
	process.stdout.write(message);
	process.stdin.once('data', function (chunk) {
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write("\n");
		cb(chunk.toString());
	});
}

function checkDir (cb) {
	try {
		var stat = fs.lstatSync(TARGET_DIR);
		if (stat.isDirectory()) {
			console.error("A folder called", TARGET_DIR, "already exists in this",
				"directory. If you've already installed the GC SDK, you can update",
				"it by running 'gcsdk update'.  If you want to reinstall the GC SDK",
				"either delete the", TARGET_DIR, "directory or try running the install",
				"script in a different directory.");

			process.exit(1);
		}

		cb();
	} catch (e) {
		if (e.code == "ENOENT") {
			return cb();
		}

		console.error("Unexpected error:", e);
	}
}

function checkGit (cb) {
	exec('git version', function (code, out, err) {

		var version = out && out.toString().match(/.*?(\d+)\.(\d+)/);

		if (version && (version[1] < 1 || version[1] == 1 && version[2] < 7)) {
			console.error("Your version of git is too old.");
			version = false;
		} 

		if (code || !version) {
			console.error("Please visit http://gitscm.org/ and install git before continuing.");
			process.exit(1);
		}

		cb && cb();
	});
}

main();
