#!/usr/bin/env node
/**
 * This is the client module to facilitate connection to the nisient IoTransit event engine.
 *
 * @module iotransit-ee.js
 * @version 2.1.0
 * @file iotransit-ee.js
 * @copyright nisient pty. ltd. 2022
 */

const EventEmitter = require('events');
const WebSocketClient = require('websocket').client;

const AUTH_USER = 'ext';
const AUTH_PASS = 'external';
const COREENGINE_URI = '127.0.0.1';
const COREENGINE_PORT = 1004;
const COREENGINE_SUBPROTOCOL = 'ce.iotransit.net';
const COREENGINE_ORIGIN = 'core';
const EVENTENGINE_URI = '127.0.0.1';
const EVENTENGINE_PORT = 1008;
const EVENTENGINE_SUBPROTOCOL = 'ee.iotransit.net';
const EVENTENGINE_ORIGIN = 'events';
const AUTO_RECONNECT = true;
const CONNECT_COREENGINE = true;
const CONNECT_EVENTENGINE = true;
const RECONNECTION_TIMER = 5000;
const SECURE_WEBSOCKET = false;

class IoTransitEE extends EventEmitter {

	constructor (options) {
		super();
		if (options === null || options === undefined) {
			throw new Error('mandatory appletId not passed to constructor');
		} else if (typeof options === 'object') {
			this.options = options;
			if (!this.options.hasOwnProperty('appletId')) throw new Error('mandatory appletId not provided in config');
		} else if (typeof options === 'string') {
			this.options = {};
			this.options.appletId = options;
		}
		if (!this.options.hasOwnProperty('accepts')) {
			this.options.acceptTags = [this.options.appletId];
		} else {
			if (!Array.isArray(this.options.accepts) && typeof this.options.accepts === 'string') {
				this.options.acceptTags = [this.options.accepts];
			} else if (Array.isArray(this.options.accepts)) {
				this.options.acceptTags = this.options.accepts;
			}
		}
		this.options.authUser = this.options && this.options.authUser || AUTH_USER;
		this.options.authPass = this.options && this.options.authPass || AUTH_PASS;
		this.options.coreEngineUri = this.options && this.options.coreEngineUri || COREENGINE_URI;
		this.options.coreEnginePort = this.options && this.options.coreEnginePort || COREENGINE_PORT;
		this.options.coreEngineSubProtocol = this.options && this.options.coreEngineSubProtocol || COREENGINE_SUBPROTOCOL;
		this.options.coreEngineOrigin = this.options && this.options.coreEngineOrigin || COREENGINE_ORIGIN;
		this.options.eventEngineUri = this.options && this.options.eventEngineUri || EVENTENGINE_URI;
		this.options.eventEnginePort = this.options && this.options.eventEnginePort || EVENTENGINE_PORT;
		this.options.eventEngineSubProtocol = this.options && this.options.eventEngineSubProtocol || EVENTENGINE_SUBPROTOCOL;
		this.options.eventEngineOrigin = this.options && this.options.eventEngineOrigin || EVENTENGINE_ORIGIN;
		this.options.autoReconnect = this.options && this.options.hasOwnProperty('autoReconnect') ? this.options.autoReconnect : AUTO_RECONNECT;
		this.options.connectCE = this.options && this.options.hasOwnProperty('connectCE') ? this.options.connectCE : CONNECT_COREENGINE;
		this.options.connectEE = this.options && this.options.hasOwnProperty('connectEE') ? this.options.connectCE : CONNECT_EVENTENGINE;
		this.options.reconnectionTimer = this.options && this.options.reconnectionTimer || RECONNECTION_TIMER;
		this.options.secureWebSocket = this.options && this.options.hasOwnProperty('secureWebSocket') ? this.options.secureWebSocket : SECURE_WEBSOCKET;
		this.coreEngineConnected = false;
		this.eventEngineConnected = false;
		this.authenticated = false;
	}
	
	connect () {
		var webSocketPrefix = 'ws://';
		if (this.options.secureWebSocket) {webSocketPrefix = 'wss://';}
		// core engine connection
		if (this.options.connectCE) {
			this.ce = new WebSocketClient();
			this.ce.connect(webSocketPrefix + this.options.coreEngineUri + ':' + this.options.coreEnginePort + '/', this.options.coreEngineSubProtocol, this.options.coreEngineOrigin);
			this.ce.on('connectFailed', (err) => {
				this.coreEngineConnected = false;
				this.emit('connectionFailed', err.toString());
				if (this.options.autoReconnect) {
					setTimeout(() => {
						this.ce.connect(webSocketPrefix + this.options.coreEngineUri + ':' + this.options.coreEnginePort + '/', this.options.coreEngineSubProtocol, this.options.coreEngineOrigin);
					}, this.options.reconnectionTimer);
				}
			});
			this.ce.on('connect', (connection) => {
				connection.sendUTF(JSON.stringify({t: 'authee', p: {user: this.options.authUser, pass: this.options.authPass, accept: this.options.acceptTags}}));
				connection.on('error', function (err) {
					this.emit('connectionError', err.toString());
				});
				connection.on('close', () => {
					this.coreEngineConnected = false;
					this.emit('connectionClose', 'core engine connection closed');
					if (this.options.autoReconnect) {
						setTimeout(() => {
							this.ce.connect(webSocketPrefix + this.options.coreEngineUri + ':' + this.options.coreEnginePort + '/', this.options.coreEngineSubProtocol, this.options.coreEngineOrigin);
						}, this.options.reconnectionTimer);
					}
				});
				this.ce.connection = connection;
				this.coreEngineConnected = true;
				this.emit('connection', 'core engine connected');
				connection.on('message', (message) => {
					if (message.type === 'utf8') {
						var rcvMsg = JSON.parse(message.utf8Data);
						this.emit('ceMessage', rcvMsg);
					} else if (message.type === 'binary') {
						console.log('core engine client received a binary of ' + message.binaryData.length + ' bytes');
					}
				});
			});
		}
		// event engine connection
		if (this.options.connectEE) {
			this.ee = new WebSocketClient();
			this.ee.connect(webSocketPrefix + this.options.eventEngineUri + ':' + this.options.eventEnginePort + '/', this.options.eventEngineSubProtocol, this.options.eventEngineOrigin);
			this.ee.on('connectFailed', (err) => {
				this.eventEngineConnected = false;
				this.emit('connectionFailed', err.toString());
				if (this.options.autoReconnect) {
					setTimeout(() => {
						this.ee.connect(webSocketPrefix + this.options.eventEngineUri + ':' + this.options.eventEnginePort + '/', this.options.eventEngineSubProtocol, this.options.eventEngineOrigin);
					}, this.options.reconnectionTimer);
				}
			});
			this.ee.on('connect', (connection) => {
				connection.sendUTF(JSON.stringify({t: 'authee', p: {user: this.options.authUser, pass: this.options.authPass, accept: this.options.acceptTags}}));
				connection.on('error', function (err) {
					this.emit('connectionError', err.toString());
				});
				connection.on('close', () => {
					this.eventEngineConnected = false;
					this.emit('connectionClose', 'event engine connection closed');
					if (this.options.autoReconnect) {
						setTimeout(() => {
							this.ee.connect(webSocketPrefix + this.options.eventEngineUri + ':' + this.options.eventEnginePort + '/', this.options.eventEngineSubProtocol, this.options.eventEngineOrigin);
						}, this.options.reconnectionTimer);
					}
				});
				this.ee.connection = connection;
				this.eventEngineConnected = true;
				this.emit('connection', 'event engine connected');
				connection.on('message', (message) => {
					if (message.type === 'utf8') {
						var rcvMsg = JSON.parse(message.utf8Data);
						this.emit('eeMessage', rcvMsg);
					} else if (message.type === 'binary') {
						console.log('event engine client received a binary of ' + message.binaryData.length + ' bytes');
					}
				});
			});
		}
	}
	
	disconnect () {
		if (this.coreEngineConnected) {
			this.ce.connection.drop();
		}
		if (this.eventEngineConnected) {
			this.ee.connection.drop();
		}
	}
	
	sendCE (sendMsg) {
		// send to event engine
		if (this.options.connectCE && this.ce.connection !== undefined && this.ce.connection.connected) {
			this.ce.connection.send(JSON.stringify(sendMsg));
		} else {
			this.emit('sendError', 'core engine not connected');
		}
	}

	sendEE (sendMsg) {
		// send to event engine
		if (this.options.connectEE && this.ee.connection !== undefined && this.ee.connection.connected) {
			this.ee.connection.send(JSON.stringify(sendMsg));
		} else {
			this.emit('sendError', 'event engine not connected');
		}
	}
  
}

module.exports = IoTransitEE;