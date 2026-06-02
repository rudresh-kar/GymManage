const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'index.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Replace RGBA colors
css = css.replace(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g, 'rgba(0,0,0,');
css = css.replace(/rgba\(\s*34\s*,\s*211\s*,\s*238\s*,/g, 'rgba(37,99,235,');
css = css.replace(/rgba\(\s*167\s*,\s*139\s*,\s*250\s*,/g, 'rgba(79,70,229,');
css = css.replace(/rgba\(\s*52\s*,\s*211\s*,\s*153\s*,/g, 'rgba(16,185,129,');
css = css.replace(/rgba\(\s*251\s*,\s*113\s*,\s*133\s*,/g, 'rgba(225,29,72,');
css = css.replace(/rgba\(\s*251\s*,\s*191\s*,\s*36\s*,/g, 'rgba(245,158,11,');

// Replace dark backgrounds in portal styles
css = css.replace(/rgba\(\s*17\s*,\s*22\s*,\s*34\s*,/g, 'rgba(255,255,255,'); // portal topbar/bottomnav background
css = css.replace(/background:\s*#060910;/g, 'background: #f8fafc;'); // desktop body bg
css = css.replace(/background:\s*#000;/g, 'background: #fff;');

// Avatars text color #000 -> #fff
css = css.replace(/color:\s*#000;/g, 'color: #fff;');

// Button text color (btn-primary color is #000 currently, changed to #fff by above)
// Wait, we need to make sure btn-primary text is white. The previous line does it.

// Remove radial gradients on body backgrounds that look bad in light mode
css = css.replace(/radial-gradient\(.*?\),\s*var\(--bg-base\)/g, 'var(--bg-base)');
css = css.replace(/radial-gradient\(.*?\),\s*var\(--bg-card\)/g, 'var(--bg-card)');
// Also check gym card glow
css = css.replace(/radial-gradient\(.*?rgba\(34,211,238.*?transparent.*?\)/g, 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37,99,235,0.05) 0%, transparent 60%)');
css = css.replace(/radial-gradient\(.*?rgba\(99,102,241.*?transparent.*?\)/g, 'radial-gradient(ellipse 50% 40% at 80% 100%, rgba(79,70,229,0.05) 0%, transparent 55%)');
css = css.replace(/radial-gradient\(ellipse 80% 60% at 50% -10%, rgba\(34,211,238,0\.07\) 0%, transparent 65%\)/g, 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(37,99,235,0.04) 0%, transparent 65%)');

// Table tabs dark background
css = css.replace(/background:\s*rgba\(10,13,20,0\.5\);/g, 'background: rgba(241,245,249,0.8);');

// The portal bottomnav has a max border:
// border-top: 1px solid var(--border);
// We replaced rgba(17,22,34,0.92) with rgba(255,255,255,0.92).

fs.writeFileSync(cssPath, css);
console.log('Updated index.css');

// Now process JSX files
const pagesDir = path.join(__dirname, 'src', 'pages');
const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  content = content.replace(/rgba\(\s*34\s*,\s*211\s*,\s*238\s*,/g, 'rgba(37,99,235,');
  content = content.replace(/rgba\(\s*52\s*,\s*211\s*,\s*153\s*,/g, 'rgba(16,185,129,');
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}
