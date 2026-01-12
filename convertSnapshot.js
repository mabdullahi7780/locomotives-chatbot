// Run from locomotives-chatbot folder: node convertSnapshot.js

const fs = require('fs');
const path = require('path');

// File is in parent directory (chatbot folder)
const inputPath = path.join(__dirname, '..', 'dashBoardDataJSON.js');

console.log('Looking for file at:', inputPath);

let content = fs.readFileSync(inputPath, 'utf8');

// Convert MongoDB syntax to plain JavaScript
content = content
  // ObjectId("...") -> "..."
  .replace(/ObjectId\("([^"]+)"\)/g, '"$1"')
  // ISODate("...") -> "..."
  .replace(/ISODate\("([^"]+)"\)/g, '"$1"')
  // NumberInt(...) -> the number
  .replace(/NumberInt\((\d+)\)/g, '$1');

// Ensure module.exports is present
if (!content.includes('module.exports')) {
  content = content.trim();
  if (content.endsWith(';')) {
    content = content.slice(0, -1);
  }
  content += '\n\nmodule.exports = dashboardData;\n';
}

// Write back
fs.writeFileSync(inputPath, content, 'utf8');
console.log('✅ Converted MongoDB syntax to plain JavaScript');
console.log('   - ObjectId("...") → "..."');
console.log('   - ISODate("...") → "..."');
console.log('   - NumberInt(n) → n');
