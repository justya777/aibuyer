'use client'

import { useState, useRef, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FacebookAccount, AIAction, AICommand } from '../../shared/types'
import { 
  PaperAirplaneIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'

interface AICommandCenterProps {
  selectedAccount: FacebookAccount | null
  onActionComplete: (action: AIAction) => void
}

export default function AICommandCenter({ selectedAccount, onActionComplete }: AICommandCenterProps) {
  const [command, setCommand] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [showUploadZone, setShowUploadZone] = useState(false)
  const [suggestions] = useState([
    // Campaign operations with targeting - Updated objectives
    'Create a leads campaign for Romanian men on romanian language aged 20-45 interested in investments with $15 daily budget with the link https://domain.com/test?utm_campaign={{campaign.name}}&utm_source={{site_source_name}}',
    // 'Create a traffic campaign for US users aged 25-45 interested in technology with $20 daily budget',
    // 'Create a sales campaign for European small business owners aged 30-55 with $25 daily budget',
    'Activate all campaigns',
    'Pause all campaigns with CTR below 1%',
    'Create leads campaign with 2 ads - use pr.mp4 for first ad, man.jpeg for 2nd for Romanian men on romanian language aged 20-45 interested in investments with $15 daily budget with the link https://domain.com/test?utm_campaign={{campaign.name}}&utm_source={{site_source_name}}',

  ])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // File upload handling
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('adName', selectedAccount?.name || 'ai-command');
      formData.append('type', file.type.startsWith('image/') ? 'image' : 'video');

      try {
        const response = await fetch('/api/upload-materials', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.success) {
          setUploadedFiles(prev => [...prev, {
            ...result.material,
            file: file
          }]);
          console.log(`✅ Uploaded: ${file.name}`);
        } else {
          console.error(`❌ Upload failed for ${file.name}:`, result.error);
        }
      } catch (error) {
        console.error('❌ Upload error:', error);
      }
    }
  }, [selectedAccount]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 5,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'video/mp4': ['.mp4'],
      'video/mov': ['.mov']
    },
    disabled: !selectedAccount
  });

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || !selectedAccount) return

    setIsProcessing(true)

    try {
      // Call the AI API endpoint
      const response = await fetch('/api/ai-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          accountId: selectedAccount.id,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'AI command failed')
      }

      // Process all actions returned by the AI
      if (result.actions && result.actions.length > 0) {
        result.actions.forEach((action: AIAction) => {
          onActionComplete(action)
        })
      } else {
        // If no actions, create a general response action
        const responseAction: AIAction = {
          id: Date.now().toString(),
          timestamp: new Date(),
          type: 'campaign_create',
          accountId: selectedAccount.id,
          action: `AI Response: ${result.message || 'Command processed'}`,
          reasoning: result.reasoning || 'AI processed your command',
          parameters: {
            command: command,
            accountId: selectedAccount.id,
          },
          result: 'success',
          executionTime: 1500
        }
        onActionComplete(responseAction)
      }

      setCommand('')
    } catch (error) {
      console.error('Error processing AI command:', error)
      
      // Create error action
      const errorAction: AIAction = {
        id: Date.now().toString(),
        timestamp: new Date(),
        type: 'campaign_create',
        accountId: selectedAccount.id,
        action: `Failed to process command: "${command}"`,
        reasoning: `Error occurred while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        parameters: {
          command: command,
          accountId: selectedAccount.id,
        },
        result: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime: 800
      }
      onActionComplete(errorAction)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setCommand(suggestion)
    textareaRef.current?.focus()
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <SparklesIcon className="w-5 h-5 text-facebook-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Command Center</h3>
        </div>
        {/* <p className="text-sm text-gray-600">
          Give commands to the AI to manage your Facebook campaigns
        </p> */}
      </div>

      {!selectedAccount && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 mr-2 flex-shrink-0" />
            <p className="text-sm text-yellow-700">
              Select an account from the sidebar to start giving commands
            </p>
          </div>
        </div>
      )}

      {/* {selectedAccount && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700">
            <strong>Selected Account:</strong> {selectedAccount.name}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Budget: ${selectedAccount.metrics.budget.toLocaleString()} | 
            Spend: ${selectedAccount.metrics.spend.toLocaleString()} | 
            Active Campaigns: {selectedAccount.activeCampaigns}
          </p>
        </div>
      )} */}

      {/* File Upload Zone */}
      {showUploadZone && selectedAccount && (
        <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
          <div {...getRootProps()} className={`cursor-pointer p-4 text-center rounded transition-colors ${
            isDragActive ? 'border-blue-400 bg-blue-50' : 'hover:bg-gray-100'
          }`}>
            <input {...getInputProps()} />
            <PaperClipIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              {isDragActive 
                ? 'Drop files here...' 
                : 'Drag & drop materials or click to upload'
              }
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPG, PNG, GIF, MP4, MOV (max 5 files)
            </p>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Uploaded Files:</h4>
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-2 bg-white border rounded">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium">{file.originalName}</span>
                    <span className="text-xs text-gray-500">({file.category.toUpperCase()})</span>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mb-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={selectedAccount 
              ? uploadedFiles.length > 0
                ? `e.g., Create campaigns using ${uploadedFiles.map(f => f.originalName).join(', ')} - specify which files to use for each adset`
                : "e.g., Create a traffic campaign for Romanian users aged 25-45 interested in fitness with $50 daily budget"
              : "Select an account to start..."
            }
            disabled={!selectedAccount || isProcessing}
            className="w-full p-3 pr-20 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-facebook-500 focus:border-facebook-500 disabled:bg-gray-50 disabled:text-gray-500"
            rows={4}
          />
          <div className="absolute bottom-2 right-2 flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setShowUploadZone(!showUploadZone)}
              disabled={!selectedAccount}
              className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Upload materials"
            >
              <PaperClipIcon className="w-4 h-4" />
            </button>
            <button
              type="submit"
              disabled={!command.trim() || !selectedAccount || isProcessing}
              className="p-2 bg-facebook-600 text-white rounded-md hover:bg-facebook-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <PaperAirplaneIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>

      <div className="flex-1 overflow-auto">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Quick Commands</h4>
        <div className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              disabled={!selectedAccount || isProcessing}
              className="w-full text-left p-3 text-sm bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {isProcessing && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-facebook-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-blue-700">
              AI is processing your command...
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
