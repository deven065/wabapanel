(function() {
  var c = window.__wabaWidget;
  if (!c) return;

  var css = document.createElement('style');
  css.textContent = [
    '.waba-widget-btn{position:fixed;z-index:9999;cursor:pointer;border:none;border-radius:50%;width:60px;height:60px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.3s}',
    '.waba-widget-btn:hover{transform:scale(1.1)}',
    '.waba-widget-btn svg{width:28px;height:28px;fill:white}',
    '.waba-widget-popup{position:fixed;z-index:9999;width:350px;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.12);display:none;flex-direction:column;background:#fff}',
    '.waba-widget-popup.open{display:flex}',
    '.waba-widget-header{padding:16px;color:#fff}',
    '.waba-widget-header h4{margin:0;font-size:15px;font-weight:600}',
    '.waba-widget-header p{margin:4px 0 0;font-size:12px;opacity:0.8}',
    '.waba-widget-body{padding:16px;min-height:100px}',
    '.waba-widget-welcome{background:#f0f0f0;border-radius:12px;padding:10px 14px;font-size:14px;color:#333;margin-bottom:12px}',
    '.waba-widget-input{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #eee}',
    '.waba-widget-input input{flex:1;border:1px solid #ddd;border-radius:20px;padding:8px 14px;font-size:13px;outline:none}',
    '.waba-widget-input button{border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.waba-widget-input button svg{width:18px;height:18px;fill:white}',
    '.waba-widget-close{position:absolute;top:12px;right:12px;background:none;border:none;color:rgba(255,255,255,0.8);font-size:20px;cursor:pointer;line-height:1}'
  ].join('\n');
  document.head.appendChild(css);

  var pos = c.position === 'bottom-left' ? 'left:20px' : 'right:20px';
  var popPos = c.position === 'bottom-left' ? 'left:20px' : 'right:20px';

  // Create button
  var btn = document.createElement('button');
  btn.className = 'waba-widget-btn';
  btn.style.cssText = 'bottom:20px;' + pos + ';background:' + (c.color || '#25D366');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.67-1.388A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.22 0-4.293-.663-6.015-1.804l-.42-.275-3.088.918.847-3.103-.282-.437A9.951 9.951 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';
  document.body.appendChild(btn);

  // Create popup
  var popup = document.createElement('div');
  popup.className = 'waba-widget-popup';
  popup.style.cssText = 'bottom:90px;' + popPos;
  popup.innerHTML = [
    '<div class="waba-widget-header" style="background:' + (c.color || '#25D366') + ';position:relative">',
    '<button class="waba-widget-close" onclick="this.parentElement.parentElement.classList.remove(\'open\')">&times;</button>',
    '<h4>' + (c.title || 'Chat with us') + '</h4>',
    '<p>' + (c.subtitle || 'We typically reply within minutes') + '</p>',
    '</div>',
    '<div class="waba-widget-body">',
    '<div class="waba-widget-welcome">' + (c.welcome || 'Hi! How can we help?') + '</div>',
    '</div>',
    '<div class="waba-widget-input">',
    '<input type="text" placeholder="Type a message..." id="waba-msg-input">',
    '<button style="background:' + (c.color || '#25D366') + '" onclick="window.__wabaSend()"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>',
    '</div>'
  ].join('');
  document.body.appendChild(popup);

  btn.onclick = function() { popup.classList.toggle('open'); };

  window.__wabaSend = function() {
    var input = document.getElementById('waba-msg-input');
    var msg = input.value.trim();
    if (!msg || !c.phone) return;
    var url = 'https://wa.me/' + c.phone + '?text=' + encodeURIComponent(msg);
    window.open(url, '_blank');
    input.value = '';
  };

  if (c.autoOpen) {
    setTimeout(function() { popup.classList.add('open'); }, (c.autoOpenDelay || 5) * 1000);
  }
})();
