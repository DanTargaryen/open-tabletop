// One manual for solo battles and friend rooms.
export function createTutorial({online=false,onOpen=()=>{},onClose=()=>{}}={}){
  const dialog=document.createElement('dialog');
  dialog.className='steel-tutorial';dialog.setAttribute('aria-labelledby','steel-tutorial-title');
  dialog.innerHTML=`<header><span>钢铁远征 · 全模式通用</span><h2 id="steel-tutorial-title">先移动，再瞄准，最后开火。</h2><p>轮到你时行动，击毁敌方全部坦克就获胜。</p></header>
    <div class="steel-tutorial-grid">
      <article><b>01 · 找位置</b><h3>A / D 左右移动</h3><p>移动消耗燃料，自己的新回合会补满。停下来，镜头会拉远，让你看见敌人。</p></article>
      <article><b>02 · 拉圆盘</b><h3>向后拉，往反方向打</h3><p>拖动左下瞄准盘：<strong>往左下拉 ↙，炮弹往右上飞 ↗</strong>。拉得越远，力度越大。</p><small>也可用 W / S 调方向，Q / E 调力度。</small></article>
      <article><b>03 · 选弹开火</b><h3>点“开火”或按空格</h3><p>底部点选炮弹，也可按 1–7 切换。<strong>松开瞄准盘不会发射</strong>；确认后再开火，随后轮到下一辆坦克。</p></article>
    </div>
    <div class="steel-tutorial-tips"><p><b>打不准？</b>对照上一发留下的轨迹圆点微调。打短了加力度，打远了减力度；山坡挡住就抬高弹道。</p><p><b>捡补给</b>每 3 次行动会有空投，落地后靠近自动拾取：恢复 30 生命，或获得一发稀有炮弹。</p><p><b>解锁弹药</b>开局用无限校准弹；第 3 轮开二档、第 5 轮开三档。四档靠补给获得，第 3 轮起可用。</p></div>
    <footer><p>${online?'好友房不会暂停，回合倒计时继续。':'查看教程时，单人战斗暂停。'}<br>按 Esc 或点击右侧按钮关闭。</p><button type="button" autofocus>知道了，返回游戏</button></footer>`;
  document.body.append(dialog);
  let previousFocus=null;
  const close=()=>{if(!dialog.open)return;dialog.close();onClose();if(previousFocus?.isConnected)previousFocus.focus();};
  dialog.querySelector('button').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  // Capture before game hotkeys: reading must never move a tank or fire a shell.
  window.addEventListener('keydown',event=>{
    if(!dialog.open)return;
    event.stopImmediatePropagation();
    if(event.code==='Escape'){event.preventDefault();close();}
  },true);
  window.addEventListener('keyup',event=>{if(dialog.open)event.stopImmediatePropagation();},true);
  return {get isOpen(){return dialog.open;},open(){if(dialog.open)return;previousFocus=document.activeElement;onOpen();dialog.showModal();},close};
}
