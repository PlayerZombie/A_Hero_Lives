(function() {
  let images = [];
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let isMinimized = false;

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'picture-collector';
    
    widget.innerHTML = `
      <div id="picture-collector-header">
        <h3>📷 英雄到来模拟器</h3>
        <button class="btn-minimize" id="minimize-btn">−</button>
      </div>
      <div id="picture-collector-body">
        <div id="drop-zone">
          <div id="drop-zone-icon">📥</div>
          <div>拖拽图片到这里</div>
        </div>
        <div id="image-count">
          已收集: <strong id="count-number">0</strong> 张图片
        </div>
        <div class="button-group">
          <button class="btn btn-copy" id="copy-btn">📋 复制全部</button>
          <button class="btn btn-clear" id="clear-btn">🗑️ 清空</button>
        </div>
        <div id="image-preview"></div>
      </div>
    `;
    
    document.body.appendChild(widget);
    
    setupEventListeners();
    loadImages().catch(err => console.error('初始化失败:', err));
  }

  function setupEventListeners() {
    const widget = document.getElementById('picture-collector');
    const header = document.getElementById('picture-collector-header');
    const dropZone = document.getElementById('drop-zone');
    const copyBtn = document.getElementById('copy-btn');
    const clearBtn = document.getElementById('clear-btn');
    const minimizeBtn = document.getElementById('minimize-btn');

    header.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);

    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);

    document.addEventListener('dragstart', handleDragStart, true);

    copyBtn.addEventListener('click', copyAllImages);
    clearBtn.addEventListener('click', clearImages);
    minimizeBtn.addEventListener('click', toggleMinimize);
  }

  function startDrag(e) {
    if (e.target.id === 'minimize-btn') return;
    
    isDragging = true;
    const widget = document.getElementById('picture-collector');
    const rect = widget.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    widget.style.transition = 'none';
  }

  function drag(e) {
    if (!isDragging) return;
    
    const widget = document.getElementById('picture-collector');
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    
    widget.style.left = x + 'px';
    widget.style.top = y + 'px';
    widget.style.right = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    const widget = document.getElementById('picture-collector');
    widget.style.transition = 'box-shadow 0.3s ease';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('drop-zone');
    dropZone.classList.add('dragover');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('drop-zone');
    dropZone.classList.remove('dragover');
  }

  let pendingDragImageSrc = null;

  function handleDragStart(e) {
    const img = e.target;
    if (img.tagName === 'IMG' && img.src) {
      pendingDragImageSrc = img.src;
      e.dataTransfer.setData('text/plain', img.src);
      e.dataTransfer.setData('text/uri-list', img.src);
      e.dataTransfer.setData('URL', img.src);
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const dropZone = document.getElementById('drop-zone');
    dropZone.classList.remove('dragover');

    const imageUrl = e.dataTransfer.getData('text/plain') || 
                     e.dataTransfer.getData('text/uri-list') ||
                     e.dataTransfer.getData('URL');
    
    if (imageUrl && isValidImageUrl(imageUrl)) {
      showToast('正在下载图片...', 'info');
      await addImage(imageUrl, pendingDragImageSrc);
      pendingDragImageSrc = null;
    } else {
      showToast('无效的图片链接', 'error');
    }
  }

  function isValidImageUrl(url) {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      const validProtocols = ['http:', 'https:', 'data:'];
      if (!validProtocols.includes(urlObj.protocol)) return false;
      
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
      const isImageDataUrl = url.startsWith('data:image');
      const hasImageExtension = imageExtensions.some(ext => 
        url.toLowerCase().includes(ext)
      );
      
      return isImageDataUrl || hasImageExtension || true;
    } catch {
      return false;
    }
  }

  async function addImage(url, domImageSrc) {
    try {
      const exists = images.some(img => img.originalUrl === url);
      if (exists) {
        showToast('图片已存在!', 'error');
        return;
      }
      
      let blob = null;
      
      if (domImageSrc) {
        blob = await extractFromDomImage(domImageSrc);
      }
      
      if (!blob) {
        blob = await fetchImageAsBlob(url);
      }
      
      if (!blob) {
        showToast('图片下载失败', 'error');
        return;
      }
      
      const dataUrl = await blobToDataUrl(blob);
      if (!dataUrl) {
        showToast('图片转换失败', 'error');
        return;
      }
      
      images.push({
        originalUrl: url,
        dataUrl: dataUrl,
        blob: blob
      });
      
      saveImages();
      updateUI();
      showToast('图片已添加!', 'success');
    } catch (err) {
      console.error('添加图片失败:', err);
      showToast('添加图片失败', 'error');
    }
  }

  async function extractFromDomImage(src) {
    try {
      const imgElements = document.querySelectorAll('img[src="' + CSS.escape(src) + '"]');
      for (const imgEl of imgElements) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(imgEl, 0, 0);
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => {
              if (b) resolve(b);
              else reject(new Error('toBlob failed'));
            }, 'image/png');
          });
          if (blob && blob.size > 0) {
            return blob;
          }
        } catch (canvasErr) {
          console.log('Canvas提取失败(可能跨域):', canvasErr);
        }
      }
    } catch (err) {
      console.log('DOM提取失败:', err);
    }
    return null;
  }

  function removeImage(index) {
    images.splice(index, 1);
    saveImages();
    updateUI();
    showToast('图片已删除', 'success');
  }

  function getSourceHost(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function updateUI() {
    const countNumber = document.getElementById('count-number');
    const previewContainer = document.getElementById('image-preview');
    
    countNumber.textContent = images.length;
    
    if (images.length === 0) {
      previewContainer.innerHTML = '<div class="empty-message">暂无图片</div>';
    } else {
      previewContainer.innerHTML = images.map((img, index) => `
        <div class="preview-item" data-index="${index}">
          <div class="preview-header">
            <span class="preview-source">🔗 ${escapeHtml(getSourceHost(img.originalUrl))}</span>
            <div class="preview-actions">
              <button class="copy-single-btn" data-index="${index}" title="复制此图片">📋</button>
              <button class="delete-btn" data-index="${index}" title="删除">×</button>
            </div>
          </div>
          <div class="preview-body collapsed">
            <img src="${escapeHtml(img.dataUrl)}" alt="图片 ${index + 1}">
          </div>
        </div>
      `).join('');
      
      previewContainer.querySelectorAll('.preview-header').forEach(header => {
        header.addEventListener('click', (e) => {
          if (e.target.closest('.copy-single-btn') || e.target.closest('.delete-btn')) return;
          const body = header.nextElementSibling;
          body.classList.toggle('collapsed');
        });
      });
      
      previewContainer.querySelectorAll('.copy-single-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const index = parseInt(e.target.dataset.index);
          await copySingleImage(index);
        });
      });
      
      previewContainer.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(e.target.dataset.index);
          removeImage(index);
        });
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function ensurePngBlob(blob) {
    if (blob.type === 'image/png') return blob;
    return new Blob([blob], { type: 'image/png' });
  }

  async function copySingleImage(index) {
    try {
      const img = images[index];
      if (!img || !img.blob) {
        showToast('复制失败，图片数据不存在', 'error');
        return;
      }
      
      const pngBlob = ensurePngBlob(img.blob);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      showToast('图片已复制到剪贴板!', 'success');
    } catch (err) {
      console.error('复制图片失败:', err);
      showToast('复制失败', 'error');
    }
  }

  async function copyAllImages() {
    if (images.length === 0) {
      showToast('没有可复制的图片', 'error');
      return;
    }
    
    try {
      const copyBtn = document.getElementById('copy-btn');
      copyBtn.disabled = true;
      copyBtn.textContent = '复制中...';
      
      if (images.length === 1) {
        const pngBlob = ensurePngBlob(images[0].blob);
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        copyBtn.disabled = false;
        copyBtn.textContent = '📋 复制全部';
        showToast('已复制 1 张图片!', 'success');
        return;
      }
      
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-99999px';
      container.style.top = '0';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.overflow = 'hidden';
      container.setAttribute('contenteditable', 'true');
      
      images.forEach((img, index) => {
        const imgEl = document.createElement('img');
        imgEl.src = img.dataUrl;
        imgEl.style.display = 'block';
        imgEl.style.maxWidth = '100%';
        container.appendChild(imgEl);
      });
      
      document.body.appendChild(container);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const range = document.createRange();
      range.selectNodeContents(container);
      
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      let copySuccess = false;
      
      const copyHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const htmlParts = images.map(img => {
          return `<img src="${img.dataUrl}">`;
        });
        const html = htmlParts.join('<br>');
        
        e.clipboardData.setData('text/html', html);
        e.clipboardData.setData('text/plain', images.map(img => img.originalUrl).join('\n'));
        
        copySuccess = true;
      };
      
      document.addEventListener('copy', copyHandler, true);
      
      try {
        document.execCommand('copy');
      } catch (execErr) {
        console.error('execCommand copy failed:', execErr);
      }
      
      document.removeEventListener('copy', copyHandler, true);
      
      document.body.removeChild(container);
      selection.removeAllRanges();
      
      copyBtn.disabled = false;
      copyBtn.textContent = '📋 复制全部';
      
      if (copySuccess) {
        showToast(`已复制 ${images.length} 张图片到剪贴板!`, 'success');
      } else {
        const pngBlob = ensurePngBlob(images[images.length - 1].blob);
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob })
        ]);
        showToast('已复制最后1张图片(浏览器不支持多图复制)', 'success');
      }
    } catch (err) {
      console.error('复制失败:', err);
      showToast('复制失败，请重试', 'error');
      const copyBtn = document.getElementById('copy-btn');
      copyBtn.disabled = false;
      copyBtn.textContent = '📋 复制全部';
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function fetchImageAsBlob(url) {
    try {
      if (url.startsWith('data:')) {
        const response = await fetch(url);
        return await response.blob();
      }
      
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { action: 'fetchImage', url: url, pageUrl: window.location.href },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });
        
        if (response && response.success && response.dataUrl) {
          const fetchResponse = await fetch(response.dataUrl);
          return await fetchResponse.blob();
        }
      } catch (bgError) {
        console.log('Background fetch failed, trying direct method:', bgError);
      }
      
      try {
        const response = await fetch(url, {
          mode: 'cors',
          credentials: 'omit'
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.type.startsWith('image/')) {
            return blob;
          }
        }
      } catch (fetchError) {
        console.log('Direct fetch failed, trying canvas method:', fetchError);
      }
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        const timeout = setTimeout(() => {
          reject(new Error('Image load timeout'));
        }, 10000);
        
        img.onload = () => {
          clearTimeout(timeout);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas toBlob failed'));
              }
            }, 'image/png');
          } catch (err) {
            reject(err);
          }
        };
        
        img.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('Image load failed'));
        };
        
        img.src = url;
      });
    } catch (err) {
      console.error('fetchImageAsBlob error:', err);
      return null;
    }
  }

  function clearImages() {
    if (images.length === 0) {
      showToast('没有可清除的图片', 'error');
      return;
    }
    
    const count = images.length;
    images = [];
    saveImages();
    updateUI();
    showToast(`已清除 ${count} 张图片`, 'success');
  }

  function toggleMinimize() {
    const widget = document.getElementById('picture-collector');
    const minimizeBtn = document.getElementById('minimize-btn');
    
    isMinimized = !isMinimized;
    
    if (isMinimized) {
      widget.classList.add('minimized');
      minimizeBtn.textContent = '+';
    } else {
      widget.classList.remove('minimized');
      minimizeBtn.textContent = '−';
    }
  }

  function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 2500);
  }

  function saveImages() {
    try {
      const toSave = images.map(img => ({
        originalUrl: img.originalUrl,
        dataUrl: img.dataUrl
      }));
      chrome.storage.local.set({ pictureCollectorImages: toSave }, () => {
        if (chrome.runtime.lastError) {
          console.error('保存图片失败:', chrome.runtime.lastError);
          showToast('存储空间不足，部分图片可能无法保存', 'error');
        }
      });
    } catch (e) {
      console.error('保存图片失败:', e);
    }
  }

  async function loadImages() {
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.storage.local.get('pictureCollectorImages', (data) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(data);
          }
        });
      });
      
      const saved = result.pictureCollectorImages;
      if (saved && Array.isArray(saved)) {
        images = [];
        
        for (const img of saved) {
          try {
            const response = await fetch(img.dataUrl);
            const blob = await response.blob();
            images.push({
              originalUrl: img.originalUrl,
              dataUrl: img.dataUrl,
              blob: blob
            });
          } catch (err) {
            console.error('恢复图片失败:', err);
          }
        }
        
        updateUI();
      }
    } catch (e) {
      console.error('加载图片失败:', e);
      images = [];
    }
  }

  function onStorageChanged(changes, areaName) {
    if (areaName === 'local' && changes.pictureCollectorImages) {
      const newValue = changes.pictureCollectorImages.newValue;
      if (newValue) {
        (async () => {
          images = [];
          for (const img of newValue) {
            try {
              const response = await fetch(img.dataUrl);
              const blob = await response.blob();
              images.push({
                originalUrl: img.originalUrl,
                dataUrl: img.dataUrl,
                blob: blob
              });
            } catch (err) {
              console.error('同步恢复图片失败:', err);
            }
          }
          updateUI();
        })();
      } else {
        images = [];
        updateUI();
      }
    }
  }

  chrome.storage.onChanged.addListener(onStorageChanged);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();