#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Validate manifest.json
function validateManifest() {
  const manifestPath = path.join(__dirname, '../manifest.json');
  
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    console.log('✓ Manifest JSON is valid');
    
    // Check required fields
    const required = ['manifest_version', 'name', 'version', 'permissions'];
    const missing = required.filter(field => !manifest[field]);
    
    if (missing.length > 0) {
      console.error('✗ Missing required fields:', missing);
      process.exit(1);
    }
    
    // Check files exist
    const contentScripts = manifest.content_scripts || [];
    for (const script of contentScripts) {
      if (script.js) {
        for (const jsFile of script.js) {
          const filePath = path.join(__dirname, '..', jsFile);
          if (!fs.existsSync(filePath)) {
            console.error(`✗ Missing JS file: ${jsFile}`);
            process.exit(1);
          }
        }
      }
      if (script.css) {
        for (const cssFile of script.css) {
          const filePath = path.join(__dirname, '..', cssFile);
          if (!fs.existsSync(filePath)) {
            console.error(`✗ Missing CSS file: ${cssFile}`);
            process.exit(1);
          }
        }
      }
    }
    
    // Check icons exist
    if (manifest.icons) {
      for (const [size, iconPath] of Object.entries(manifest.icons)) {
        const filePath = path.join(__dirname, '..', iconPath);
        if (!fs.existsSync(filePath)) {
          console.error(`✗ Missing icon file: ${iconPath}`);
          process.exit(1);
        }
      }
    }
    
    console.log('✓ All referenced files exist');
    console.log('✓ Manifest validation passed');
    
  } catch (error) {
    console.error('✗ Manifest validation failed:', error.message);
    process.exit(1);
  }
}

validateManifest();
