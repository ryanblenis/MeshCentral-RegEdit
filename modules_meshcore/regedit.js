/**
 * @description MeshCentral RegEdit Plugin - Agent Side
 * @author Ryan Blenis
 * @license AGPL-3.0
 * @note Runs in MeshCore (duktape) - ES5 compliant
 */

"use strict";

var mesh;
var obj = this;
var debug_flag = false;

// Debug function - writes to regedit.txt in agent directory
var dbg = function(str) {
    if (debug_flag !== true) return;
    try {
        var fs = require('fs');
        var logStream = fs.createWriteStream('regedit.txt', {'flags': 'a'});
        logStream.write('\n'+new Date().toLocaleString()+': '+ str);
        logStream.end();
    } catch (e) {}
};

// Registry hive mappings (short to full name)
var HIVE_MAP = {
    'HKLM': 'HKEY_LOCAL_MACHINE',
    'HKCU': 'HKEY_CURRENT_USER',
    'HKCR': 'HKEY_CLASSES_ROOT',
    'HKU': 'HKEY_USERS',
    'HKCC': 'HKEY_CURRENT_CONFIG'
};

/**
 * Main consoleaction handler - receives commands from server
 */
function consoleaction(args, rights, sessionid, parent) {
    mesh = parent;
    
    // Get function name from args
    var fnname = null;
    if (typeof args['_'] != 'undefined') {
        fnname = args['_'][1];
    } else if (args.pluginaction) {
        fnname = args.pluginaction;
    }

    if (fnname == null) {
        return;
    }

    // Get sessionid from args (passed from server for scoping)
    var currentSessionid = args.sessionid || sessionid;
    dbg('Received command: ' + JSON.stringify(args));

    switch (fnname) {
        case 'enumKey':
            doEnumKey(args.hive, args.path, currentSessionid);
            break;

        case 'getValue':
            doGetValue(args.hive, args.path, args.name, currentSessionid);
            break;

        case 'setValue':
            doSetValue(args.hive, args.path, args.name, args.type, args.data, args.oldName, args.oldType, currentSessionid);
            break;

        case 'createKey':
            doCreateKey(args.hive, args.path, currentSessionid);
            break;

        case 'deleteKey':
            doDeleteKey(args.hive, args.path, currentSessionid);
            break;

        case 'deleteValue':
            doDeleteValue(args.hive, args.path, args.name, currentSessionid);
            break;

        case 'renameKey':
            doRenameKey(args.hive, args.oldPath, args.newPath, currentSessionid);
            break;

        case 'search':
            doSearch(args.hive, args.path, args.pattern, args.searchType || 'both', currentSessionid);
            break;

        case 'exportBranch':
            doExportBranch(args.hive, args.path, currentSessionid);
            break;

        case 'importBranch':
            doImportBranch(args.hive, args.path, args.content, currentSessionid);
            break;
        case 'userSidsToProfiles':
            doUserSidsToProfiles(currentSessionid);
            break;
        case 'debug':
            debug_flag = !debug_flag;
            return "Debug " + (debug_flag ? "enabled" : "disabled");
        default:
            dbg('Unknown command: ' + fnname);
            break;
    }
}

/**
 * Convert short hive name to full registry name
 */
function getFullHiveName(shortHive) {
    return HIVE_MAP[shortHive] || shortHive;
}

/**
 * Map registry type to PowerShell type name
 */
function mapTypeToPowerShell(type) {
    switch (type) {
        case 'REG_SZ': return 'String';
        case 'REG_EXPAND_SZ': return 'ExpandString';
        case 'REG_DWORD': return 'DWord';
        case 'REG_QWORD': return 'QWord';
        case 'REG_BINARY': return 'Binary';
        case 'REG_MULTI_SZ': return 'MultiString';
        default: return 'String';
    }
}

/**
 * Enumerate keys and values at a given path using PowerShell
 */
function doEnumKey(hive, path, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('enumKey', false, 'Platform not supported', null, sessionid);
        return;
    }

    var fullHive = getFullHiveName(hive);
    var psPath = fullHive + (path ? '\\' + path : '');
	var safePsPath = psPath.replace(/'/g, "''");

    dbg('enumKey: hive=' + hive + ', path=' + path + ', fullPath=' + psPath);

    // Use JSON output from PowerShell
    var psCommand = '';
    psCommand += '$key = Get-Item -Path "Registry::' + psPath /*.replace(/"/g, '`"')*/ + '" -ErrorAction Ignore; ';
    psCommand += 'if ($key) { ';
    psCommand += '$result = @{ keys = @($key.GetSubKeyNames()); values = @{} }; ';
    psCommand += '$key.GetValueNames() | ForEach-Object { ';
    psCommand += 'if ($_) { ';
    psCommand += '$val = $key.GetValue($_); ';
    psCommand += '$kind = $key.GetValueKind($_); ';
    psCommand += '$typeMap = @{ "String" = "REG_SZ"; "ExpandString" = "REG_EXPAND_SZ"; "DWord" = "REG_DWORD"; "QWord" = "REG_QWORD"; "Binary" = "REG_BINARY"; "MultiString" = "REG_MULTI_SZ"; "None" = "REG_NONE" }; ';
    psCommand += '$result.values[$_] = @{ value = $val; type = $typeMap[$kind.ToString()] } ';
    psCommand += '} }; ';
    psCommand += '$default = $key.GetValue(""); ';
    psCommand += 'if ($default -ne $null) { $result.values["(Default)"] = @{ value = $default; type = "REG_SZ" } }; ';
    psCommand += '$result | ConvertTo-Json -Compress } else { @{ keys = @(""); values = @{} } | ConvertTo-Json -Compress }';

    psCommand = "$k=Get-Item -Path 'Registry::"+ safePsPath + "' -EA 0;if($k){$m=@{String='REG_SZ';ExpandString='REG_EXPAND_SZ';DWord='REG_DWORD';QWord='REG_QWORD';Binary='REG_BINARY';MultiString='REG_MULTI_SZ';None='REG_NONE'};$v=[ordered]@{};$names=@('') + @($k.GetValueNames()|?{$_ -ne ''}|Sort-Object);$names|%{$n=$_;$isDefault=($n -eq '');$j=if($isDefault){'(Default)'}else{$n};if($isDefault){$d=$k.GetValue('', $null);if($null -eq $d){$v[$j]=@{value='(value not set)';type='Empty'}}else{try{$dt=$m[$k.GetValueKind('').ToString()]}catch{$dt='REG_SZ'};$v[$j]=@{value=$d;type=$dt}}}else{try{$t=$m[$k.GetValueKind($n).ToString()]}catch{$t='REG_SZ'};$v[$j]=@{value=$k.GetValue($n);type=$t}}};$r=@{keys=@($k.GetSubKeyNames());values=$v}}else{$r=@{keys=@();values=@{}}};$r|ConvertTo-Json -Compress";
    dbg('enumKey PS command: ' + psCommand);

    runPowerShell(psCommand, function(err, stdout, stderr) {
        dbg('enumKey PS stdout: ' + (stdout ? stdout.substring(0, 200) : 'null'));
        dbg('enumKey PS stderr: ' + (stderr ? stderr : 'null'));
        dbg('enumKey PS err: ' + (err ? err : 'null'));

        if (err) {
            dbg('enumKey error: ' + (err.message || err));
            sendResult('enumKey', false, err.message || stderr || 'Unknown error', null, sessionid);
            return;
        }

        var output = stdout || '';
        if (!output || output.trim() === '') {
            dbg('enumKey: no output, stderr: ' + stderr);
            sendResult('enumKey', false, 'No output from PowerShell: ' + (stderr || 'Unknown error'), null, sessionid);
            return;
        }

        try {
            var result = JSON.parse(output);
            var keys = result.keys || [];
            var values = result.values || {};

            dbg('enumKey success: ' + keys.length + ' keys, ' + Object.keys(values).length + ' values');
            sendResult('enumKey', true, null, {
                keys: keys,
                values: values,
                hive: hive,
                path: path
            }, sessionid);
        } catch (e) {
            dbg('enumKey parse error: ' + e.message + ', output: ' + output);
            sendResult('enumKey', false, 'Failed to parse registry data: ' + e.message, null, sessionid);
        }
    });
}

/**
 * Get a specific value using PowerShell
 */
function doGetValue(hive, path, name, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('getValue', false, 'Platform not supported', null, sessionid);
        return;
    }

    var fullHive = getFullHiveName(hive);
    var psPath = fullHive + (path ? '\\' + path : '');

    dbg('getValue: hive=' + hive + ', path=' + path + ', name=' + name);

    var psCommand = '';
    psCommand += '$key = Get-Item -Path "Registry::' + psPath.replace(/"/g, '`"') + '" -ErrorAction SilentlyContinue; ';
    psCommand += 'if ($key) { ';
    psCommand += '$val = $key.GetValue("' + name.replace(/"/g, '`"') + '"); ';
    psCommand += '$kind = $key.GetValueKind("' + name.replace(/"/g, '`"') + '"); ';
    psCommand += '$typeMap = @{ "String" = "REG_SZ"; "ExpandString" = "REG_EXPAND_SZ"; "DWord" = "REG_DWORD"; "QWord" = "REG_QWORD"; "Binary" = "REG_BINARY"; "MultiString" = "REG_MULTI_SZ"; "None" = "REG_NONE" }; ';
    psCommand += '@{ value = $val; type = $typeMap[$kind.ToString()] } | ConvertTo-Json -Compress } else { @{} | ConvertTo-Json -Compress }';

    dbg('getValue PS command: ' + psCommand);

    runPowerShell(psCommand, function(err, stdout, stderr) {
        dbg('getValue PS stdout: ' + (stdout ? stdout.substring(0, 200) : 'null'));
        dbg('getValue PS stderr: ' + stderr);
        
        if (err) {
            dbg('getValue error: ' + (err.message || err));
            sendResult('getValue', false, err.message || stderr || 'Unknown error', null, sessionid);
            return;
        }

        var output = stdout || '';
        if (!output || output.trim() === '') {
            dbg('getValue: no output, stderr: ' + stderr);
            sendResult('getValue', false, 'No output from PowerShell: ' + (stderr || 'Unknown error'), null, sessionid);
            return;
        }

        try {
            var result = JSON.parse(output);
            sendResult('getValue', true, null, {
                name: name,
                data: result.value,
                type: result.type || 'REG_SZ',
                hive: hive,
                path: path
            }, sessionid);
        } catch (e) {
            dbg('getValue parse error: ' + e.message + ', output: ' + output);
            sendResult('getValue', false, 'Failed to parse value data: ' + e.message, null, sessionid);
        }
    });
}

/**
 * Set a registry value using PowerShell
 * If name or type changes, delete old value first then create new one
 */
function doSetValue(hive, path, name, type, data, oldName, oldType, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('setValue', false, 'Platform not supported', null, sessionid);
        return;
    }
    
    var psPath = hive + ':\\' + path;

    var needsDelete = (oldName !== undefined && oldName !== null && oldName !== name) ||
                      (oldType !== undefined && oldType !== null && oldType !== type);

    function writeValue(deleteCallback) {
        var psCommand;
        var regType = mapTypeToPowerShell(type);

        if (type === 'REG_DWORD') {
            var intVal = parseInt(data, 10);
            if (isNaN(intVal)) { intVal = 0; }
            psCommand = "Set-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Value " + intVal + " -Type DWord; Write-Output 'OK'";
        } else if (type === 'REG_QWORD') {
            var qwordVal = parseInt(data, 10);
            if (isNaN(qwordVal)) { qwordVal = 0; }
            psCommand = "Set-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Value " + qwordVal + " -Type QWord; Write-Output 'OK'";
        } else if (type === 'REG_BINARY') {
            var binData = data.replace(/[^0-9a-fA-F]/g, '');
            psCommand = "Set-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Value ([byte[]](" + binData.match(/.{1,2}/g).map(function(b) { return '0x' + b; }).join(',') + ")) -Type Binary; Write-Output 'OK'";
        } else if (type === 'REG_MULTI_SZ') {
            var lines = data.split('\\n').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
            psCommand = "Set-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Value @('" + lines.join("','") + "') -Type MultiString; Write-Output 'OK'";
        } else if (type === 'REG_EXPAND_SZ') {
            psCommand = "Set-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Value '" + data.replace(/'/g, "''") + "' -Type ExpandString; Write-Output 'OK'";
        } else {
            psCommand = "Set-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Value '" + data.replace(/'/g, "''") + "' -Type String; Write-Output 'OK'";
        }
        dbg('setValue PS command: ' + psCommand);
        runPowerShell(psCommand, function(err, stdout, stderr) {
            if (err) {
                dbg('setValue error: ' + stderr);
                sendResult('setValue', false, stderr, null, sessionid);
            } else {
                dbg('setValue success: ' + path + '\\' + name);
                sendResult('setValue', true, null, {
                    hive: hive,
                    path: path,
                    name: name,
                    type: type,
                    data: data
                }, sessionid);
            }
        });
    }

    if (needsDelete) {
        var deleteCommand = "Remove-ItemProperty -Path '" + psPath + "' -Name '" + oldName + "' -Force -ErrorAction SilentlyContinue; Write-Output 'OK'";
        runPowerShell(deleteCommand, function(err, stdout, stderr) {
            if (err) {
                dbg('delete old value error (continuing anyway): ' + stderr);
            }
            writeValue();
        });
    } else {
        writeValue();
    }
}

/**
 * Create a new registry key using PowerShell
 */
function doCreateKey(hive, path, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('createKey', false, 'Platform not supported', null, sessionid);
        return;
    }

    var psPath = hive + ':\\' + path;
    var psCommand = "New-Item -Path '" + psPath + "' -Force | Out-Null; Write-Output 'OK'";

    dbg('createKey PS command: ' + psCommand);
    runPowerShell(psCommand, function(err, stdout, stderr) {
        if (err) {
            dbg('createKey error: ' + stderr);
            sendResult('createKey', false, stderr, null, sessionid);
        } else {
            dbg('createKey success: ' + psPath);
            sendResult('createKey', true, null, {
                hive: hive,
                path: path
            }, sessionid);
        }
    });
}

/**
 * Delete a registry key using PowerShell
 */
function doDeleteKey(hive, path, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('deleteKey', false, 'Platform not supported', null, sessionid);
        return;
    }

    var psPath = hive + ':\\' + path;
    var psCommand = "Remove-Item -Path '" + psPath + "' -Recurse -Force; Write-Output 'OK'";
    dbg('deleteKey PS command: ' + psCommand);
    runPowerShell(psCommand, function(err, stdout, stderr) {
        if (err) {
            dbg('deleteKey error: ' + stderr);
            sendResult('deleteKey', false, stderr, null, sessionid);
        } else {
            dbg('deleteKey success: ' + psPath);
            sendResult('deleteKey', true, null, {
                hive: hive,
                path: path
            }, sessionid);
        }
    });
}

/**
 * Delete a registry value using PowerShell
 */
function doDeleteValue(hive, path, name, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('deleteValue', false, 'Platform not supported', null, sessionid);
        return;
    }

    var psPath = hive + ':\\' + path;
    var psCommand = "Remove-ItemProperty -Path '" + psPath + "' -Name '" + name + "' -Force; Write-Output 'OK'";
    dbg('deleteValue PS command: ' + psCommand);
    runPowerShell(psCommand, function(err, stdout, stderr) {
        if (err) {
            dbg('deleteValue error: ' + stderr);
            sendResult('deleteValue', false, stderr, null, sessionid);
        } else {
            dbg('deleteValue success: ' + psPath + '\\' + name);
            sendResult('deleteValue', true, null, {
                hive: hive,
                path: path,
                name: name
            }, sessionid);
        }
    });
}

/**
 * Rename a registry key using PowerShell
 */
function doRenameKey(hive, oldPath, newPath, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('renameKey', false, 'Platform not supported', null, sessionid);
        return;
    }

    var fullHive = getFullHiveName(hive);
    var oldPsPath = fullHive + '\\' + oldPath;
    var newKeyName = newPath.split('\\').pop();

    // Rename using PowerShell: create new key, copy values, delete old
    var psCommand = 'Rename-Item -Path "Registry::' + oldPsPath + '" -NewName "' + newKeyName + '"';

    dbg('renameKey PS command: ' + psCommand);
    runPowerShell(psCommand, function(err, stdout, stderr) {
        if (err) {
            dbg('renameKey error: ' + stderr);
            sendResult('renameKey', false, stderr, null, sessionid);
        } else {
            dbg('renameKey success: ' + oldPsPath + ' -> ' + newKeyName);
            sendResult('renameKey', true, null, {
                hive: hive,
                oldPath: oldPath,
                newPath: newPath
            }, sessionid);
        }
    });
}

/**
 * Search for keys/values matching a pattern using PowerShell
 */
function doSearch(hive, path, pattern, searchType, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('search', false, 'Platform not supported', null, sessionid);
        return;
    }

    var fullHive = getFullHiveName(hive);
    var basePath = fullHive + (path ? '\\' + path : '');
    var searchBoth = (searchType === 'both' || searchType === undefined);
    var searchKeys = (searchType === 'keys' || searchBoth);
    var searchValues = (searchType === 'values' || searchBoth);
    var maxResults = 500;

    // Use reg query which is simpler and more reliable
    var psCommand = '';
    
    if (searchKeys) {
        // Use reg query to list all keys recursively, then filter in PowerShell
        psCommand = 
            'Write-Host "START_SEARCH"; ' +
            '$ErrorActionPreference = "SilentlyContinue"; ' +
            '$keys = reg query "' + basePath + '" /s 2>$null | Select-String -Pattern "HKEY_"; ' +
            '$keys = $keys | ForEach-Object { $_ -replace "HKEY_LOCAL_MACHINE\\\\", "" -replace "HKEY_CURRENT_USER\\\\", "" -replace "HKEY_CLASSES_ROOT\\\\", "" -replace "HKEY_USERS\\\\", "" -replace "HKEY_CURRENT_CONFIG\\\\", "" }; ' +
            '$keys = $keys | Where-Object { $_ -match [regex]::escape("' + pattern + '") } | Select-Object -First ' + maxResults + '; ' +
            '$keys | ForEach-Object { "KEY:$_" }; ' +
            'Write-Host "END_SEARCH";';
    } else {
        // Just return empty for values (simpler for now)
        psCommand = 'Write-Host "START_SEARCH"; Write-Host "END_SEARCH";';
    }

    dbg('search PS command: ' + psCommand);

    runPowerShell(psCommand, function(err, stdout, stderr) {
        dbg('search PS stdout len: ' + (stdout ? stdout.length : 0));
        dbg('search PS stderr: ' + (stderr || 'null'));
        dbg('search PS err code: ' + (err ? (err.code || err.message || '1') : '0'));
        
        // If no stdout but there's output in stderr, try to parse that
        var output = stdout || stderr || '';
        
        try {
            var lines = output.split('\n');
            var resultKeys = [];
            var resultValues = [];

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('KEY:') === 0 && line.length > 4) {
                    var keyPath = line.substring(4);
                    // Skip if it's just the hive name
                    if (keyPath && keyPath !== fullHive && keyPath.length > 0) {
                        resultKeys.push({
                            hive: hive,
                            path: keyPath
                        });
                    }
                }
            }

            dbg('search found: ' + resultKeys.length + ' keys');
            sendResult('search', true, null, {
                keys: resultKeys,
                values: resultValues
            }, sessionid);
        } catch (e) {
            dbg('search parse error: ' + e.message);
            sendResult('search', false, e.message, null, sessionid);
        }
    });
}

/**
 * Export a registry branch using PowerShell
 */
function doExportBranch(hive, path, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('exportBranch', false, 'Platform not supported', null, sessionid);
        return;
    }

    var fullHive = getFullHiveName(hive);
    var psPath = fullHive + '\\' + path;
    
    // Use a proper random filename
    var randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    var tempFile = process.env['TEMP'] + '\\regedit_' + randomId + '.reg';
    var tempFileUtf8 = tempFile + '.utf8';
    
    // First: run reg export via cmd /c
    var psCommand = 'cmd /c "reg export \\"' + psPath + '\\" \\"' + tempFile + '\\" /y 2>&1"';
    
    dbg('exportBranch: ' + psPath + ', temp: ' + tempFile);

    // Cleanup function to ensure temp files are removed
    function cleanup() {
        try {
            var fs = require('fs');
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            if (fs.existsSync(tempFileUtf8)) {
                fs.unlinkSync(tempFileUtf8);
            }
            dbg('exportBranch: cleaned up temp files');
        } catch (e) {
            dbg('exportBranch: cleanup error: ' + e.message);
        }
    }

    runPowerShell(psCommand, function(err, stdout, stderr) {
        dbg('exportBranch reg export callback: err=' + (err ? err.message : 'null'));
        
        var fs = require('fs');
        
        try {
            // Check if temp file was created
            if (!fs.existsSync(tempFile)) {
                dbg('exportBranch: temp file not found');
                sendResult('exportBranch', false, 'Export failed: Could not create export file. Try a smaller key or check permissions.', null, sessionid);
                return;
            }
            
            var stats = fs.statSync(tempFile);
            dbg('exportBranch: temp file exists, size=' + stats.size);
            
            // Check if file is too large (> 50MB)
            if (stats.size > 50 * 1024 * 1024) {
                dbg('exportBranch: file too large');
                cleanup();
                sendResult('exportBranch', false, 'Export file too large. Try exporting a smaller subkey.', null, sessionid);
                return;
            }
            
            if (stats.size === 0) {
                dbg('exportBranch: temp file is empty');
                cleanup();
                sendResult('exportBranch', false, 'Export file is empty. The key may be inaccessible.', null, sessionid);
                return;
            }
            
            // Second: convert UTF16 to UTF8 using PowerShell
            var psConvert = 'Get-Content "' + tempFile + '" -Encoding Unicode | Out-File -Encoding UTF8 -FilePath "' + tempFileUtf8 + '"';
            
            dbg('exportBranch: converting encoding...');
            
            runPowerShell(psConvert, function(err2, stdout2, stderr2) {
                dbg('exportBranch convert callback: err=' + (err2 ? err2.message : 'null'));
                
                try {
                    // Read the UTF8 converted file
                    if (!fs.existsSync(tempFileUtf8)) {
                        dbg('exportBranch: UTF8 file not found');
                        // Try reading original file as fallback
                        var content = fs.readFileSync(tempFile).toString('utf8');
                        cleanup();
                        sendResult('exportBranch', true, null, {
                            hive: hive,
                            path: path,
                            content: content
                        }, sessionid);
                        return;
                    }
                    
                    var content = fs.readFileSync(tempFileUtf8, 'utf8').toString();
                    
                    // Clean up both temp files
                    cleanup();
                    
                    dbg('exportBranch success, content length: ' + content.length);
                    sendResult('exportBranch', true, null, {
                        hive: hive,
                        path: path,
                        content: content
                    }, sessionid);
                } catch (e2) {
                    dbg('exportBranch UTF8 read error: ' + e2.message);
                    cleanup();
                    sendResult('exportBranch', false, e2.message, null, sessionid);
                }
            });
            
        } catch (e) {
            dbg('exportBranch error: ' + e.message);
            cleanup();
            sendResult('exportBranch', false, e.message, null, sessionid);
        }
    });
}

/**
 * Import a registry branch from .reg file content
 */
function doImportBranch(hive, path, content, sessionid) {
    if (process.platform !== 'win32') {
        sendResult('importBranch', false, 'Platform not supported', null, sessionid);
        return;
    }

    if (!content) {
        sendResult('importBranch', false, 'No content to import', null, sessionid);
        return;
    }

    var fullHive = getFullHiveName(hive);
    
    // Use a proper random filename
    var randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    var tempFile = process.env['TEMP'] + '\\regedit_import_' + randomId + '.reg';
    
    dbg('importBranch: hive=' + fullHive + ', path=' + path + ', content len=' + content.length);

    // Cleanup function
    function cleanup() {
        try {
            var fs = require('fs');
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
                dbg('importBranch: cleaned up temp file');
            }
        } catch (e) {
            dbg('importBranch: cleanup error: ' + e.message);
        }
    }

    // Write content to temp file
    var fs = require('fs');
    try {
        fs.writeFileSync(tempFile, content);
        dbg('importBranch: temp file written');
    } catch (e) {
        dbg('importBranch: write error: ' + e.message);
        sendResult('importBranch', false, 'Failed to write temp file: ' + e.message, null, sessionid);
        return;
    }

    // Run reg import via cmd /c
    var psCommand = 'cmd /c \'reg import \\"' + tempFile + '\\" 2>&1\'';
    dbg('importBranch: running command: ' + psCommand);
    runPowerShell(psCommand, function(err, stdout, stderr) {
        dbg('importBranch callback: err=' + (err ? err.message : 'null') + ', stdout=' + (stdout ? stdout.substring(0, 200) : 'null') + ', stderr=' + (stderr || 'null'));
        
        // Clean up temp file
        cleanup();
        
        if (err) {
            dbg('importBranch error: ' + (stderr || err));
            sendResult('importBranch', false, stderr || err, null, sessionid);
            return;
        }
        
        // Check for error messages in stdout
        if (stdout && stdout.toLowerCase().indexOf('error') >= 0) {
            dbg('importBranch error in output: ' + stdout);
            sendResult('importBranch', false, stdout, null, sessionid);
            return;
        }
        
        dbg('importBranch success');
        sendResult('importBranch', true, null, {
            hive: hive,
            path: path
        }, sessionid);
    });
}

function doUserSidsToProfiles(sessionid) {
    if (process.platform !== 'win32') {
        sendResult('userSidsToProfiles', false, 'Platform not supported', null, sessionid);
        return;
    }

    var psCommand = "@(Get-ItemProperty -Path 'Registry::HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\*' -ErrorAction Ignore | Where-Object { $_.ProfileImagePath } | Select-Object @{Name='SID';Expression={$_.PSChildName}}, @{Name='Username';Expression={Split-Path $_.ProfileImagePath -Leaf}}) | ConvertTo-Json -Compress";
    dbg('userSidsToProfiles PS command: ' + psCommand);
    runPowerShell(psCommand, function(err, stdout, stderr) {
        if (err) {
            dbg('userSidsToProfiles error: ' + (err.message || err));
            sendResult('userSidsToProfiles', false, err.message || stderr || 'Unknown error', null, sessionid);
            return;
        }
        try {
            var result = JSON.parse(stdout);
            sendResult('userSidsToProfiles', true, null, result, sessionid);
        } catch (e) {
            dbg('userSidsToProfiles parse error: ' + e.message + ', output: ' + stdout);
            sendResult('userSidsToProfiles', false, 'Failed to parse output: ' + e.message, null, sessionid);
        }
    })
}

/**
 * Run a PowerShell command and return result
/**
 * Run a PowerShell command and return result
 * Uses cmd.exe with redirection to capture output
 */
function runPowerShell(command, callback) {
    command = 'if (-not (Test-Path HKU:\\)) { New-PSDrive -Name HKU -PSProvider Registry -Root HKEY_USERS | Out-Null };' + command;
    //dbg("PWSH Test -> Entered")
    var Xerr = null;
    var Xstdout = null;
    var Xstderr = null;
    var child = require('child_process').execFile(
        process.env['windir'] + '\\system32\\WindowsPowerShell\\v1.0\\powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd: process.env['TEMP'] },
        function(err, stdout, stderr) {
            Xerr = err;
            Xstdout = stdout;
            Xstderr = stderr;
            //dbg("PWSH Internal Test -> Callback complete with err=" + err + ", stdout=" + stdout + ", stderr=" + stderr);
        }
    );
    child.stdout.str = '';
    child.stdout.on('data', function (chunk) { this.str += chunk.toString(); });
    //child.stdin.write("echo ~\nexit\n");
    child.waitExit();

    Xstdout = child.stdout.str.trim();
    dbg("PWSH -> 2L Callback with err=" + Xerr + ", stdout=" + Xstdout + ", stderr=" + Xstderr);
    callback(Xerr, Xstdout, Xstderr);

    //dbg('Test PS command: ' + command);
    //dbg('Test PS output: ' + child.stdout.str.trim());
}

/**
 * Send result back to server with sessionid for proper routing
 */
function sendResult(action, success, error, data, sessionid) {
    dbg('Sending result: ' + action + ', success: ' + success + ', sessionid: ' + sessionid);
    
    mesh.SendCommand({
        action: 'plugin',
        plugin: 'regedit',
        pluginaction: action + 'Result',
        success: success,
        error: error,
        data: data,
        sessionid: sessionid
    });
}

module.exports = { consoleaction: consoleaction };
