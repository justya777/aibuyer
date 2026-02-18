# 📎 Material Upload System - Complete Guide

## ✅ **What's Now Available**

Your Facebook Ads Manager now includes a complete material upload system for creating professional ads with images and videos!

## 🚀 **Features Implemented**

### **1. File Upload API** ✅
- **Endpoint**: `/api/upload-materials`
- **Supported Formats**: 
  - **Images**: JPG, PNG, GIF
  - **Videos**: MP4, MOV, AVI
- **File Size**: Up to 10MB per file
- **Storage**: Local file system (`/public/uploads/`)

### **2. Material Management UI** ✅  
- **Drag & Drop**: Easy file upload interface
- **Progress Tracking**: Visual upload progress
- **Preview Gallery**: See all uploaded materials
- **File Organization**: Materials organized by ad account

### **3. AI Integration** ✅
- **Automatic Detection**: AI automatically sees available materials
- **Smart Usage**: AI uses uploaded images/videos in ad creatives
- **Dynamic Assignment**: Materials automatically assigned to new ads

### **4. Material Retrieval** ✅
- **API Endpoint**: `/api/get-materials`
- **Filtering**: Filter by ad account name
- **Metadata**: File size, type, upload date included

## 🎯 **How to Use**

### **Step 1: Upload Materials**
1. **Click Upload Button**: Hit the "📎 Upload" button in the header
2. **Drag & Drop Files**: Drop images/videos or click to select
3. **Upload Progress**: Watch files upload with progress indicators
4. **Preview Gallery**: See all your uploaded materials

### **Step 2: Create Ads with Materials**
```bash
# AI Command Examples:
"Create a fashion campaign for Romanian women using uploaded images"
"Create lead generation ads with my uploaded video content" 
"Generate investment ads using available materials"
```

### **Step 3: AI Handles the Rest**
The AI will:
- ✅ **Detect** available materials automatically
- ✅ **Choose** appropriate images/videos for each ad
- ✅ **Integrate** materials into Facebook ad creatives
- ✅ **Create** complete ads ready to run

## 📋 **Material Usage Examples**

### **Before (Text-Only Ads):**
```json
{
  "creative": {
    "title": "Invest in Fashion Today",
    "body": "Join thousands investing in fashion trends",
    "linkUrl": "https://example.com",
    "callToAction": "LEARN_MORE"
  }
}
```

### **After (With Uploaded Materials):**
```json
{
  "creative": {
    "title": "Invest in Fashion Today", 
    "body": "Join thousands investing in fashion trends",
    "linkUrl": "https://example.com",
    "callToAction": "LEARN_MORE",
    "imageUrl": "/uploads/fashion_campaign_image.jpg"
  }
}
```

## 🔧 **Technical Details**

### **File Naming Convention:**
```
{adName}_{uuid}.{extension}
Example: act_312774572752951_a1b2c3d4-e5f6.jpg
```

### **Storage Structure:**
```
/public/uploads/
├── act_312774572752951_image1.jpg
├── act_312774572752951_video1.mp4
└── default_banner.png
```

### **API Response Format:**
```json
{
  "success": true,
  "material": {
    "id": "uuid-here",
    "filename": "generated-filename.jpg",
    "originalName": "my-image.jpg", 
    "fileUrl": "/uploads/generated-filename.jpg",
    "category": "image",
    "size": 1024000,
    "uploadedAt": "2025-09-29T12:00:00Z"
  }
}
```

## ✨ **Advanced Features**

### **1. Automatic Material Selection**
- AI chooses **best materials** for each ad type
- **Image optimization** for Facebook ad dimensions
- **Video integration** for video ads

### **2. Material Organization**
- Materials **linked to accounts** for easy management
- **Preview thumbnails** in upload interface
- **File metadata** tracking (size, date, type)

### **3. Error Handling** 
- **File type validation** prevents invalid uploads
- **Size limits** prevent large file issues
- **Graceful fallbacks** if materials unavailable

## 🎨 **UI/UX Features**

- **📁 Drag & Drop Zone**: Easy file uploading
- **📱 Responsive Design**: Works on all screen sizes  
- **🔄 Upload Progress**: Real-time upload feedback
- **🖼️ Material Gallery**: Visual preview of all materials
- **📊 File Details**: Size, type, and date information

## 🚀 **Complete Workflow**

```mermaid
graph LR
    A[Upload Materials] --> B[AI Command]
    B --> C[AI Detects Materials] 
    C --> D[Creates Campaign]
    D --> E[Creates Ad Set]
    E --> F[Creates Ad with Materials]
    F --> G[Ready to Run!]
```

Now you can create **professional Facebook ads** with custom images and videos in just a few clicks! 🎯
