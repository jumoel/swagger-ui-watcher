'use strict';

var path = require('path');
var fs = require('fs');
var open = require('open');
var nodeModules = path.resolve(path.resolve(__dirname, ''), 'node_modules');
var swaggerEditorDist = path.dirname(
	require.resolve('swagger-editor-dist/index.html')
);
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var watch = require('node-watch');
var yaml = require('js-yaml');

const RefParser = require('json-schema-ref-parser');

function bundle(swaggerFile) {
	var root = yaml.safeLoad(fs.readFileSync(swaggerFile, 'utf8'));

	const cwd = process.cwd();

	const swaggerFileDir = path.dirname(swaggerFile);
	process.chdir(swaggerFileDir);

	return RefParser.bundle(root)
		.then(obj => {
			process.chdir(cwd);

			return obj;
		})
		.catch(err => {
			process.chdir(cwd);

			return Promise.reject(err);
		});
}

function start(swaggerFile, targetDir, port, hostname, bundleTo) {
	app.get('/', function(req, res) {
		res.sendFile(__dirname + '/index.html');
	});

	app.use(express.static(swaggerEditorDist));
	app.use(function(req, res, next) {
		res.header('Access-Control-Allow-Origin', '*');
		res.header(
			'Access-Control-Allow-Headers',
			'Origin, X-Requested-With, Content-Type, Accept'
		);
		next();
	});

	io.on('connection', function(socket) {
		socket.on('uiReady', function(data) {
			bundle(swaggerFile).then(
				function(bundled) {
					socket.emit('updateSpec', JSON.stringify(bundled));
				},
				function(err) {
					socket.emit('showError', err);
				}
			);
		});
	});

	watch(targetDir, { recursive: true }, function(eventType, name) {
		bundle(swaggerFile).then(
			function(bundled) {
				console.log('File changed. Sent updated spec to the browser.');
				var bundleString = JSON.stringify(bundled, null, 2);
				io.sockets.emit('updateSpec', bundleString);
			},
			function(err) {
				io.sockets.emit('showError', err);
			}
		);
	});

	server.listen(port, hostname, function() {
		open('http://' + hostname + ':' + port);
	});
}

function build(swaggerFile, targetDir, bundleTo) {
	bundle(swaggerFile).then(
		function(bundled) {
			var bundleString = JSON.stringify(bundled, null, 2);
			if (typeof bundleTo === 'string') {
				fs.writeFile(bundleTo, bundleString, function(err) {
					if (err) {
						io.sockets.emit('showError', err);
						return;
					}
					console.log('Saved bundle file at ' + bundleTo);
				});
			}
		},
		function(err) {
			io.sockets.emit('showError', err);
		}
	);
}

module.exports = {
	start: start,
	build: build
};
