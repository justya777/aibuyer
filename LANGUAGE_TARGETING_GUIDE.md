# Facebook Ads Language Targeting Guide

## ✅ **New Approach: Explicit Language Targeting Only**

The system now correctly separates **geographic targeting** from **language targeting** to avoid confusion and give users full control.

## 🎯 **How It Works**

### **Geographic/Country Targeting (Automatic)**
When you mention nationalities, the system targets by **location only**:

```bash
"Romanian men" = countries: ["RO"] 
"German women" = countries: ["DE"]
"French people" = countries: ["FR"]
```

**No automatic language targeting** - your ads can be in any language!

### **Language Targeting (Explicit Only)**
Language targeting is **only added** when you explicitly mention:

**Trigger Words:**
- **"speakers"** - "English speakers", "Romanian speakers"  
- **"language"** - "Romanian language", "English language"
- **"content in X"** - "content in Russian", "ads in English"

**Examples:**
```bash
# LANGUAGE TARGETING INCLUDED:
"English speakers in Romania" 
→ countries: ["RO"] + locales: [6,24]

"Romanian speakers" 
→ locales: [Romanian ID]

"Russian speakers in Germany"  
→ countries: ["DE"] + locales: [Russian ID]

"English content for Romanian audience"
→ countries: ["RO"] + locales: [6]
```

```bash
# NO LANGUAGE TARGETING (Geographic only):
"Romanian men aged 20-45"
→ countries: ["RO"] only

"German women interested in fashion"  
→ countries: ["DE"] only
```

## 🌍 **Real-World Use Cases**

### **Scenario 1: English Ads for Romanian Market**
```
"Create campaign for Romanian men aged 25-40 interested in investment"
```
**Result**: Targets Romanian men, ads can be in English (common for business content)

### **Scenario 2: Romanian Language Ads**  
```
"Create campaign for Romanian speakers interested in investment"
```
**Result**: Targets Romanian language speakers (could be anywhere in the world)

### **Scenario 3: Russian Content in Romania**
```
"Create campaign for Russian speakers in Romania aged 30-50"
```  
**Result**: Geographic (Romania) + Language (Russian) targeting

## 📋 **Benefits of This Approach**

1. **✅ No Assumptions**: System doesn't guess your content language
2. **✅ Flexible**: Romanian market can receive English, Russian, or Romanian ads
3. **✅ Explicit Control**: You decide exactly when to add language targeting  
4. **✅ Global Reach**: "Romanian speakers" targets diaspora worldwide
5. **✅ No Errors**: Avoids invalid locale ID issues

## 🚀 **How to Use**

**For Country-Only Targeting:**
```
"Create campaign for [NATIONALITY] [demographics]"
```

**For Language + Country Targeting:**  
```
"Create campaign for [LANGUAGE] speakers in [COUNTRY]"
"Create campaign for [COUNTRY] [demographics] with [LANGUAGE] content"
```

This gives you complete control over your targeting strategy! 🎯
