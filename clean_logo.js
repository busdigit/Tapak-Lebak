const fs = require('fs');
const path = require('path');

const targetHtml = path.resolve(__dirname, 'index.html');
console.log('Reading index.html from:', targetHtml);

let html = fs.readFileSync(targetHtml, 'utf8');
const origSize = html.length;
console.log('Original index.html size:', origSize, 'bytes');

// 1. Replace giant base64 line in <head>
const base64Regex = /window\.TAPAK_BRIGHT_LOGO\s*=\s*"data:image\/jpeg;base64,[^"]*";/;
if (base64Regex.test(html)) {
  html = html.replace(
    base64Regex,
    `window.TAPAK_BRIGHT_LOGO = "tapak_lebak_bright.jpg";
    window.TAPAK_ONLINE_LOGO = "https://lh3.googleusercontent.com/d/1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t";`
  );
  console.log('1. Replaced giant Base64 in <head> with clean URL references.');
} else {
  console.log('1. Warning: Base64 pattern not matched in <head> (might already be replaced).');
}

// 2. Replace all occurrences of old logo Google Drive ID 1isP26fp9SxsWPbRqII8dBn-2TRdq7Hk1 with official ID 1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t
const oldId = '1isP26fp9SxsWPbRqII8dBn-2TRdq7Hk1';
const newId = '1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t';
if (html.includes(oldId)) {
  const count = html.split(oldId).length - 1;
  html = html.split(oldId).join(newId);
  console.log(`2. Replaced ${count} occurrences of old logo ID with official ID: ${newId}`);
} else {
  console.log('2. No occurrences of old logo ID found.');
}

// 3. Update onerror fallback in showcase img tag to use TAPAK_ONLINE_LOGO
html = html.replace(
  /onerror="this\.onerror=null;\s*this\.src=window\.TAPAK_BRIGHT_LOGO\s*\|\|\s*'tapak_lebak_bright\.jpg';"/g,
  `onerror="this.onerror=null; this.src='https://lh3.googleusercontent.com/d/1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t';"`
);
console.log('3. Updated onerror fallback in logo showcase.');

// 4. Update applyLogoToUI to NEVER insert Base64 or > 500 character strings into brandingLogoUrlInput.value
const oldApplyLogo = `      const urlInput = document.getElementById('brandingLogoUrlInput');
      if (urlInput) urlInput.value = directUrl;`;

const newApplyLogo = `      const urlInput = document.getElementById('brandingLogoUrlInput');
      if (urlInput) {
        if (directUrl && (directUrl.startsWith('data:image/') || directUrl.length > 500)) {
          urlInput.value = 'https://drive.google.com/file/d/1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t/view?usp=sharing';
        } else {
          urlInput.value = directUrl || '';
        }
      }`;

if (html.includes(oldApplyLogo)) {
  html = html.replace(oldApplyLogo, newApplyLogo);
  console.log('4. Added Base64 input protection to applyLogoToUI.');
} else {
  console.log('4. Warning: oldApplyLogo string not found.');
}

// 5. Update saveLogoFromLinkAction with hard guard against raw Base64 / cell overflow
const oldSaveLogoLink = `    function saveLogoFromLinkAction() {
      const inputEl = document.getElementById('brandingLogoUrlInput');
      if (!inputEl || !inputEl.value.trim()) {
        showToast('Tempel link Google Drive atau File ID terlebih dahulu!', 'warning');
        return;
      }

      const parsed = parseDriveImageUrl(inputEl.value);`;

const newSaveLogoLink = `    function saveLogoFromLinkAction() {
      const inputEl = document.getElementById('brandingLogoUrlInput');
      if (!inputEl || !inputEl.value.trim()) {
        showToast('Tempel link Google Drive atau File ID terlebih dahulu!', 'warning');
        return;
      }

      const rawInput = inputEl.value.trim();
      if (rawInput.startsWith('data:image/') || rawInput.length > 2000) {
        showToast('Input berupa data gambar Base64. Silakan gunakan tombol "Opsi 2: Unggah File" di bawah agar otomatis tersimpan di Google Drive.', 'warning');
        return;
      }

      const parsed = parseDriveImageUrl(rawInput);`;

if (html.includes(oldSaveLogoLink)) {
  html = html.replace(oldSaveLogoLink, newSaveLogoLink);
  console.log('5. Added Base64 rejection guard to saveLogoFromLinkAction.');
} else {
  console.log('5. Warning: oldSaveLogoLink string not found.');
}

// 6. Update resetLogoAction to use official TAPAK LEBAK logo
const oldResetRegex = /const defUrl = 'https:\/\/lh3\.googleusercontent\.com\/d\/1isP26fp9SxsWPbRqII8dBn-2TRdq7Hk1';\s*const defFb = 'https:\/\/drive\.google\.com\/thumbnail\?id=1isP26fp9SxsWPbRqII8dBn-2TRdq7Hk1&sz=w500';/;
if (oldResetRegex.test(html)) {
  html = html.replace(
    oldResetRegex,
    `const defUrl = 'https://lh3.googleusercontent.com/d/1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t';
      const defFb = 'https://drive.google.com/thumbnail?id=1Q-h0oEOhTQIIVVbma2Ckf2fr6ETEWb5t&sz=w1000';`
  );
  console.log('6. Updated resetLogoAction to use official TAPAK LEBAK logo.');
}

// 7. Write cleaned html back to index.html
fs.writeFileSync(targetHtml, html, 'utf8');
const newSize = html.length;
console.log('Cleaned index.html size:', newSize, 'bytes');
console.log('Size reduced by:', (origSize - newSize), 'bytes (~' + Math.round((origSize - newSize) / 1024) + ' KB)');
console.log('SUCCESS: index.html has been cleaned and secured!');
