const ITEMS=[
  ['放大镜','私下查看当前这一发是实弹还是空弹。只有你看得见结果。'],
  ['香烟','恢复 1 点生命，不能超过上限。满血时不能抽。'],
  ['啤酒','退出当前弹药，双方都看得见退出的是实弹还是空弹。'],
  ['手铐','跳过对手的下一个回合。同一段连续行动里只能成功铐一次。'],
  ['锯子','下一发实弹伤害变成 2 点。无论打谁、打空打实，开枪后都会消耗。'],
  ['肾上腺素','注射后立刻偷走对手一件合法道具并使用。注射后不能取消。黑夜没有这件道具。'],
  ['过期药物','一半概率回 2 血，一半扣 1 血。满血不能吃；失败可能直接致死。'],
  ['一次性手机','私下得知后续某一发的位置和类型。至少还剩 2 发才能打。'],
];

function markup(){
  return `<div id="tutorial" class="tutorial hidden" role="dialog" aria-modal="true" aria-labelledby="tutorialTitle">
  <div class="tutorial-box" tabindex="-1">
    <p class="tutorial-kicker">HOW TO PLAY</p>
    <h2 id="tutorialTitle">暗膛协议</h2>
    <section>
      <h3>怎么开枪</h3>
      <p>枪里混装实弹和空弹。弹仓只公开发数和实弹 / 空弹数量，顺序要用道具才能私下知道。</p>
      <ul>
        <li>点枪瞄准，再点铭牌：打对面，或打自己。</li>
        <li>实弹造成 1 点伤害；锯子会让下一发实弹变成 2 点。</li>
        <li>空弹不造成伤害。对自己打出空弹，你继续行动。</li>
        <li>其他射击都会把回合交给对手。</li>
        <li>开局双方生命相同。练习和黑夜是 2–6 点，挑战是 6–10 点。谁先把对方打到 0，谁赢。</li>
      </ul>
    </section>
    <section>
      <h3>道具</h3>
      <p>道具不结束回合，可以连用再开枪。每人最多 8 件，开局各 2 件；弹仓打空重新装填时双方再补 1–3 件。桌上的种类公开，放大镜和手机的结果只有使用者能看见。</p>
      <ul class="tutorial-items">${ITEMS.map(([name,help])=>`<li><b>${name}</b><span>${help}</span></li>`).join('')}</ul>
    </section>
    <section>
      <h3>模式</h3>
      <ul>
        <li><b>练习模式</b>灯亮着，整张牌桌都看得见。</li>
        <li><b>黑夜模式</b>只能看清自己这一侧；这一局里没有肾上腺素。</li>
        <li><b>挑战模式</b>每轮只装 2–4 发，生命 6–10。每次换弹后 60% 白天、40% 黑夜。天黑时桌上剩余的肾上腺素会翻下去。</li>
        <li><b>好友房</b>双人对决，没有 AI。先手随机。每步 90 秒，超时会强制朝对手开枪。</li>
      </ul>
    </section>
    <button type="button" class="primary" id="tutorialClose">回到牌桌</button>
  </div>
</div>`;
}

export function bindTutorial(){
  if(!document.getElementById('tutorial'))document.body.insertAdjacentHTML('beforeend',markup());
  const root=document.getElementById('tutorial');
  const close=()=>root.classList.add('hidden');
  const open=()=>{
    document.getElementById('notice')?.classList.add('hidden');
    root.classList.remove('hidden');
    const box=root.querySelector('.tutorial-box');
    if(box){box.scrollTop=0;box.focus();}
  };
  for(const button of document.querySelectorAll('[data-tutorial]'))button.addEventListener('click',open);
  document.getElementById('tutorialClose')?.addEventListener('click',close);
  root.addEventListener('click',event=>{if(event.target===root)close();});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||root.classList.contains('hidden'))return;
    event.preventDefault();
    close();
  },true);
  return {open,close};
}
