# Automatic Facebook Page Detection

This document explains the automatic Facebook Page detection feature implemented in the MCP server.

## Overview

The system now automatically detects Facebook Pages accessible to your account and uses them for ad creation, eliminating the need to manually configure `FB_PAGE_ID` in most cases.

## How It Works

### 1. Automatic Detection Process

When creating ads, the system follows this logic:

1. **Check Environment Variable**: First checks if `FB_PAGE_ID` is set in environment variables
2. **Auto-detect Pages**: If not set, calls Facebook Graph API `/me/accounts` to get accessible pages
3. **Smart Selection**: Prefers pages with `ADVERTISE` permission, falls back to any available page
4. **Graceful Fallback**: Uses environment variable or shows clear error message

### 2. New MCP Tool: `get_pages`

A new tool is available to inspect accessible pages:

```bash
# Get all accessible Facebook Pages
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_pages",
      "arguments": {
        "limit": 10
      }
    }
  }'
```

## Configuration

### Option 1: Automatic Detection (Recommended)
No configuration needed! The system will automatically detect and use available pages.

### Option 2: Manual Configuration (Fallback)
Set the environment variable for guaranteed behavior:

```bash
# In .env file
FB_PAGE_ID=your_facebook_page_id_here
```

## Permissions Required

For automatic detection to work, your Facebook access token needs:

- `pages_show_list`: Access to list Pages you manage
- `ads_management`: Create and manage ads (already required)

## Error Handling

The system provides clear error messages when:

1. **No pages found and FB_PAGE_ID not set**:
   ```
   No Facebook Pages accessible and FB_PAGE_ID not set. Please either:
   1. Set FB_PAGE_ID environment variable with a valid page ID
   2. Ensure your access token has "pages_show_list" permission
   3. Associate at least one Facebook Page with your account
   ```

2. **No pages but FB_PAGE_ID is set**: Uses the environment variable seamlessly

## Logging

The system provides detailed logs about page detection:

- `🔍 FB_PAGE_ID not set, attempting to auto-detect Facebook Pages...`
- `📄 Page: "Page Name" (123456789) - Tasks: [MANAGE, ADVERTISE]`
- `🎯 Auto-selected Page: "Page Name" (123456789) - Tasks: [MANAGE, ADVERTISE]`
- `📋 Using configured Page ID from environment: 123456789`

## Benefits

1. **Zero Configuration**: Works out of the box for most users
2. **Flexible**: Falls back to manual configuration when needed  
3. **Transparent**: Clear logging and error messages
4. **Smart Selection**: Prefers pages with advertising permissions
5. **Backward Compatible**: Existing configurations continue to work

## Testing

To test the page detection:

```bash
cd mcp-servers/facebook-mcp
node -e "
const { FacebookService } = require('./dist/services/FacebookService.js');
new FacebookService().getPages().then(pages => {
  console.log('Found', pages.length, 'pages');
  pages.forEach(p => console.log(' -', p.name, p.id));
});
"
```
