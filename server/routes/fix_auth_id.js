const fs = require('fs');
const path = require('path');

const dir = __dirname;

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('(req.authUserId || req.session?.userId)') || content.includes('(req.authUserId || req.session?.userId)')) {
    // We only replace if it's not already handled like `req.authUserId || req.session.userId`
    let newContent = content.replace(/(?<!req\.authUserId \|\| )req\.session(\?)?\.userId/g, '(req.authUserId || req.session?.userId)');
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log('Fixed:', filePath);
    }
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.js')) {
      fixFile(fullPath);
    }
  }
}

walk(dir);
