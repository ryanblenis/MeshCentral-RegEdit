/**
 * @description MeshCentral Registry Explorer/Editor Plugin
 * @author Ryan Blenis
 * @license AGPL-3.0
 */

"use strict";

module.exports.regedit = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.debug = obj.meshServer.debug;
    /*function (...args) {
        console.log(...args);
    } */
    obj.VIEWS = __dirname + '/views/';

    // Functions to expose to the frontend
    obj.exports = [
        'onDeviceRefreshEnd'
    ];

    // Available registry hives
    obj.HIVES = {
        'HKEY_LOCAL_MACHINE': 'HKLM',
        'HKEY_CURRENT_USER': 'HKCU',
        'HKEY_CLASSES_ROOT': 'HKCR',
        'HKEY_USERS': 'HKU',
        'HKEY_CURRENT_CONFIG': 'HKCC'
    };

    /**
     * Called when server starts (or plugin is first installed)
     */
    obj.server_startup = function() {
        obj.debug('plugin:regedit', 'Starting regedit plugin');
    };

    /**
     * Called when device page is refreshed - register our tab
     */
    obj.onDeviceRefreshEnd = function(nodeid, panel, refresh, event) {
        // Only show for Windows devices
        if (typeof currentNode === 'undefined' || currentNode == null) return;
        if (currentNode.osdesc.toLowerCase().indexOf('windows') === -1) return;
        //console.log('plugin:regedit', 'Registering RegEdit tab for:', currentNode.osdesc.toLowerCase());
        pluginHandler.registerPluginTab({
            tabTitle: 'RegEdit',
            tabId: 'pluginRegedit'
        });

        QA('pluginRegedit', '<iframe id="pluginIframeRegedit" style="width: 100%; height: 700px; overflow: auto" scrolling="yes" frameBorder=0 src="/pluginadmin.ashx?pin=regedit&user=1" />');
    };

    /**
     * Handle HTTP requests from the UI
     */
    obj.handleAdminReq = function(req, res, user) {
        if (req.query.user == 1) {
            var vars = {
                hives: JSON.stringify(obj.HIVES)
            };
            res.render(obj.VIEWS + 'regedit', vars);
        }
    };

    /**
     * Handle messages from the frontend (serveraction)
     */
    obj.serveraction = function(command, myparent, grandparent) {
        if (command.plugin != 'regedit') return;
        obj.debug('plugin:regedit', 'Received serveraction command:', command);
        
        var sessionid = null;
        try {
            sessionid = myparent.ws.sessionId;
            //obj.debug('plugin:regedit', 'Extracted sessionid:', sessionid);
        } catch (e) {
            // don't error here. This only exists in commands from the web, not from agents
            //obj.debug('plugin:regedit', 'Error getting sessionid:', e);
        }

        obj.debug('plugin:regedit', 'Received command:', command.pluginaction, 'sessionid:', sessionid);

        switch (command.pluginaction) {
            case 'enumKey':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'enumKey',
                    hive: command.hive,
                    path: command.path,
                    sessionid: sessionid
                });
                break;

            case 'getValue':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'getValue',
                    hive: command.hive,
                    path: command.path,
                    name: command.name,
                    sessionid: sessionid
                });
                break;

            case 'setValue':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'setValue',
                    hive: command.hive,
                    path: command.path,
                    name: command.name,
                    type: command.type,
                    data: command.data,
                    oldName: command.oldName,
                    oldType: command.oldType,
                    sessionid: sessionid
                });
                break;

            case 'createKey':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'createKey',
                    hive: command.hive,
                    path: command.path,
                    sessionid: sessionid
                });
                break;

            case 'renameKey':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'renameKey',
                    hive: command.hive,
                    oldPath: command.oldPath,
                    newPath: command.newPath,
                    sessionid: sessionid
                });
                break;

            case 'deleteKey':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'deleteKey',
                    hive: command.hive,
                    path: command.path,
                    sessionid: sessionid
                });
                break;

            case 'deleteValue':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'deleteValue',
                    hive: command.hive,
                    path: command.path,
                    name: command.name,
                    sessionid: sessionid
                });
                break;

            case 'search':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'search',
                    hive: command.hive,
                    path: command.path,
                    pattern: command.pattern,
                    sessionid: sessionid
                });
                break;

            case 'exportBranch':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'exportBranch',
                    hive: command.hive,
                    path: command.path,
                    sessionid: sessionid
                });
                break;

            case 'importBranch':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'importBranch',
                    hive: command.hive,
                    path: command.path,
                    content: command.content,
                    sessionid: sessionid
                });
                break;
            case 'userSidsToProfiles':
                obj.sendToAgent(command.nodeid, {
                    action: 'plugin',
                    plugin: 'regedit',
                    pluginaction: 'userSidsToProfiles',
                    sessionid: sessionid
                });
                break;
            // Handle responses from agent - route back to correct user session
            case 'userSidsToProfilesResult':
                var targetSessionid = command.sessionid;
                var response = {
                    action: 'plugin',
                    plugin: 'regedit',
                    method: 'loadUsidData',
                    data: command.data,
                    nodeid: command.nodeid
                };
                if (targetSessionid && obj.meshServer.webserver.wssessions2 && obj.meshServer.webserver.wssessions2[targetSessionid]) {
                    try {
                        obj.meshServer.webserver.wssessions2[targetSessionid].send(JSON.stringify(response));
                    } catch (e) {
                        obj.debug('plugin:regedit', 'Error sending to session:', e);
                    }
                }
                break;
            case 'enumKeyResult':
            case 'getValueResult':
            case 'setValueResult':
            case 'createKeyResult':
            case 'deleteKeyResult':
            case 'deleteValueResult':
            case 'searchResult':
            case 'exportBranchResult':
            case 'importBranchResult':
            case 'renameKeyResult':
                // Route result to frontend using sessionid from agent response
                var targetSessionid = command.sessionid;
                obj.debug('plugin:regedit', 'Routing response to sessionid:', targetSessionid);
                obj.debug('plugin:regedit', 'Response data:', command);
                var response = {
                    action: 'plugin',
                    plugin: 'regedit',
                    method: 'loadKeyData',
                    method2: command.pluginaction.replace('Result', ''),
                    success: command.success,
                    error: command.error,
                    data: command.data,
                    nodeid: command.nodeid
                };
                
                // Send to specific user session
                if (targetSessionid && obj.meshServer.webserver.wssessions2 && obj.meshServer.webserver.wssessions2[targetSessionid]) {
                    try {
                        obj.meshServer.webserver.wssessions2[targetSessionid].send(JSON.stringify(response));
                    } catch (e) {
                        obj.debug('plugin:regedit', 'Error sending to session:', e);
                    }
                }
                break;

            default:
                obj.debug('plugin:regedit', 'Unknown pluginaction:', command.pluginaction);
                break;
        }
    };

    obj.sendToAgent = function(nodeid, command) {
        try {
            if (obj.meshServer.webserver.wsagents[nodeid]) {
                obj.meshServer.webserver.wsagents[nodeid].send(JSON.stringify(command));
            }
        } catch (e) {
            obj.debug('plugin:regedit', 'Error sending to agent:', e);
        }
    };
    return obj;
};
