# Facebook Account Manager

A comprehensive Facebook advertising account management system powered by AI and Model Context Protocol (MCP) servers. This system provides an intuitive interface for managing Facebook accounts, campaigns, and performance metrics with AI-driven automation.

## 🚀 Features

### Frontend Interface
- **Account Dashboard**: View all Facebook accounts with key metrics (CTR, CPM, Budget, Spend)
- **Detailed Account View**: Deep dive into individual account performance
- **Real-time Metrics**: Live updates of campaign performance data
- **Responsive Design**: Modern UI built with React/Next.js and Tailwind CSS

### AI Command Center
- **Natural Language Commands**: Give instructions to AI in plain English
- **Smart Campaign Management**: AI can create, update, and optimize campaigns
- **Action Logging**: Complete log of AI actions with reasoning
- **Quick Commands**: Pre-built templates for common tasks

### MCP Integration
- **Facebook MCP Server**: Direct integration with Facebook Marketing API
- **Extensible Architecture**: Ready for Octo Browser, Keitaro, and master MCP servers
- **Real-time Communication**: Live data sync between frontend and MCP servers

## 🏗️ Architecture

```
fb-account-manager/
├── frontend/                 # Next.js React application
│   ├── app/                 # Next.js app directory
│   ├── components/          # React components
│   └── lib/                # Utilities and helpers
├── mcp-servers/             # MCP server implementations
│   └── facebook-mcp/       # Facebook Marketing API MCP server
└── shared/                  # Shared types and utilities
    ├── types/              # TypeScript type definitions
    └── utils/              # Shared utility functions
```

## 🔧 Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Facebook Developer Account (for production use)

### Setup

1. **Clone and install dependencies:**
```bash
git clone <repository>
cd fb-account-manager
npm install
```

2. **Set up Facebook API credentials:**
   - Create a Facebook App at [developers.facebook.com](https://developers.facebook.com)
   - Add Marketing API permissions
   - Get your App ID, App Secret, and Access Token
   - Create `.env` file in `mcp-servers/facebook-mcp/`:

```bash
FB_APP_ID=your_facebook_app_id
FB_APP_SECRET=your_facebook_app_secret
FB_ACCESS_TOKEN=your_facebook_access_token
```

3. **Install dependencies for each component:**
```bash
# Install frontend dependencies
cd frontend && npm install

# Install MCP server dependencies
cd ../mcp-servers/facebook-mcp && npm install
```

## 🚦 Quick Start

### Development Mode
Start both frontend and MCP server in development mode:
```bash
npm run dev
```

This will start:
- Frontend: `http://localhost:3000`
- Facebook MCP Server: `stdio` mode for MCP communication

### Individual Components

**Frontend only:**
```bash
npm run dev:frontend
```

**MCP Server only:**
```bash
npm run dev:mcp
```

### Production Mode
```bash
npm run build
npm start
```

## 📊 Dashboard Features

### Account Overview
- **Account Status**: Active, inactive, limited, or disabled accounts
- **Key Metrics Display**: CTR, CPM, CPC, Spend, Budget utilization
- **Campaign Count**: Active vs total campaigns per account
- **Budget Progress**: Visual progress bars showing spend vs budget

### AI Command Interface
Give natural language commands like:
- "Create a traffic campaign for US users with $100 daily budget"
- "Pause all underperforming campaigns with CTR below 1%"
- "Increase budget by 20% for campaigns with CTR above 3%"
- "Create lookalike audience based on website visitors"

### Action Logging
Every AI action is logged with:
- **Timestamp**: When the action was taken
- **Action Type**: Campaign creation, budget adjustment, etc.
- **Reasoning**: Why the AI took this action
- **Parameters**: Technical details of what was changed
- **Result**: Success, error, or pending status
- **Execution Time**: How long the action took

## 🔌 MCP Server API

The Facebook MCP Server provides these tools:

### Account Management
- `get_accounts`: Retrieve accounts with metrics
- `get_insights`: Get performance data at any level

### Campaign Operations  
- `get_campaigns`: List campaigns for an account
- `create_campaign`: Create new advertising campaigns
- `update_campaign`: Modify existing campaigns

### Example MCP Tool Call:
```json
{
  "tool": "create_campaign",
  "arguments": {
    "accountId": "act_123456789",
    "name": "Holiday Sales 2024",
    "objective": "TRAFFIC",
    "dailyBudget": 5000,
    "targeting": {
      "geoLocations": {
        "countries": ["US", "CA"]
      },
      "ageMin": 25,
      "ageMax": 45
    }
  }
}
```

## 🔮 Future Roadmap

### Phase 1 (Current)
- ✅ Basic Facebook account management interface
- ✅ Facebook MCP server with core functionality
- ✅ AI command center with action logging

### Phase 2 (Planned)
- [ ] Octo Browser MCP server integration
- [ ] Keitaro tracker MCP server
- [ ] Advanced campaign optimization algorithms
- [ ] Multi-account bulk operations

### Phase 3 (Future)
- [ ] Master MCP server to coordinate all services
- [ ] Advanced AI decision-making engine
- [ ] Automated campaign optimization
- [ ] Custom reporting and analytics

## 🛠️ Development

### Project Structure
```
frontend/                    # React/Next.js frontend
├── app/                    # App router pages
├── components/             # React components
│   ├── Sidebar.tsx        # Account navigation
│   ├── AccountsGrid.tsx   # Account dashboard
│   ├── AICommandCenter.tsx # AI interface
│   └── AIActionLog.tsx    # Action history
└── lib/                   # Utilities

mcp-servers/facebook-mcp/   # Facebook MCP server
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── services/          # Facebook API service
│   ├── types/             # TypeScript definitions
│   └── utils/             # Utilities
```

### Technologies Used
- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js, TypeScript, MCP SDK
- **APIs**: Facebook Marketing API
- **UI Components**: Headless UI, Heroicons
- **Styling**: Tailwind CSS with custom Facebook-themed colors

### Development Guidelines
- All components are fully typed with TypeScript
- Mock data available for development without Facebook API
- Comprehensive error handling and logging
- Responsive design for all screen sizes

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the documentation in each component's README
2. Review the logs in `mcp-servers/facebook-mcp/logs/`
3. Open an issue with detailed information about the problem
