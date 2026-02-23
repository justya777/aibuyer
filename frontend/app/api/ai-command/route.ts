import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { MCPClient } from '../../../lib/mcp-client';
import { buildSystemPrompt, parseTrackingUrl, containsFacebookMacros } from '../../../lib/campaign-config';
import { AuthRequiredError, TenantAccessError, resolveTenantContext } from '@/lib/tenant-context';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error(
      'OPENAI_API_KEY is missing. Set it in frontend/.env.local or root .env and restart dev server.'
    );
  }

  return new OpenAI({ apiKey });
}

const AICommandSchema = z.object({
  command: z.string(),
  accountId: z.string(),
  businessId: z.string().min(1).optional(),
});

// Facebook MCP Tools definitions for OpenAI
const facebookTools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_campaigns',
      description: 'Get Facebook campaigns for an account with performance insights (CTR, spend, impressions, clicks, etc.). Returns campaign data including status and metrics.',
      parameters: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            description: 'The Facebook Ad Account ID (format: act_XXXXXXXXXX)'
          },
          status: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter campaigns by status: ACTIVE, PAUSED, DELETED'
          }
        },
        required: ['accountId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_campaign',
      description: 'Update an existing Facebook campaign. Can change status (ACTIVE/PAUSED), name, budget, etc.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: {
            type: 'string',
            description: 'The campaign ID to update'
          },
          status: {
            type: 'string',
            description: 'New status: ACTIVE or PAUSED'
          },
          name: {
            type: 'string',
            description: 'New campaign name'
          },
          dailyBudget: {
            type: 'number',
            description: 'New daily budget in cents'
          }
        },
        required: ['campaignId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_campaign',
      description: 'Create a new Facebook advertising campaign',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Facebook Ad Account ID' },
          name: { type: 'string', description: 'Campaign name' },
          objective: { type: 'string', description: 'Campaign objective (e.g., OUTCOME_LEADS)' },
          dailyBudget: { type: 'number', description: 'Daily budget in cents' },
          status: { type: 'string', description: 'Campaign status (ACTIVE, PAUSED)' }
        },
        required: ['accountId', 'name', 'objective', 'dailyBudget', 'status']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_adset',
      description: 'Create a new ad set within a campaign',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Facebook Ad Account ID' },
          campaignId: { type: 'string', description: 'Campaign ID to create ad set in' },
          name: { type: 'string', description: 'Ad set name' },
          optimizationGoal: { type: 'string', description: 'Optimization goal (e.g., LEAD_GENERATION)' },
          billingEvent: { type: 'string', description: 'Billing event (IMPRESSIONS)' },
          promotedObject: {
            type: 'object',
            description: 'Optional promoted object fields for adset requirements',
            properties: {
              pageId: { type: 'string', description: 'Facebook Page ID when required by objective' }
            }
          },
          bidAmount: { type: 'number', description: 'Bid amount in cents' },
          status: { type: 'string', description: 'Ad set status' },
          targeting: {
            type: 'object',
            description: 'Targeting parameters including location, demographics, interests, and language.',
            properties: {
              geoLocations: {
                type: 'object',
                properties: {
                  countries: { type: 'array', items: { type: 'string' }, description: 'Country codes for targeting (e.g., ["RO"] for Romania, ["US"] for USA)' }
                }
              },
              ageMin: { type: 'number' },
              ageMax: { type: 'number' },
              genders: { type: 'array', items: { type: 'number' }, description: '1 for male, 2 for female' },
              interests: { type: 'array', items: { type: 'string' } },
              locales: { type: 'array', items: { type: 'string' }, description: 'Language codes for targeting (2-letter ISO codes). IMPORTANT: Use string codes like "ro" for Romanian, NOT numeric IDs. Common codes: ro=Romanian, en=English, es=Spanish, fr=French, de=German, it=Italian, pt=Portuguese, ru=Russian, pl=Polish. Example: For Romanian language use locales: ["ro"]' }
            }
          }
        },
        required: ['accountId', 'campaignId', 'name', 'optimizationGoal', 'billingEvent', 'status']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_ad',
      description: 'Create a new Facebook ad with creative content',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Facebook Ad Account ID' },
          adSetId: { type: 'string', description: 'Ad Set ID to attach the ad to' },
          name: { type: 'string', description: 'Ad name' },
          status: { type: 'string', description: 'Ad status (ACTIVE, PAUSED)' },
          creative: {
            type: 'object',
            description: 'Ad creative content',
            properties: {
              pageId: { type: 'string', description: 'Optional explicit Facebook Page ID (tenant-allowed only)' },
              title: { type: 'string', description: 'Ad headline/title' },
              body: { type: 'string', description: 'Ad body text' },
              linkUrl: { type: 'string', description: 'Landing page URL (base URL without query parameters). If user provides full URL with tracking params, this will be auto-extracted.' },
              urlParameters: { type: 'string', description: 'URL tracking parameters (e.g., utm_campaign={{campaign.name}}&pixel=test). Auto-extracted from linkUrl if provided with query string.' },
              callToAction: { type: 'string', description: 'Call to action button (LEARN_MORE, SIGN_UP, etc.)' },
              imageUrl: { type: 'string', description: 'Image URL (optional)' },
              videoUrl: { type: 'string', description: 'Video URL (optional)' },
              displayLink: { type: 'string', description: 'Display link text (optional)' }
            },
            required: ['linkUrl']
          }
        },
        required: ['accountId', 'adSetId', 'name', 'status', 'creative']
      }
    }
  },
  // Duplicate tools - use Facebook's native /copies endpoint for efficient duplication
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_campaign',
      description: 'Duplicate an existing Facebook campaign with all its ad sets and ads using Facebook native API. PREFERRED method for duplicating campaigns - much faster and more reliable than manually recreating.',
      parameters: {
        type: 'object',
        properties: {
          campaignId: { type: 'string', description: 'Campaign ID to duplicate' },
          deepCopy: { type: 'boolean', description: 'Copy all child objects (ad sets, ads). Default: true' },
          renameStrategy: { type: 'string', enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'], description: 'How to rename duplicated objects. Default: ONLY_TOP_LEVEL_RENAME' },
          renameSuffix: { type: 'string', description: 'Suffix to add to duplicated names. Default: " (Copy)"' },
          renamePrefix: { type: 'string', description: 'Prefix to add to duplicated names' },
          statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], description: 'Status for duplicated objects. Default: PAUSED' }
        },
        required: ['campaignId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_adset',
      description: 'Duplicate an existing Facebook ad set with all its ads using Facebook native API. Can optionally move to a different campaign.',
      parameters: {
        type: 'object',
        properties: {
          adSetId: { type: 'string', description: 'Ad set ID to duplicate' },
          campaignId: { type: 'string', description: 'Target campaign ID (optional - if moving to different campaign)' },
          deepCopy: { type: 'boolean', description: 'Copy all child objects (ads). Default: true' },
          renameStrategy: { type: 'string', enum: ['DEEP_RENAME', 'ONLY_TOP_LEVEL_RENAME', 'NO_RENAME'], description: 'How to rename duplicated objects' },
          renameSuffix: { type: 'string', description: 'Suffix to add to duplicated names' },
          renamePrefix: { type: 'string', description: 'Prefix to add to duplicated names' },
          statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], description: 'Status for duplicated objects' }
        },
        required: ['adSetId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'duplicate_ad',
      description: 'Duplicate an existing Facebook ad using Facebook native API. Can optionally move to a different ad set.',
      parameters: {
        type: 'object',
        properties: {
          adId: { type: 'string', description: 'Ad ID to duplicate' },
          adSetId: { type: 'string', description: 'Target ad set ID (optional - if moving to different ad set)' },
          renameStrategy: { type: 'string', enum: ['NO_RENAME', 'ONLY_TOP_LEVEL_RENAME'], description: 'How to rename duplicated ad' },
          renameSuffix: { type: 'string', description: 'Suffix to add to duplicated name' },
          renamePrefix: { type: 'string', description: 'Prefix to add to duplicated name' },
          statusOption: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'], description: 'Status for duplicated ad' }
        },
        required: ['adId']
      }
    }
  }
];

export async function POST(request: NextRequest) {
  try {
    const context = await resolveTenantContext(request);
    const openai = getOpenAIClient();
    const body = await request.json();
    const { command, accountId, businessId } = AICommandSchema.parse(body);

    const mcpClient = new MCPClient(context);
    const appBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const internalHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'x-tenant-id': context.tenantId,
    };
    const requestCookie = request.headers.get('cookie');
    if (requestCookie) {
      internalHeaders['cookie'] = requestCookie;
    }

    // Fetch available materials for this account
    let availableMaterials: any[] = [];
    let commandMaterials: any[] = []; // Materials uploaded with this command
    
    try {
      // First try to get materials filtered by account name
      const materialsResponse = await fetch(`${appBaseUrl}/api/get-materials?adName=${encodeURIComponent(accountId)}`, {
        method: 'GET',
        headers: internalHeaders,
      });
      if (materialsResponse.ok) {
        const materialsData = await materialsResponse.json();
        availableMaterials = materialsData.materials || [];
        console.log(`📎 Found ${availableMaterials.length} materials filtered by account ${accountId}`);
      }
      
      // If no materials found, fetch ALL materials without filter
      if (availableMaterials.length === 0) {
        console.log(`📎 No filtered materials, fetching ALL materials...`);
        const allMaterialsResponse = await fetch(`${appBaseUrl}/api/get-materials`, {
          method: 'GET',
          headers: internalHeaders,
        });
        if (allMaterialsResponse.ok) {
          const allMaterialsData = await allMaterialsResponse.json();
          availableMaterials = allMaterialsData.materials || [];
          console.log(`📎 Found ${availableMaterials.length} total materials (unfiltered)`);
          if (availableMaterials.length > 0) {
            console.log(`📎 Available materials:`, availableMaterials.map((m: any) => `${m.originalName} (${m.category}): ${m.fileUrl}`).join('\n'));
          }
        }
      }
      
      // Smart material detection: Check for recently uploaded materials (within last 10 minutes)
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      
      const recentMaterials = availableMaterials.filter((m: any) => {
        const uploadedAt = new Date(m.uploadedAt);
        return uploadedAt > tenMinutesAgo;
      });
      
      if (recentMaterials.length > 0) {
        console.log(`📎 Detected ${recentMaterials.length} recently uploaded materials (within last 10 minutes):`, 
          recentMaterials.map((m: any) => m.originalName).join(', '));
      }
      
      // Check if command explicitly mentions uploaded files
      const commandLower = command.toLowerCase();
      const hasUploadedWithCommand = commandLower.includes('uploaded files') || 
                                   commandLower.includes('uploaded materials') ||
                                   commandLower.includes('use them from uploaded') ||
                                   commandLower.includes('with uploaded') ||
                                   commandLower.includes('use uploaded');
      
      // Check if command mentions specific filenames
      const hasSpecificFilenames = availableMaterials.some((m: any) => 
        commandLower.includes(m.originalName.toLowerCase()) || 
        commandLower.includes(m.filename.toLowerCase())
      );
      
      // Auto-select materials:
      // Priority: 1. Specific filenames, 2. Recent uploads, 3. Any available materials
      if (hasSpecificFilenames) {
        // Use only materials mentioned by filename
        commandMaterials = availableMaterials.filter((m: any) => 
          commandLower.includes(m.originalName.toLowerCase()) || 
          commandLower.includes(m.filename.toLowerCase())
        );
        console.log(`📎 SPECIFIC FILENAME MODE: Using ${commandMaterials.length} materials mentioned in command`);
      } else if (recentMaterials.length > 0) {
        // Use recently uploaded materials (prioritize most recent)
        commandMaterials = recentMaterials.slice(0, 5);
        console.log(`📎 AUTO-SELECT MODE: ${commandMaterials.length} recently uploaded materials will be automatically used`);
      } else if (hasUploadedWithCommand) {
        // Command mentions upload - use all available
        commandMaterials = availableMaterials.slice(0, 5);
        console.log(`📎 COMMAND MENTIONS UPLOAD: Using ${commandMaterials.length} available materials`);
      } else if (availableMaterials.length > 0) {
        // 🆕 ALWAYS USE AVAILABLE MATERIALS - don't require special keywords
        commandMaterials = availableMaterials.slice(0, 5);
        console.log(`📎 MATERIALS AVAILABLE: Auto-using ${commandMaterials.length} materials for ads`);
      } else {
        console.log(`📎 NO MATERIALS: No materials available to use`);
      }
      
    } catch (error) {
      console.log('ℹ️ No materials found or error fetching materials:', error);
    }

    // Parse material assignments from command
    let materialAssignments = {};
    if (availableMaterials.length > 0) {
      try {
        const assignmentResponse = await fetch(`${appBaseUrl}/api/material-assignment`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({ command, materials: availableMaterials })
        });
        if (assignmentResponse.ok) {
          const assignmentData = await assignmentResponse.json();
          materialAssignments = assignmentData.assignments || {};
          console.log('📎 Material assignments:', materialAssignments);
        }
      } catch (error) {
        console.log('ℹ️ No specific material assignments found');
      }
    }

    let materialsInfo = '';
    
    if (commandMaterials.length > 0) {
      // Auto-select mode: Recently uploaded materials detected
      materialsInfo = `\n\n📎 MATERIALS AVAILABLE FOR USE (Auto-Select Mode):\n${commandMaterials.map((m: any) => `- ${m.originalName} (${m.category.toUpperCase()}) → URL: ${m.fileUrl}`).join('\n')}\n\n🎯 MANDATORY AUTO-SELECT INSTRUCTIONS:\n⚠️ CRITICAL: These materials were recently uploaded and MUST be used in your ads!\n\n🚨 YOU MUST:\n1. Use at least ONE material from the list above in EVERY ad you create\n2. For IMAGE files: Set creative.imageUrl to the EXACT URL from the list\n3. For VIDEO files: Set creative.videoUrl to the EXACT URL from the list\n4. Distribute materials across multiple ads if creating multiple ads\n5. NEVER create an ad without an imageUrl or videoUrl when materials are available\n\n✅ DISTRIBUTION EXAMPLES:\n- If creating 1 ad: Use the first material (${commandMaterials[0]?.originalName})\n- If creating 2 ads: Use first material for ad1, second for ad2\n- If creating 3+ ads: Distribute all materials across ads\n\n🚨 CRITICAL URL RULES:\n- NEVER make up URLs like "https://path/to/file.jpg" or "https://example.com/image.jpg"\n- NEVER use placeholders or fake URLs\n- ONLY use the EXACT URLs from the materials list above\n- Facebook API will REJECT fake URLs with error "(#100) picture should represent a valid URL"\n- If you don't use a material URL, the ad creation will be incomplete!`;
    } else if (availableMaterials.length > 0) {
      // Specific filename mode: User must specify which materials to use
      materialsInfo = `\n\n📎 AVAILABLE MATERIALS (Specific Filename Mode):\n${availableMaterials.map((m: any) => `- ${m.originalName} (${m.category.toUpperCase()}) → URL: ${m.fileUrl}`).join('\n')}\n\n🎯 SPECIFIC FILENAME INSTRUCTIONS:\n⚠️ User did NOT upload materials with this command - DO NOT auto-select!\n- ONLY use materials if user mentions specific filenames (e.g., "use ad1.mp4")\n- Find the material by original name and use its exact URL\n- If NO specific filenames mentioned, create ads WITHOUT images/videos\n- ALWAYS use the EXACT full URLs from the list above\n\n✅ EXAMPLE: If user says "use ad1.mp4", find material with originalName="ad1.mp4" and use its URL\n🚫 DO NOT: Auto-select materials unless specifically mentioned by filename!\n\n🚨 CRITICAL URL RULES:\n- NEVER make up URLs like "https://path/to/file.jpg" or "https://example.com/image.jpg"\n- NEVER use placeholders or fake URLs\n- ONLY use URLs from the materials list above\n- Facebook API will REJECT fake URLs with error "(#100) picture should represent a valid URL"`;
    } else {
      materialsInfo = '\n\n📎 No materials available. Create ads without images/videos or ask user to upload materials first.';
    }

    // Build structured system prompt using campaign configuration
    const systemPrompt = buildSystemPrompt(
      accountId, 
      materialsInfo, 
      Object.keys(materialAssignments).length > 0 ? materialAssignments : undefined
    );

    const actions: Array<any> = [];
    
    // 🔢 Parse the number of ads requested from the command
    const adsMatch = command.match(/(\d+)\s*ads?/i);
    const requestedAdCount = adsMatch ? parseInt(adsMatch[1]) : 1;
    console.log(`📊 Requested number of ads: ${requestedAdCount}`);
    
    // 🎯 Parse specific material assignments from command (e.g., "use pr.mp4 for first ad, man.jpeg for 2nd")
    const materialAssignmentsList: { adIndex: number; filename: string; material: any }[] = [];
    
    if (commandMaterials.length > 0 && requestedAdCount > 0) {
      const commandLower = command.toLowerCase();
      
      // Try to find explicit material assignments using regex patterns
      // Pattern: "use X for first ad" or "X for 1st" or "X for ad 1"
      const positionPatterns = [
        { pattern: /use\s+(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:first|1st|ad\s*1)/gi, adIndex: 0 },
        { pattern: /(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:first|1st|ad\s*1)/gi, adIndex: 0 },
        { pattern: /use\s+(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:second|2nd|ad\s*2)/gi, adIndex: 1 },
        { pattern: /(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:second|2nd|ad\s*2)/gi, adIndex: 1 },
        { pattern: /use\s+(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:third|3rd|ad\s*3)/gi, adIndex: 2 },
        { pattern: /(\S+\.(?:mp4|mov|jpg|jpeg|png|gif))\s+for\s+(?:the\s+)?(?:third|3rd|ad\s*3)/gi, adIndex: 2 },
      ];
      
      const assignedIndices = new Set<number>();
      const assignedMaterials = new Set<string>();
      
      for (const { pattern, adIndex } of positionPatterns) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        let match;
        
        while ((match = pattern.exec(commandLower)) !== null) {
          const mentionedFilename = match[1].toLowerCase();
          
          // Skip if this ad position is already assigned
          if (assignedIndices.has(adIndex)) continue;
          
          // Find the matching material
          const matchedMaterial = commandMaterials.find(m => {
            const matFilename = m.originalName.toLowerCase();
            const matNameNoExt = matFilename.replace(/\.[^.]+$/, '');
            return matFilename === mentionedFilename || 
                   matNameNoExt === mentionedFilename.replace(/\.[^.]+$/, '') ||
                   matFilename.includes(mentionedFilename.replace(/\.[^.]+$/, ''));
          });
          
          if (matchedMaterial && !assignedMaterials.has(matchedMaterial.id)) {
            materialAssignmentsList.push({ 
              adIndex, 
              filename: matchedMaterial.originalName, 
              material: matchedMaterial 
            });
            assignedIndices.add(adIndex);
            assignedMaterials.add(matchedMaterial.id);
            console.log(`📎 Material assignment: "${matchedMaterial.originalName}" → Ad ${adIndex + 1}`);
          }
        }
      }
      
      // If we have requestedAdCount ads but no/incomplete specific assignments, auto-distribute remaining
      if (materialAssignmentsList.length < requestedAdCount && commandMaterials.length > 0) {
        console.log(`📎 Auto-distributing materials: ${materialAssignmentsList.length} assigned, ${requestedAdCount} ads needed`);
        
        for (let i = 0; i < requestedAdCount; i++) {
          // Skip if this ad index already has an assignment
          if (assignedIndices.has(i)) continue;
          
          // Find an unassigned material
          const availableMaterial = commandMaterials.find(m => !assignedMaterials.has(m.id));
          
          if (availableMaterial) {
            materialAssignmentsList.push({ 
              adIndex: i, 
              filename: availableMaterial.originalName, 
              material: availableMaterial 
            });
            assignedIndices.add(i);
            assignedMaterials.add(availableMaterial.id);
            console.log(`📎 Auto-assigned: "${availableMaterial.originalName}" → Ad ${i + 1}`);
          }
        }
      }
      
      // Sort by adIndex to ensure correct order
      materialAssignmentsList.sort((a, b) => a.adIndex - b.adIndex);
    }
    
    console.log(`📎 Total material assignments: ${materialAssignmentsList.length}`);
    
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Parse and execute this command: "${command}"` }
    ];

    let conversationComplete = false;
    let maxIterations = 15; // Increased to allow for multiple ads and bulk operations
    let iteration = 0;
    let campaignId: string | null = null;
    const toolFailureCounts: Record<string, number> = {};
    const MAX_CONSECUTIVE_TOOL_FAILURES = 3;
    let blockingError: string | null = null;
    
    // Detect command type for better handling
    const commandLower = command.toLowerCase();
    const isManagementCommand = 
      commandLower.includes('pause') || 
      commandLower.includes('activate') || 
      commandLower.includes('resume') ||
      commandLower.includes('duplicate') ||
      commandLower.includes('update') ||
      commandLower.includes('change status') ||
      commandLower.includes('change budget') ||
      commandLower.includes('set budget') ||
      commandLower.includes('budget to') ||
      (commandLower.includes('ctr') && (commandLower.includes('below') || commandLower.includes('under')));
    
    console.log(`📋 Command type: ${isManagementCommand ? 'MANAGEMENT' : 'CREATION'}`);
    console.log(`📋 Command: "${command}"`);

    // Multi-turn conversation to handle campaign -> adset creation flow
    while (!conversationComplete && iteration < maxIterations) {
      iteration++;
      console.log(`🔄 Iteration ${iteration}: Making AI request...`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-nano-2025-04-14',
        max_tokens: 4000,
        messages,
        tools: facebookTools,
        tool_choice: 'auto'
      });

      const message = completion.choices[0]?.message;
      if (!message) {
        console.log('❌ No message received from AI');
        break;
      }

      // Add the assistant's message to the conversation
      messages.push(message);

      if (message.tool_calls) {
        const toolResults = [];
        const bundledCreateAdSetTool = message.tool_calls.find(
          (toolCall) => toolCall.function.name === 'create_adset'
        );
        const bundledCreateAdSetArgs = bundledCreateAdSetTool
          ? JSON.parse(bundledCreateAdSetTool.function.arguments)
          : null;
        const inferredCountriesFromCommand = inferEuCountriesFromCommand(command);

        for (const toolCall of message.tool_calls) {
          try {
            console.log(`🔧 Executing tool: ${toolCall.function.name}`);
            let toolArgs = JSON.parse(toolCall.function.arguments);

            if (toolCall.function.name === 'create_campaign') {
              const preflightTargeting =
                bundledCreateAdSetArgs?.targeting ||
                (inferredCountriesFromCommand.length > 0
                  ? { geoLocations: { countries: inferredCountriesFromCommand } }
                  : undefined);
              try {
                await mcpClient.callTool('preflight_create_campaign_bundle', {
                  businessId,
                  accountId: toolArgs.accountId,
                  adSetTargeting: preflightTargeting,
                });
              } catch (preflightError) {
                const preflightMessage =
                  preflightError instanceof Error
                    ? preflightError.message
                    : 'DSA preflight failed for campaign bundle.';
                actions.push({
                  type: 'campaign_preflight',
                  tool: 'preflight_create_campaign_bundle',
                  arguments: {
                    accountId: toolArgs.accountId,
                    adSetTargeting: preflightTargeting,
                  },
                  error: preflightMessage,
                  success: false,
                });
                blockingError = preflightMessage;
                conversationComplete = true;
                break;
              }

            }
            
            // 🛡️ VALIDATION: Fix campaignId for create_adset if it's empty or placeholder
            if (toolCall.function.name === 'create_adset') {
              const invalidCampaignIds = ['', '__campaign_id__', 'ACTUAL_CAMPAIGN_ID', 'ACTUAL_CAMPAIGN_ID_FROM_STEP_1', 'ACTUAL_CAMPAIGN_ID_FROM_create_campaign', 'CAMPAIGN_ID', 'CANNOT_PROCEED_YET', 'CANNOT_PROCEED', 'PENDING', null, undefined];
              
              // Also check if campaignId contains placeholder text patterns
              const isPlaceholder = toolArgs.campaignId && (
                toolArgs.campaignId.startsWith('__') ||
                toolArgs.campaignId.endsWith('__') ||
                toolArgs.campaignId.includes('ACTUAL_') || 
                toolArgs.campaignId.includes('CAMPAIGN_ID') ||
                toolArgs.campaignId.includes('_FROM_') ||
                toolArgs.campaignId.includes('CANNOT_') ||
                toolArgs.campaignId.includes('PENDING') ||
                toolArgs.campaignId.includes('PLACEHOLDER') ||
                !/^\d+$/.test(toolArgs.campaignId) // Must be numeric
              );
              
              if (invalidCampaignIds.includes(toolArgs.campaignId) || !toolArgs.campaignId || isPlaceholder) {
                // Use the stored campaign ID from previous create_campaign call
                if (campaignId) {
                  console.log(`⚠️ AI used invalid campaignId: "${toolArgs.campaignId}" - fixing to: ${campaignId}`);
                  toolArgs.campaignId = campaignId;
                } else {
                  console.log(`❌ AI used invalid campaignId: "${toolArgs.campaignId}" and no campaign ID stored yet`);
                  throw new Error('Cannot create adset: No valid campaign ID available. Please create campaign first.');
                }
              }

              // Policy requires explicit budget for adset creation.
              const hasExplicitBudget =
                toolArgs.dailyBudget != null || toolArgs.lifetimeBudget != null;
              if (!hasExplicitBudget) {
                const campaignAction = actions.find(a => a.tool === 'create_campaign' && a.success);
                const campaignDailyBudget = campaignAction?.result?.budget?.daily;
                const campaignLifetimeBudget = campaignAction?.result?.budget?.lifetime;
                if (campaignDailyBudget != null) {
                  toolArgs.dailyBudget = campaignDailyBudget;
                  console.log(`⚠️ create_adset missing budget - inherited dailyBudget=${campaignDailyBudget} from campaign`);
                } else if (campaignLifetimeBudget != null) {
                  toolArgs.lifetimeBudget = campaignLifetimeBudget;
                  console.log(`⚠️ create_adset missing budget - inherited lifetimeBudget=${campaignLifetimeBudget} from campaign`);
                } else {
                  toolArgs.dailyBudget = 1500;
                  console.log('⚠️ create_adset missing budget - applied fallback dailyBudget=1500');
                }
              }

              const previousAdSetBidError = actions.some(
                (action) =>
                  action.tool === 'create_adset' &&
                  !action.success &&
                  typeof action.error === 'string' &&
                  action.error.includes('Bid amount required')
              );
              const previousAdSetAdvantageAudienceError = actions.some(
                (action) =>
                  action.tool === 'create_adset' &&
                  !action.success &&
                  typeof action.error === 'string' &&
                  action.error.includes('Advantage audience flag required')
              );
              if (previousAdSetBidError) {
                const numericBidAmount =
                  typeof toolArgs.bidAmount === 'number'
                    ? toolArgs.bidAmount
                    : Number(toolArgs.bidAmount);
                if (!Number.isFinite(numericBidAmount) || numericBidAmount <= 0) {
                  const numericDailyBudget = Number(toolArgs.dailyBudget ?? 0);
                  const derivedBidAmount =
                    Number.isFinite(numericDailyBudget) && numericDailyBudget > 0
                      ? Math.max(100, Math.floor(numericDailyBudget * 0.2))
                      : 300;
                  toolArgs.bidAmount = derivedBidAmount;
                  console.log(
                    `⚠️ Previous create_adset failed with bid requirement - applied fallback bidAmount=${derivedBidAmount}`
                  );
                }
              }

              // Normalize advantage audience controls into targeting.targetingAutomation so MCP schema keeps it.
              if (toolArgs.targeting?.advantage_audience != null) {
                const normalizedAdvantageAudience =
                  Number(toolArgs.targeting.advantage_audience) === 1 ? 1 : 0;
                toolArgs.targeting.targetingAutomation = {
                  ...(toolArgs.targeting.targetingAutomation || {}),
                  advantageAudience: normalizedAdvantageAudience,
                };
                delete toolArgs.targeting.advantage_audience;
                console.log(
                  `⚠️ Normalized targeting.advantage_audience to targeting.targetingAutomation.advantageAudience=${normalizedAdvantageAudience}`
                );
              }
              if (previousAdSetAdvantageAudienceError && !toolArgs.targeting?.targetingAutomation) {
                toolArgs.targeting = {
                  ...(toolArgs.targeting || {}),
                  targetingAutomation: {
                    advantageAudience: 0,
                  },
                };
                console.log(
                  '⚠️ Previous create_adset failed with Advantage Audience requirement - applied targetingAutomation.advantageAudience=0'
                );
              }

              const campaignAction = actions.find(a => a.tool === 'create_campaign' && a.success);
              const campaignObjective = campaignAction?.result?.objective;
              const isLeadsObjective = campaignObjective === 'OUTCOME_LEADS';
              if (isLeadsObjective) {
                // Keep an objective-safe optimization goal for leads.
                if (
                  !toolArgs.optimizationGoal ||
                  toolArgs.optimizationGoal === 'LEADS' ||
                  toolArgs.optimizationGoal === 'LEAD_GENERATION'
                ) {
                  toolArgs.optimizationGoal = 'LEAD_GENERATION';
                  console.log('⚠️ Applied optimizationGoal=LEAD_GENERATION for OUTCOME_LEADS campaign');
                }
                if (!toolArgs.billingEvent) {
                  toolArgs.billingEvent = 'IMPRESSIONS';
                  console.log('⚠️ Applied default billingEvent=IMPRESSIONS for OUTCOME_LEADS campaign');
                }

                // Page resolution is handled by backend tenant defaults / resolver.
              }

              // Meta frequently rejects locale targeting passed as short strings.
              // Keep this flow resilient: remove locales from AI adset payload.
              if (toolArgs.targeting?.locales) {
                delete toolArgs.targeting.locales;
                console.log('⚠️ Removed targeting.locales to avoid invalid locale parameter errors');
              }

              console.log(
                'ℹ️ create_adset sanitized payload',
                JSON.stringify(
                  {
                    accountId: toolArgs.accountId,
                    campaignId: toolArgs.campaignId,
                    optimizationGoal: toolArgs.optimizationGoal,
                    billingEvent: toolArgs.billingEvent,
                    dailyBudget: toolArgs.dailyBudget,
                    lifetimeBudget: toolArgs.lifetimeBudget,
                    bidAmount: toolArgs.bidAmount,
                    targeting: toolArgs.targeting,
                    promotedObject: toolArgs.promotedObject,
                  },
                  null,
                  2
                )
              );
            }
            
            // 🛡️ VALIDATION: Fix adSetId for create_ad if it's empty or placeholder
            if (toolCall.function.name === 'create_ad') {
              const invalidAdSetIds = ['', '__adset_id__', 'ACTUAL_ADSET_ID', 'ACTUAL_ADSET_ID_FROM_STEP_2', 'ADSET_ID', 'CANNOT_PROCEED_YET', 'CANNOT_PROCEED', 'PENDING', null, undefined];
              const adsetAction = actions.find(a => a.tool === 'create_adset' && a.success);
              const storedAdSetId = adsetAction?.result?.id;
              
              // Also check if adSetId contains placeholder text patterns
              const isPlaceholder = toolArgs.adSetId && (
                toolArgs.adSetId.startsWith('__') ||
                toolArgs.adSetId.endsWith('__') ||
                toolArgs.adSetId.includes('ACTUAL_') || 
                toolArgs.adSetId.includes('ADSET_ID') ||
                toolArgs.adSetId.includes('_FROM_') ||
                toolArgs.adSetId.includes('CANNOT_') ||
                toolArgs.adSetId.includes('PENDING') ||
                toolArgs.adSetId.includes('PLACEHOLDER') ||
                !/^\d+$/.test(toolArgs.adSetId) // Must be numeric
              );
              
              if (invalidAdSetIds.includes(toolArgs.adSetId) || !toolArgs.adSetId || isPlaceholder) {
                if (storedAdSetId) {
                  console.log(`⚠️ AI used invalid adSetId: "${toolArgs.adSetId}" - fixing to: ${storedAdSetId}`);
                  toolArgs.adSetId = storedAdSetId;
                } else {
                  console.log(`❌ AI used invalid adSetId: "${toolArgs.adSetId}" and no adset ID stored yet`);
                  throw new Error('Cannot create ad: No valid adset ID available. Please create adset first.');
                }
              }
            }
            
            // 🛡️ VALIDATION: Fix create_ad URLs to use actual materials
            if (toolCall.function.name === 'create_ad' && toolArgs.creative) {
              const ngrokUrl = process.env.NGROK_URL || 'https://8ef9dec79365.ngrok-free.app';
              const creative = toolArgs.creative;
              
              // 🔗 AUTO-PARSE TRACKING URLs: Split linkUrl into base URL and URL parameters
              if (creative.linkUrl && creative.linkUrl.includes('?')) {
                const parsed = parseTrackingUrl(creative.linkUrl);
                
                // Check if URL contains Facebook macros (e.g., {{campaign.name}})
                if (containsFacebookMacros(creative.linkUrl)) {
                  console.log(`🔗 Detected Facebook tracking URL with macros`);
                  console.log(`   Full URL: ${creative.linkUrl}`);
                  console.log(`   → Website URL: ${parsed.websiteUrl}`);
                  console.log(`   → URL Parameters: ${parsed.urlParameters}`);
                  
                  // Set the base URL as linkUrl
                  creative.linkUrl = parsed.websiteUrl;
                  
                  // Set URL parameters (only if not already set)
                  if (!creative.urlParameters) {
                    creative.urlParameters = parsed.urlParameters;
                  }
                } else {
                  // Regular URL with query params - still parse it
                  console.log(`🔗 Parsing URL with query parameters`);
                  console.log(`   Full URL: ${creative.linkUrl}`);
                  console.log(`   → Website URL: ${parsed.websiteUrl}`);
                  console.log(`   → URL Parameters: ${parsed.urlParameters}`);
                  
                  creative.linkUrl = parsed.websiteUrl;
                  if (!creative.urlParameters) {
                    creative.urlParameters = parsed.urlParameters;
                  }
                }
              }
              
              // 🎯 Find the correct material for THIS specific ad based on assignments
              const adsCreatedSoFar = actions.filter(a => a.tool === 'create_ad' && a.success).length;
              console.log(`📎 Creating ad #${adsCreatedSoFar + 1} of ${requestedAdCount} requested`);
              
              // Check if we have a specific material assigned for this ad index
              const assignedMaterial = materialAssignmentsList.find(a => a.adIndex === adsCreatedSoFar);
              
              let imageFromMaterials: any = null;
              let videoFromMaterials: any = null;
              let preferVideo = false;
              
              if (assignedMaterial) {
                // Use the specifically assigned material
                console.log(`📎 Using specifically assigned material for ad ${adsCreatedSoFar + 1}: ${assignedMaterial.filename}`);
                if (assignedMaterial.material.category === 'video') {
                  videoFromMaterials = assignedMaterial.material;
                  preferVideo = true;
                } else {
                  imageFromMaterials = assignedMaterial.material;
                }
              } else {
                // Fallback: Use materials in order based on ad index
                const materialIndex = adsCreatedSoFar % commandMaterials.length;
                const materialForThisAd = commandMaterials[materialIndex];
                
                if (materialForThisAd) {
                  console.log(`📎 Using material #${materialIndex + 1} for ad ${adsCreatedSoFar + 1}: ${materialForThisAd.originalName}`);
                  if (materialForThisAd.category === 'video') {
                    videoFromMaterials = materialForThisAd;
                    preferVideo = true;
                  } else {
                    imageFromMaterials = materialForThisAd;
                  }
                } else {
                  // Final fallback: any available material
                  imageFromMaterials = commandMaterials.find((m: any) => m.category === 'image') 
                    || availableMaterials.find((m: any) => m.category === 'image');
                  videoFromMaterials = commandMaterials.find((m: any) => m.category === 'video')
                    || availableMaterials.find((m: any) => m.category === 'video');
                  
                  const mostRecentMaterial = commandMaterials[0];
                  preferVideo = mostRecentMaterial?.category === 'video';
                }
              }
              
              console.log(`📎 Material selection for ad ${adsCreatedSoFar + 1}: image=${imageFromMaterials?.originalName || 'none'}, video=${videoFromMaterials?.originalName || 'none'}, preferVideo=${preferVideo}`);
              
              // Check if imageUrl is invalid (not from our ngrok/localhost)
              if (creative.imageUrl && !creative.imageUrl.includes(ngrokUrl) && !creative.imageUrl.includes('localhost:3000')) {
                console.log(`⚠️ AI used invalid imageUrl: ${creative.imageUrl}`);
                
                if (imageFromMaterials) {
                  creative.imageUrl = imageFromMaterials.fileUrl;
                  console.log(`✅ Fixed imageUrl to: ${creative.imageUrl}`);
                } else {
                  delete creative.imageUrl;
                  console.log(`⚠️ Removed invalid imageUrl - no materials available`);
                }
              }
              
              // Check if videoUrl is invalid
              if (creative.videoUrl && !creative.videoUrl.includes(ngrokUrl) && !creative.videoUrl.includes('localhost:3000')) {
                console.log(`⚠️ AI used invalid videoUrl: ${creative.videoUrl}`);
                
                if (videoFromMaterials) {
                  creative.videoUrl = videoFromMaterials.fileUrl;
                  console.log(`✅ Fixed videoUrl to: ${creative.videoUrl}`);
                } else {
                  delete creative.videoUrl;
                  console.log(`⚠️ Removed invalid videoUrl - no materials available`);
                }
              }
              
              // Fix: if .mp4 URL is in imageUrl, move it to videoUrl
              if (creative.imageUrl && creative.imageUrl.endsWith('.mp4')) {
                console.log(`⚠️ MP4 file incorrectly placed in imageUrl, moving to videoUrl`);
                creative.videoUrl = creative.imageUrl;
                delete creative.imageUrl;
                
                if (imageFromMaterials) {
                  creative.imageUrl = imageFromMaterials.fileUrl;
                  console.log(`✅ Added image: ${creative.imageUrl}`);
                }
              }
              
              // 🚨 CRITICAL: If NO imageUrl or videoUrl, ADD one from materials!
              if (!creative.imageUrl && !creative.videoUrl) {
                console.log(`⚠️ AI did NOT include any image/video - adding from materials`);
                
                // Use the MOST RECENTLY UPLOADED material type
                // If user just uploaded a video, use video. If image, use image.
                if (preferVideo && videoFromMaterials) {
                  creative.videoUrl = videoFromMaterials.fileUrl;
                  console.log(`✅ AUTO-ADDED videoUrl (most recent upload was video): ${creative.videoUrl}`);
                } else if (imageFromMaterials) {
                  creative.imageUrl = imageFromMaterials.fileUrl;
                  console.log(`✅ AUTO-ADDED imageUrl: ${creative.imageUrl}`);
                } else if (videoFromMaterials) {
                  creative.videoUrl = videoFromMaterials.fileUrl;
                  console.log(`✅ AUTO-ADDED videoUrl: ${creative.videoUrl}`);
                } else {
                  console.log(`⚠️ No materials available to add to ad creative`);
                }
              }
              
              // 🎬 IMPORTANT: Video ads require a thumbnail image!
              // If we have a video but no image, find ANY available image for the thumbnail
              if (creative.videoUrl && !creative.imageUrl) {
                // First try the already selected imageFromMaterials
                let thumbnailImage = imageFromMaterials;
                
                // If no image selected, look for any available image in materials
                if (!thumbnailImage) {
                  thumbnailImage = commandMaterials.find((m: any) => m.category === 'image') 
                    || availableMaterials.find((m: any) => m.category === 'image');
                }
                
                if (thumbnailImage) {
                  creative.imageUrl = thumbnailImage.fileUrl;
                  console.log(`🖼️ AUTO-ADDED thumbnail image for video ad: ${creative.imageUrl}`);
                } else {
                  console.log(`⚠️ No image available for video thumbnail - Facebook may reject this ad`);
                }
              }
              
              // 🛡️ VALIDATION: Ensure required creative fields are present
              // Facebook requires linkUrl for call-to-action
              if (!creative.linkUrl) {
                // Try to get linkUrl from the original command or use a default
                console.log(`⚠️ Missing linkUrl in creative - checking for website URL in command...`);
                
                // Extract URL from command if present (look for http/https links)
                const urlMatch = command.match(/https?:\/\/[^\s]+/);
                if (urlMatch) {
                  const fullUrl = urlMatch[0];
                  const parsed = parseTrackingUrl(fullUrl);
                  creative.linkUrl = parsed.websiteUrl;
                  console.log(`✅ AUTO-EXTRACTED linkUrl from command: ${creative.linkUrl}`);
                  
                  // Also extract URL parameters if present and not already set
                  if (parsed.urlParameters && !creative.urlParameters) {
                    creative.urlParameters = parsed.urlParameters;
                    console.log(`✅ AUTO-EXTRACTED urlParameters from command: ${creative.urlParameters}`);
                  }
                } else {
                  // Use a placeholder that will show in error - this will still fail but with clearer error
                  console.log(`❌ No linkUrl found - ad creation will likely fail`);
                  console.log(`💡 TIP: Include a destination URL in your command, e.g., "website: https://example.com"`);
                  throw new Error('Missing required linkUrl in ad creative. Please include a destination URL in your command.');
                }
              }
              
              // 🔗 ENSURE URL PARAMETERS: If linkUrl exists but urlParameters is missing, extract from original command
              if (creative.linkUrl && !creative.urlParameters) {
                const urlMatch = command.match(/https?:\/\/[^\s]+/);
                if (urlMatch && urlMatch[0].includes('?')) {
                  const parsed = parseTrackingUrl(urlMatch[0]);
                  if (parsed.urlParameters) {
                    creative.urlParameters = parsed.urlParameters;
                    console.log(`🔗 AUTO-ADDED urlParameters from command: ${creative.urlParameters}`);
                  }
                }
              }
              
              // Set default title and body if not provided
              if (!creative.title) {
                creative.title = toolArgs.name || 'Ad';
                console.log(`📝 AUTO-SET title: ${creative.title}`);
              }
              if (!creative.body) {
                creative.body = 'Check this out!';
                console.log(`📝 AUTO-SET body: ${creative.body}`);
              }
              
              toolArgs.creative = creative;
              console.log(`📎 Final ad creative:`, JSON.stringify(creative, null, 2));
            }
            
            // Execute the tool call via MCP client
            const result = await mcpClient.callTool(toolCall.function.name, {
              ...toolArgs,
              businessId,
            });
            toolFailureCounts[toolCall.function.name] = 0;
            
            // Store campaign ID for subsequent adset creation
            if (toolCall.function.name === 'create_campaign' && result?.id) {
              campaignId = result.id;
              console.log(`💾 Stored campaign ID: ${campaignId}`);
            }
            
            // Store adset ID for subsequent ad creation  
            if (toolCall.function.name === 'create_adset' && result?.id) {
              console.log(`💾 Stored adset ID: ${result.id}`);
            }
            
            actions.push({
              type: getActionType(toolCall.function.name),
              tool: toolCall.function.name,
              arguments: toolArgs,
              result: result,
              success: true
            });

            // Add tool result to conversation
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool' as const,
              content: JSON.stringify(result)
            });
            
            console.log(`✅ Tool ${toolCall.function.name} executed successfully`);
          } catch (error) {
            console.error(`❌ Tool ${toolCall.function.name} failed:`, error);
            toolFailureCounts[toolCall.function.name] = (toolFailureCounts[toolCall.function.name] || 0) + 1;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            actions.push({
              type: getActionType(toolCall.function.name),
              tool: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments),
              error: errorMessage,
              success: false
            });

            // Add error to conversation
            toolResults.push({
              tool_call_id: toolCall.id,
              role: 'tool' as const,
              content: `Error: ${errorMessage}`
            });

            if (
              errorMessage.includes('DSA_REQUIRED') ||
              errorMessage.includes('Set DSA payor/beneficiary') ||
              errorMessage.includes('Select a default Page for this ad account')
            ) {
              blockingError =
                errorMessage;
              console.log('🛑 Blocking configuration error encountered. Stopping loop.');
              conversationComplete = true;
            }

            if (toolFailureCounts[toolCall.function.name] >= MAX_CONSECUTIVE_TOOL_FAILURES) {
              console.log(
                `🛑 Tool ${toolCall.function.name} failed ${toolFailureCounts[toolCall.function.name]} times. Stopping loop.`
              );
              conversationComplete = true;
            }
          }
        }

        // Add all tool results to messages
        messages.push(...toolResults);

        // Check what steps have been completed successfully
        const campaignCreated = actions.some(a => a.tool === 'create_campaign' && a.success);
        const adsetCreated = actions.some(a => a.tool === 'create_adset' && a.success);
        const adsCreated = actions.filter(a => a.tool === 'create_ad' && a.success).length;
        
        // Duplicate tracking - these use Facebook's native /copies endpoint and include everything
        const campaignDuplicated = actions.some(a => a.tool === 'duplicate_campaign' && a.success);
        const adsetDuplicated = actions.some(a => a.tool === 'duplicate_adset' && a.success);
        const adDuplicated = actions.some(a => a.tool === 'duplicate_ad' && a.success);
        
        // Management command tracking
        const campaignsFetched = actions.some(a => a.tool === 'get_campaigns' && a.success);
        const campaignsUpdated = actions.filter(a => a.tool === 'update_campaign' && a.success).length;

        // Store adset ID for ad creation
        const adsetAction = actions.find(a => a.tool === 'create_adset' && a.success);
        const adsetId = adsetAction?.result?.id;

        console.log(`📊 Progress: campaign=${campaignCreated}, adset=${adsetCreated}, ads=${adsCreated}/${requestedAdCount}`);
        console.log(`📊 Management: fetched=${campaignsFetched}, updated=${campaignsUpdated}`);
        console.log(`📊 Duplicates: campaign=${campaignDuplicated}, adset=${adsetDuplicated}, ad=${adDuplicated}`);

        // Handle DUPLICATE operations (using native Facebook /copies endpoint)
        // These are COMPLETE operations - no need for additional ad set/ad creation
        if (campaignDuplicated || adsetDuplicated || adDuplicated) {
          console.log(`✅ Duplicate operation completed successfully using Facebook native API!`);
          conversationComplete = true;
        }
        // Handle MANAGEMENT commands (pause, activate, etc. - NOT duplicate since we handle it above)
        else if (isManagementCommand) {
          if (campaignsFetched && campaignsUpdated > 0) {
            // Updates were made - might need more updates or we're done
            console.log(`✅ Management command: ${campaignsUpdated} campaigns updated`);
            // Let AI decide if more updates needed - don't force completion
          } else if (campaignsFetched && campaignsUpdated === 0 && !campaignCreated) {
            // Fetched campaigns but no updates yet - AI is still working
            // Or maybe there are no campaigns matching criteria
            console.log(`⏳ Campaigns fetched, waiting for updates or completion...`);
          }
          
          // For old-style duplicate commands that manually create new campaigns (fallback)
          if (campaignCreated && !adsetCreated) {
            messages.push({
              role: 'user',
              content: `Great! Duplicate campaign was created with ID: ${campaignId}. Now create an adset for this campaign with the new targeting parameters (as specified in the command).`
            });
          } else if (campaignCreated && adsetCreated && adsCreated === 0 && adsetId) {
            messages.push({
              role: 'user',
              content: `Excellent! Campaign and adset created. Now create an ad for adset ${adsetId} to complete the duplication.`
            });
          } else if (campaignCreated && adsetCreated && adsCreated > 0) {
            console.log(`✅ Duplicate campaign completed successfully!`);
            conversationComplete = true;
          }
        } 
        // Handle CREATION commands (create campaign/adset/ad)
        else {
          if (campaignCreated && !adsetCreated) {
            // Step 1 complete, need to create adset
            messages.push({
              role: 'user',
              content: `Great! Campaign was created with ID: ${campaignId}. Now create an adset for this campaign using the targeting parameters from the original command.`
            });
          } else if (campaignCreated && adsetCreated && adsCreated < requestedAdCount && adsetId) {
            // Need to create more ads
            const nextAdNumber = adsCreated + 1;
            const assignedMaterial = materialAssignmentsList.find(a => a.adIndex === adsCreated);
            
            let materialInstruction = '';
            if (assignedMaterial) {
              const materialType = assignedMaterial.material.category === 'video' ? 'videoUrl' : 'imageUrl';
              materialInstruction = ` Use ${assignedMaterial.filename} (${materialType}: ${assignedMaterial.material.fileUrl}) for this ad's creative.`;
            } else if (commandMaterials[adsCreated]) {
              const mat = commandMaterials[adsCreated];
              const materialType = mat.category === 'video' ? 'videoUrl' : 'imageUrl';
              materialInstruction = ` Use ${mat.originalName} (${materialType}: ${mat.fileUrl}) for this ad's creative.`;
            }
            
            messages.push({
              role: 'user',
              content: `${adsCreated === 0 ? 'Excellent! Campaign and adset were created successfully.' : `Good! Ad ${adsCreated} created.`} AdSet ID: ${adsetId}. Now create ad ${nextAdNumber} of ${requestedAdCount} for this adset.${materialInstruction} Use a unique ad name like "Ad ${nextAdNumber}" to distinguish it.`
            });
            console.log(`📎 Requesting ad ${nextAdNumber}/${requestedAdCount}${materialInstruction ? ' with specific material' : ''}`);
          } else if (campaignCreated && adsetCreated && adsCreated >= requestedAdCount) {
            // All requested ads created - conversation is done
            console.log(`✅ All ${requestedAdCount} ads created successfully!`);
            conversationComplete = true;
          } else if (actions.length > 0 && !campaignCreated && !isManagementCommand) {
            // Something went wrong with campaign creation
            conversationComplete = true;
          }
        }
      } else {
        // No tool calls, conversation is complete
        conversationComplete = true;
      }
    }

    const lastMessage = messages[messages.length - 1];
    const reasoning = lastMessage?.content || 'Processing completed';
    
    // Build informative summary message
    const campaignsUpdated = actions.filter(a => a.tool === 'update_campaign' && a.success).length;
    const campaignsCreated = actions.filter(a => a.tool === 'create_campaign' && a.success).length;
    const adsetsCreated = actions.filter(a => a.tool === 'create_adset' && a.success).length;
    const adsCreatedCount = actions.filter(a => a.tool === 'create_ad' && a.success).length;
    const campaignsDuplicated = actions.filter(a => a.tool === 'duplicate_campaign' && a.success).length;
    const adsetsDuplicated = actions.filter(a => a.tool === 'duplicate_adset' && a.success).length;
    const adsDuplicated = actions.filter(a => a.tool === 'duplicate_ad' && a.success).length;
    
    let summaryMessage = `Executed ${actions.length} actions for: ${command}`;
    if (campaignsDuplicated > 0) {
      summaryMessage = `Duplicated ${campaignsDuplicated} campaign(s) with all ad sets and ads`;
    } else if (adsetsDuplicated > 0) {
      summaryMessage = `Duplicated ${adsetsDuplicated} ad set(s) with all ads`;
    } else if (adsDuplicated > 0) {
      summaryMessage = `Duplicated ${adsDuplicated} ad(s)`;
    } else if (campaignsUpdated > 0) {
      summaryMessage = `Updated ${campaignsUpdated} campaign(s): ${command}`;
    } else if (campaignsCreated > 0) {
      summaryMessage = `Created ${campaignsCreated} campaign(s), ${adsetsCreated} adset(s), ${adsCreatedCount} ad(s)`;
    }

    if (blockingError) {
      const normalizedBlockingError = normalizeBlockingError(blockingError);
      return NextResponse.json(
        {
          ...normalizedBlockingError,
          success: false,
          partial: false,
          actions,
          reasoning: typeof reasoning === 'string' ? reasoning : 'Command blocked by configuration',
          error: normalizedBlockingError.message,
          message: normalizedBlockingError.message,
        },
        { status: 422 }
      );
    }
    
    return NextResponse.json({
      success: true,
      actions,
      reasoning: typeof reasoning === 'string' ? reasoning : 'Command completed',
      message: summaryMessage
    });

  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

function getActionType(toolName: string): string {
  switch (toolName) {
    case 'create_campaign': return 'campaign_create';
    case 'update_campaign': return 'campaign_update';
    case 'get_campaigns': return 'campaign_fetch';
    case 'duplicate_campaign': return 'campaign_duplicate';
    case 'create_adset': return 'adset_create';
    case 'update_adset': return 'adset_update';
    case 'get_adsets': return 'adset_fetch';
    case 'duplicate_adset': return 'adset_duplicate';
    case 'create_ad': return 'ad_create';
    case 'update_ad': return 'ad_update';
    case 'get_ads': return 'ad_fetch';
    case 'duplicate_ad': return 'ad_duplicate';
    default: return 'unknown';
  }
}

function inferEuCountriesFromCommand(command: string): string[] {
  const normalized = command.toLowerCase();
  const countryMap: Record<string, string> = {
    romania: 'RO',
    poland: 'PL',
    germany: 'DE',
    france: 'FR',
    italy: 'IT',
    spain: 'ES',
    netherlands: 'NL',
    belgium: 'BE',
    austria: 'AT',
    sweden: 'SE',
    denmark: 'DK',
    finland: 'FI',
    czechia: 'CZ',
    'czech republic': 'CZ',
    hungary: 'HU',
    portugal: 'PT',
    greece: 'GR',
    ireland: 'IE',
    slovakia: 'SK',
    slovenia: 'SI',
    croatia: 'HR',
    bulgaria: 'BG',
    lithuania: 'LT',
    latvia: 'LV',
    estonia: 'EE',
    luxembourg: 'LU',
    cyprus: 'CY',
    malta: 'MT',
    norway: 'NO',
  };
  const countries = new Set<string>();
  for (const [keyword, code] of Object.entries(countryMap)) {
    if (normalized.includes(keyword)) {
      countries.add(code);
    }
  }
  return Array.from(countries);
}

function normalizeBlockingError(errorMessage: string): {
  code: 'DSA_REQUIRED' | 'DEFAULT_PAGE_REQUIRED';
  message: string;
  nextSteps: string[];
} {
  if (
    errorMessage.includes('Select a default Page for this ad account') ||
    errorMessage.includes('Cannot create lead ad set: no promotable page found') ||
    errorMessage.includes('Cannot create leads campaign bundle: no promotable page found')
  ) {
    return {
      code: 'DEFAULT_PAGE_REQUIRED',
      message: errorMessage,
      nextSteps: [
        'Open Tenant Ad Account Settings.',
        'Select a default Facebook Page for this ad account.',
        'Retry the campaign creation request after saving.',
      ],
    };
  }

  try {
    const parsed = JSON.parse(errorMessage) as { code?: string; message?: string; nextSteps?: string[] };
    if (parsed && parsed.code === 'DSA_REQUIRED' && parsed.message) {
      return {
        code: 'DSA_REQUIRED',
        message: parsed.message,
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      };
    }
  } catch {
    // Fall through.
  }

  return {
    code: 'DSA_REQUIRED',
    message:
      errorMessage || 'DSA requirements are missing for EU targeting. Set DSA payor/beneficiary in tenant settings.',
    nextSteps: [
      'Open Tenant Settings > DSA.',
      'Autofill from Meta recommendations or set values manually.',
      'Retry the campaign creation request.',
    ],
  };
}