#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJson = require('../package.json');

console.log('📦 Packaging HN Hiring Lens extension...');

// Run build first
try {
  execSync('node scripts/build.js', { stdio: 'inherit', cwd: __dirname + '/..' });
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}

const distDir = path.join(__dirname, '../dist');
const outputFile = `hn-hiring-lens-v${packageJson.version}.zip`;
const outputPath = path.join(__dirname, '../', outputFile);

// Remove existing zip
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
}

// Create zip
try {
  process.chdir(distDir);
  execSync(`zip -r ../${outputFile} .`, { stdio: 'inherit' });
  
  console.log('✅ Package created successfully!');
  console.log(`📦 File: ${outputFile}`);
  console.log(`📁 Location: ${path.dirname(outputPath)}`);
  console.log('');
  console.log('🚀 Installation Instructions:');
  console.log('1. Open Chrome and go to chrome://extensions/');
  console.log('2. Enable "Developer mode"');
  console.log('3. Drag and drop the .zip file onto the extensions page');
  console.log('   OR');
  console.log('3. Click "Load unpacked" and select the dist/ folder');
  
} catch (error) {
  console.error('Packaging failed:', error.message);
  process.exit(1);
}