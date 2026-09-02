
const menuBtn=document.querySelector('.menu-btn'),nav=document.querySelector('.nav');
menuBtn?.addEventListener('click',()=>{
  const open=nav.classList.toggle('open');
  menuBtn.setAttribute('aria-expanded',String(open));
});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));

// Close the mobile/tablet menu when the user interacts anywhere outside it,
// or starts scrolling. The menu button itself keeps its normal toggle behavior.
function closeMobileMenu(){
  if(!nav?.classList.contains('open')) return;
  nav.classList.remove('open');
  menuBtn?.setAttribute('aria-expanded','false');
}

document.addEventListener('pointerdown',e=>{
  if(!nav?.classList.contains('open')) return;
  if(nav.contains(e.target) || menuBtn?.contains(e.target)) return;
  closeMobileMenu();
});

window.addEventListener('scroll',closeMobileMenu,{passive:true});
document.getElementById('year').textContent=new Date().getFullYear();

const archiveEl=document.getElementById('feedArchive');
const filtersEl=document.getElementById('feedFilters');
const statusEl=document.getElementById('feedStatus');
const archiveCountEl=document.getElementById('archiveCount');
const loadMoreBtn=document.getElementById('loadMoreBtn');
const audio=document.getElementById('latestAudio');
const playBtn=document.getElementById('demoPlay');
const progress=document.getElementById('progress');
const timeEl=document.getElementById('time');
const visualDisc=document.getElementById('audioVisual');

let allEpisodes=[];
let activeFilter='all';
const ARCHIVE_PAGE_SIZE=3;
let visibleArchiveCount=ARCHIVE_PAGE_SIZE;

function cleanText(html=''){
  const d=document.createElement('div');
  d.innerHTML=html;
  return (d.textContent||d.innerText||'').replace(/\s+/g,' ').trim();
}
function esc(s=''){
  return String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}
function getAudio(item){
  return item.enclosure?.link || item.enclosure?.url || item.audio || item.link || '';
}
function dateValue(item){
  const d=new Date(item.pubDate||item.published||0);
  return isNaN(d)?0:d.getTime();
}
function formatDate(item){
  const d=new Date(item.pubDate||item.published||0);
  if(isNaN(d)) return '';
  try{
    return new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'long',day:'numeric'}).format(d);
  }catch{
    return d.toLocaleDateString();
  }
}

/* ---------- RSS loading ---------- */

/*
  v14 reads a local JSON file generated server-side by GitHub Actions.
  This avoids browser CORS restrictions and the 10-item rss2json limit.
*/
async function loadGeneratedArchive(){
  const url='data/feeds.json?ts='+Date.now();
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok) throw new Error('Generated archive HTTP '+r.status);

  const data=await r.json();
  const feeds=data.feeds||[];

  const merged=feeds.flatMap(feed=>
    (feed.items||[]).map((item,sourceIndex)=>({
      ...item,
      feedId:item.feedId||feed.id,
      feedLabel:item.feedLabel||feed.label,
      enclosure:{link:item.audio||item.enclosure?.link||''},
      _sourceIndex:sourceIndex
    }))
  );

  return merged.sort((a,b)=>{
    if(a.feedId===b.feedId){
      return a._sourceIndex-b._sourceIndex;
    }
    return dateValue(b)-dateValue(a);
  });
}

/* ---------- Circular gramophone motion ---------- */

function startVisualizer(){
  visualDisc?.classList.add('is-playing');
}

function stopVisualizer(){
  visualDisc?.classList.remove('is-playing');
}

/* ---------- Archive ---------- */

function renderFilters(){
  const feeds=window.GRANDRADIO_FEEDS||[];
  filtersEl.innerHTML=[
    `<button class="feed-filter active" data-filter="all">همه</button>`,
    ...feeds.map(f=>`<button class="feed-filter" data-filter="${esc(f.id)}">${esc(f.label)}</button>`)
  ].join('');

  filtersEl.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
    activeFilter=btn.dataset.filter;
    visibleArchiveCount=ARCHIVE_PAGE_SIZE;
    filtersEl.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));
    renderArchive();
  }));
}

function renderArchive(){
  const items=activeFilter==='all'
    ? allEpisodes
    : allEpisodes.filter(x=>x.feedId===activeFilter);

  if(!items.length){
    archiveEl.innerHTML='';
    statusEl.textContent='فعلاً اثری در این دسته دریافت نشد.';
    statusEl.hidden=false;
    archiveCountEl.textContent='';
    loadMoreBtn.hidden=true;
    return;
  }

  statusEl.hidden=true;

  const visibleItems=items.slice(0,visibleArchiveCount);

  archiveEl.innerHTML=visibleItems.map((item,i)=>{
    const desc=cleanText(item.description||item.content||'').slice(0,150);
    const audioUrl=getAudio(item);

    return `<article class="card feed-card">
      <b class="card-category">${esc(item.feedLabel)}</b>
      <hr>
      <h3>${esc(item.title||'بدون عنوان')}</h3>
      <span>${esc(desc || formatDate(item))}</span>
      <div class="episode-meta">${esc(formatDate(item))}</div>
      ${audioUrl?`<button class="episode-play" data-item-index="${i}">▶︎ شنیدن</button>`:''}
    </article>`;
  }).join('');

  archiveEl.querySelectorAll('.episode-play').forEach(btn=>btn.addEventListener('click',()=>{
    const selectedItem=visibleItems[Number(btn.dataset.itemIndex)];
    if(!selectedItem) return;

    // Update the complete player state: category, title, caption/description,
    // date/meta and audio source — not just the MP3 and title.
    // Source selection + load + play all happen synchronously inside this tap.
    setLatest(selectedItem,true);

    document.getElementById('latest')?.scrollIntoView({behavior:'smooth'});
  }));

  const shown=Math.min(visibleArchiveCount,items.length);
  archiveCountEl.textContent=`نمایش ${shown.toLocaleString('fa-IR')} از ${items.length.toLocaleString('fa-IR')} اثر`;

  if(items.length<=ARCHIVE_PAGE_SIZE){
    loadMoreBtn.hidden=true;
    return;
  }

  loadMoreBtn.hidden=false;

  if(shown>=items.length){
    loadMoreBtn.innerHTML='<span class="archive-toggle-icon" aria-hidden="true">⌃</span><span>جمع کردن آرشیو</span>';
    loadMoreBtn.dataset.mode='collapse';
  }else{
    loadMoreBtn.innerHTML='<span class="archive-toggle-icon" aria-hidden="true">⌄</span><span>نمایش آثار بیشتر</span>';
    loadMoreBtn.dataset.mode='more';
  }
}

loadMoreBtn?.addEventListener('click',()=>{
  const items=activeFilter==='all'
    ? allEpisodes
    : allEpisodes.filter(x=>x.feedId===activeFilter);

  if(loadMoreBtn.dataset.mode==='collapse'){
    visibleArchiveCount=ARCHIVE_PAGE_SIZE;
    renderArchive();
    document.getElementById('archive')?.scrollIntoView({behavior:'smooth',block:'start'});
  }else{
    visibleArchiveCount=Math.min(visibleArchiveCount+ARCHIVE_PAGE_SIZE,items.length);
    renderArchive();
  }
});

/* ---------- Main player ---------- */

function setLatest(item,autoplay=false){
  if(!item) return;

  document.getElementById('latestCategory').textContent=item.feedLabel;
  document.getElementById('latestTitle').textContent=item.title||'آخرین اثر';

  const desc=cleanText(item.description||item.content||'');
  document.getElementById('latestDescription').textContent=
    desc.slice(0,230)||'برای شنیدن، دکمه پخش را بزنید.';

  document.getElementById('latestMeta').textContent=
    [item.feedLabel,formatDate(item)].filter(Boolean).join(' • ');

  setPlayer(getAudio(item),item.title||'',autoplay);
}

function setPlayer(url,title='',autoplay=false){
  if(!audio || !url) return;

  const currentSrc=audio.getAttribute('src')||'';

  if(currentSrc!==url){
    audio.pause();
    audio.removeAttribute('src');
    audio.src=url;
  }

  if(title) document.getElementById('latestTitle').textContent=title;

  playBtn.textContent='▶︎';
  progress.style.width='0%';
  timeEl.textContent='00:00';
  stopVisualizer();

  if(autoplay){
    const playPromise=audio.play();
    if(playPromise?.catch){
      playPromise.catch(err=>{
        console.warn('Audio autoplay from archive tap failed:',err);
      });
    }
  }
}

playBtn?.addEventListener('click',()=>{
  if(!audio?.getAttribute('src')) return;

  if(audio.paused){
    const playPromise=audio.play();
    if(playPromise?.catch){
      playPromise.catch(err=>console.warn('Audio play failed:',err));
    }
  }else{
    audio.pause();
  }
});

audio?.addEventListener('play',()=>{
  playBtn.textContent='Ⅱ';
  startVisualizer();
});

audio?.addEventListener('pause',()=>{
  playBtn.textContent='▶︎';
  stopVisualizer();
});

audio?.addEventListener('ended',()=>{
  playBtn.textContent='▶︎';
  stopVisualizer();
});



audio?.addEventListener('timeupdate',()=>{
  if(!audio.duration) return;

  progress.style.width=((audio.currentTime/audio.duration)*100)+'%';

  const m=Math.floor(audio.currentTime/60);
  const s=Math.floor(audio.currentTime%60);
  timeEl.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
});

document.querySelector('.track')?.addEventListener('click',e=>{
  if(!audio?.duration) return;

  const rect=e.currentTarget.getBoundingClientRect();
  audio.currentTime=((e.clientX-rect.left)/rect.width)*audio.duration;
});

/* ---------- Init ---------- */

(async function initFeeds(){
  renderFilters();

  try{
    allEpisodes=await loadGeneratedArchive();

    if(allEpisodes.length){
      setLatest(allEpisodes[0]);
      renderArchive();
      console.info('GrandRadio full archive items loaded:',allEpisodes.length);
      return;
    }

    throw new Error('Generated archive is empty');
  }catch(err){
    console.warn('Generated archive unavailable:',err);

    statusEl.hidden=false;

    if(location.protocol==='file:'){
      statusEl.textContent='برای دیدن آرشیو کامل، این نسخه باید روی GitHub Pages اجرا شود؛ GitHub Actions فید کامل شنوتو را دریافت می‌کند.';
      document.getElementById('latestTitle').textContent='نسخه آماده انتشار';
      document.getElementById('latestDescription').textContent='پیش‌نمایش محلی با file:// نمی‌تواند فایل تولیدشده توسط GitHub Actions را دریافت کند.';
    }else{
      statusEl.textContent='آرشیو هنوز ساخته نشده است. در GitHub بخش Actions، workflow «Update Shenoto archive» را یک‌بار اجرا کنید.';
      document.getElementById('latestTitle').textContent='در حال آماده‌سازی آرشیو';
      document.getElementById('latestDescription').textContent='پس از اجرای workflow، کل RSS شنوتو اینجا نمایش داده می‌شود.';
    }

    archiveCountEl.textContent='';
    loadMoreBtn.hidden=true;
  }
})();

// Center "Latest Story" player when navigating to #latest
document.querySelectorAll('a[href="#latest"]').forEach(link => {
  link.addEventListener('click', function (e) {
    e.preventDefault();

    const target =
      document.querySelector('#latest .feature') ||
      document.getElementById('latest');

    target.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    history.replaceState(null, '', '#latest');
  });
});
