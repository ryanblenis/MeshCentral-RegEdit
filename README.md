# MeshCentral-RegEdit

A Windows Registry Explorer/Editor plugin for [MeshCentral2](https://github.com/Ylianst/MeshCentral). Browse, view, edit, create, rename, delete, import, and export Windows registry keys and values directly from the MeshCentral web interface.

## Installation

Pre-requisite: First, make sure you have plugins enabled for your MeshCentral installation:

```json
"plugins": {
    "enabled": true
}
```

Restart your MeshCentral server after making this change.

To install, simply add the plugin configuration URL when prompted:
`https://raw.githubusercontent.com/ryanblenis/MeshCentral-RegEdit/master/config.json`

## Features

- **Browse Registry**: Navigate through all Windows registry hives (HKLM, HKCU, HKCR, HKU, HKCC)
- **View Values**: Display all registry values with their types and data
- **Edit Values**: Modify existing registry values including name, type, and data
- **Create Keys/Values**: Create new registry keys and values
- **Rename**: Rename registry keys and values
- **Delete**: Delete registry keys (with all subkeys) and values
- **Export**: Export registry branches to .reg format for backup/restore

## Usage Notes

- Left panel shows the registry key tree
- Right panel shows values for the selected key
- Click a key name to select it and view its values in the right panel
- Right-click on keys or values for context menu options (Edit, Rename, Delete, Export, Refresh)
- Import .reg files from your browser

## Value Types Supported

- REG_SZ (String)
- REG_EXPAND_SZ (Expandable String)
- REG_DWORD (32-bit Integer)
- REG_QWORD (64-bit Integer)
- REG_BINARY (Binary Data)
- REG_MULTI_SZ (Multi-String)

## Requirements

- MeshCentral2 server with plugins enabled
- Windows endpoints with PowerShell support
- Agent must have appropriate registry access permissions

## Important Notes

- This plugin only works with Windows endpoints
- Some registry keys require administrator privileges to modify
- Use caution when editing the registry - incorrect changes can cause system issues
- Always backup important registry keys before making changes

## License

AGPL 3.0
