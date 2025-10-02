#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🏗️  Building HN Hiring Lens extension...');

const sourceDir = path.join(__dirname, '..');
const distDir = path.join(__dirname, '../dist');

// Clean and create dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy essential files only
const filesToCopy = [
  'manifest.json',
  'content.js',
  'styles.css',
  'background.js',
  'sidepanel.html',
  'sidepanel.js'
];


const iconSizes = ['16.png', '48.png', '128.png'];

// Copy main files
filesToCopy.forEach(file => {
  const src = path.join(sourceDir, file);
  const dest = path.join(distDir, file);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied ${file}`);
  } else {
    console.error(`✗ Missing ${file}`);
    process.exit(1);
  }
});

// Create icons directory and copy icons
const iconsDir = path.join(distDir, 'icons');
fs.mkdirSync(iconsDir);

iconSizes.forEach(iconFile => {
  const src = path.join(sourceDir, 'icons', iconFile);
  const dest = path.join(iconsDir, iconFile);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`✓ Copied icons/${iconFile}`);
  } else {
    console.error(`✗ Missing icons/${iconFile}`);
    process.exit(1);
  }
});

// Update manifest with build timestamp
const manifestPath = path.join(distDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.description += ` (Built: ${new Date().toISOString()})`;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('✅ Build completed successfully!');
console.log(`📁 Extension ready in: ${distDir}`);
console.log('🚀 Load dist/ folder as unpacked extension in Chrome');
