let ruleIdCounter = 1;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchImage') {
    const url = request.url;
    const pageUrl = request.pageUrl || '';
    
    if (!url || typeof url !== 'string') {
      sendResponse({ success: false, error: 'Invalid URL' });
      return true;
    }
    
    if (url.startsWith('data:')) {
      try {
        const parts = url.split(',');
        const mimeMatch = parts[0].match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/png';
        const byteString = atob(parts[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mime });
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result, type: mime });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'FileReader error' });
        };
        reader.readAsDataURL(blob);
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      return true;
    }
    
    fetchWithReferer(url, pageUrl)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        console.error('Background fetch error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true;
  }
});

async function fetchWithReferer(imageUrl, pageUrl) {
  let ruleId = null;
  
  try {
    if (pageUrl) {
      ruleId = ruleIdCounter++;
      
      let refererValue = pageUrl;
      try {
        const urlObj = new URL(pageUrl);
        refererValue = urlObj.origin + '/';
      } catch (e) {}
      
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [{
          id: ruleId,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Referer', operation: 'set', value: refererValue },
              { header: 'Origin', operation: 'set', value: '' }
            ]
          },
          condition: {
            urlFilter: imageUrl,
            resourceTypes: ['image', 'xmlhttprequest', 'other']
          }
        }]
      });
    }
    
    const response = await fetch(imageUrl);
    
    if (ruleId !== null) {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [ruleId]
        });
      } catch (e) {}
    }
    
    if (!response.ok) {
      return { success: false, error: 'HTTP ' + response.status };
    }
    
    const blob = await response.blob();
    
    if (!blob || blob.size === 0) {
      return { success: false, error: 'Empty blob' };
    }
    
    let type = blob.type;
    if (!type || !type.startsWith('image/')) {
      const ext = imageUrl.split('.').pop().split('?')[0].toLowerCase();
      const mimeMap = {
        'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
        'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
        'svg': 'image/svg+xml', 'ico': 'image/x-icon'
      };
      type = mimeMap[ext] || 'image/png';
    }
    
    const fixedBlob = new Blob([blob], { type: type });
    
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(fixedBlob);
    });
    
    return { success: true, dataUrl: dataUrl, type: type };
  } catch (error) {
    if (ruleId !== null) {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [ruleId]
        });
      } catch (e) {}
    }
    throw error;
  }
}